import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation } from 'wouter'
import { useGetMe } from '@workspace/api-client-react'
import { Shell } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import {
  playWhatsAppIncomingSound,
  playWhatsAppOutgoingSound
} from '@/lib/sound'
import {
  updateAppBadge,
  showWhatsAppChatNotification,
  requestPushNotificationPermission,
  canUsePushNotifications
} from '@/lib/push-notifications'
import {
  MessageSquare,
  Send,
  Paperclip,
  Smile,
  Search,
  Check,
  CheckCheck,
  Clock,
  User,
  Calendar,
  Building2,
  Coffee,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Music,
  RefreshCw,
  Pin,
  PinOff,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRightCircle,
  Info,
  Wifi,
  MapPin,
  AlertCircle,
  X,
  Download,
  Smartphone,
  FileCheck,
  Maximize2,
  Minimize2,
  Bot,
  Sparkles,
  Pause,
  Play,
  Mic,
  Square,
  Camera,
  Upload,
  Bell,
  BellOff,
  Zap,
  CheckCircle2,
  ArrowLeft
} from 'lucide-react'

export interface ChatMessage {
  id: string
  fromMe: boolean
  sender?: 'guest' | 'operator' | 'system'
  senderName?: string
  text: string
  type?: 'text' | 'document' | 'image' | 'audio' | 'video' | 'location' | 'buttons'
  mediaUrl?: string
  fileName?: string
  caption?: string
  buttons?: Array<{ id: string; label: string; url?: string; phone?: string }>
  timestamp: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
  triggerEvent?: string
  templateTitle?: string
  messageId?: string
}

export interface ChatConversation {
  phone: string
  formattedPhone: string
  name: string
  reservationCode?: string
  reservationId?: number
  flatNumber?: string
  status?: string
  unreadCount: number
  pinned: boolean
  channel?: string
  aiPaused?: boolean
  aiPausedReason?: string
  lastMessage?: {
    text: string
    timestamp: string
    fromMe: boolean
    sender: string
    type: string
  }
  reservation?: any
  otherReservations?: any[]
}

export interface SofiaSuggestedReply {
  id: string
  label: string
  text: string
  source?: string
  confidence?: string
}

export interface SofiaSuggestedAction {
  id: string
  actionType: string
  title: string
  description: string
  icon: string
  badge: string
  priority?: 'high' | 'medium' | 'low'
  payload: Record<string, any>
}

export interface SofiaDynamicQuickButton {
  id: string
  icon: string
  label: string
  topic?: string
  highlighted?: boolean
  priorityScore?: number
  text: string
  mediaType?: 'document' | 'image'
  mediaUrl?: string
  fileName?: string
}

export interface SofiaRealtimeAssistance {
  success: boolean
  phone: string
  stayStage: string
  stayStageLabel: string
  detectedTopics: string[]
  lastGuestMessage: string
  lastGuestMessageAt: string | null
  suggestedReplies: SofiaSuggestedReply[]
  suggestedActions: SofiaSuggestedAction[]
  dynamicQuickButtons: SofiaDynamicQuickButton[]
}

const EMOJI_LIST = [
  '👋', '😊', '🏨', '🔑', '🥐', '☕', '🚗', '⭐', '📄', '✅', '❤️', '🕒', '📍', '📱', '✨', '👍', '🙏', '🏖️', '🚪', '🛎️'
]

const STAGE_BADGE_MAP: Record<string, { icon: string; color: string }> = {
  checkin_hoje: { icon: '🚀', color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800' },
  em_estadia: { icon: '🏨', color: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800' },
  checkout_hoje: { icon: '🚪', color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800' },
  reserva_futura: { icon: '📅', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800' },
  checkout_concluido: { icon: '⭐', color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800' },
  sem_reserva: { icon: '💬', color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' }
}

const TOPIC_LABELS: Record<string, string> = {
  financeiro: '💳 Financeiro',
  checkin: '🔑 Check-in',
  garagem: '🚗 Garagem',
  cafe: '🥐 Café',
  wifi: '📶 Wi-Fi',
  governanca: '🧹 Governança',
  manutencao: '🔧 Manutenção',
  checkout: '🚪 Check-out',
  localizacao: '📍 Localização',
  nfse: '🧾 NFS-e',
  cotacao: '💰 Cotação'
}

function getPaymentInfo(res: any) {
  if (!res) return { label: 'Pendente', className: 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' }
  const rawStatus = String(res.paymentStatus || res.payment_status || '').toLowerCase().trim()
  const totalAmount = Number(res.totalAmount ?? res.total_amount) || 0
  const paidAmount = Number(res.paidAmount ?? res.paid_amount) || 0

  const isPaid = rawStatus === 'pago' || rawStatus === 'pago_total' || (paidAmount >= totalAmount && totalAmount > 0)
  if (isPaid) {
    return {
      label: 'Pago ✓',
      className: 'bg-emerald-600 text-white hover:bg-emerald-700 border-transparent'
    }
  }
  if (rawStatus === 'sinal_pago' || rawStatus === 'parcial' || (paidAmount > 0 && paidAmount < totalAmount)) {
    return {
      label: 'Sinal Pago',
      className: 'border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300'
    }
  }
  return {
    label: 'Pendente',
    className: 'border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
  }
}

function getReservationStatusInfo(status?: string) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'confirmada' || s === 'confirmed' || s === 'checked_in' || s === 'checkedin' || s === 'in_house' || s === 'checkin') {
    return {
      label: s === 'checked_in' || s === 'checkedin' || s === 'checkin' ? 'Check-in Realizado' : 'Confirmada',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700'
    }
  }
  if (s === 'pre_reserva' || s === 'pendente') {
    return {
      label: s === 'pre_reserva' ? 'Pré-Reserva' : 'Pendente',
      className: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700'
    }
  }
  if (s === 'checkout' || s === 'checked_out') {
    return {
      label: 'Check-out',
      className: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    }
  }
  if (s === 'cancelada' || s === 'cancelled' || s === 'cancelado') {
    return {
      label: 'Cancelada',
      className: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-700'
    }
  }
  return {
    label: status || 'Confirmada',
    className: 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
  }
}

export default function WhatsappChat() {
  const [, setLocation] = useLocation()
  const { data: user } = useGetMe()
  const { toast } = useToast()

  // Standalone PWA / Fullscreen App Mode detection
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    if (params.get('standalone') === '1') return true
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    if ((window.navigator as any)?.standalone === true) return true
    if (localStorage.getItem('cf_whatsapp_standalone_mode') === '1') return true
    return false
  })

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null)
  const [installModalOpen, setInstallModalOpen] = useState(false)

  // Sound & Notifications Preferences
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('cf_whatsapp_sound_muted') !== '1'
  })
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })

  // In-App Floating WhatsApp Notification Banner (when message arrives on another chat)
  const [floatingBanner, setFloatingBanner] = useState<{
    phone: string
    name: string
    flatNumber?: string
    text: string
    timestamp: string
  } | null>(null)

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [activePhone, setActivePhone] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [selectedResCode, setSelectedResCode] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'active' | 'today' | 'pinned'>('all')

  // Sofia Real-Time Active Assistant State
  const [sofiaAssist, setSofiaAssist] = useState<SofiaRealtimeAssistance | null>(null)
  const [loadingSofiaAssist, setLoadingSofiaAssist] = useState(false)
  const [sofiaPanelExpanded, setSofiaPanelExpanded] = useState<boolean>(true)
  const [executingActionId, setExecutingActionId] = useState<string | null>(null)
  const [completedActionIds, setCompletedActionIds] = useState<Record<string, boolean>>({})

  // UI Panels
  const [showDossier, setShowDossier] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1440
    }
    return false
  })
  const [isMobileListOpen, setIsMobileListOpen] = useState(true)

  // Resizable 3-Column Widths
  const [contactsWidth, setContactsWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('corpflats_chat_contacts_width')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= 240 && parsed <= 450) return parsed
      }
      if (window.innerWidth < 1440) return 290
    }
    return 310
  })

  const [dossierWidth, setDossierWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('corpflats_chat_dossier_width')
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= 240 && parsed <= 420) return parsed
      }
      if (window.innerWidth < 1440) return 280
    }
    return 300
  })

  const [isDraggingContacts, setIsDraggingContacts] = useState(false)
  const [isDraggingDossier, setIsDraggingDossier] = useState(false)

  // Message Input State & Expanded Editor Mode
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [isExpandedEditor, setIsExpandedEditor] = useState(false)

  // Direct File / Camera / Paste / Voice Recorder States
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [pendingUpload, setPendingUpload] = useState<{
    fileBase64: string
    fileName: string
    mediaType: 'image' | 'document' | 'audio'
    caption: string
  } | null>(null)

  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<any>(null)

  // Z-API Status
  const [zapiStatus, setZapiStatus] = useState<any>(null)

  // New Chat Dialog
  const [newChatModalOpen, setNewChatModalOpen] = useState(false)
  const [pmsReservations, setPmsReservations] = useState<any[]>([])
  const [loadingPmsRes, setLoadingPmsRes] = useState(false)
  const [pmsResSearch, setPmsResSearch] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualInitialMsg, setManualInitialMsg] = useState('')

  // Attachment Dialog (URL fallback)
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [attachType, setAttachType] = useState<'image' | 'document'>('image')
  const [attachUrl, setAttachUrl] = useState('')
  const [attachName, setAttachName] = useState('')
  const [attachCaption, setAttachCaption] = useState('')

  // Message Rectification / Ensinar Sofia Dialog
  const [correctModalOpen, setCorrectModalOpen] = useState(false)
  const [selectedMsgForCorrection, setSelectedMsgForCorrection] = useState<ChatMessage | null>(null)
  const [correctionGuideline, setCorrectionGuideline] = useState('')
  const [rectificationText, setRectificationText] = useState('')
  const [sendToGuest, setSendToGuest] = useState(true)
  const [savingCorrection, setSavingCorrection] = useState(false)

  // Refs for tracking incoming messages and scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastSeenMsgMapRef = useRef<Record<string, string>>({})
  const initialConversationsLoadedRef = useRef<boolean>(false)
  const lastSofiaGuestMsgKeyRef = useRef<string>('')
  const activePhoneRef = useRef<string | null>(null)
  const soundEnabledRef = useRef<boolean>(soundEnabled)

  useEffect(() => {
    activePhoneRef.current = activePhone
  }, [activePhone])

  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  // PWA beforeinstallprompt listener & Service Worker message listener
  useEffect(() => {
    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault()
      setDeferredInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'WHATSAPP_NOTIFICATION_CLICK' && event.data?.phone) {
        const clean = String(event.data.phone).replace(/\D/g, '')
        if (clean) {
          setActivePhone(clean)
          setIsMobileListOpen(false)
          markAsRead(clean)
        }
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSwMessage)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
    }
  }, [])

  // Toggle Standalone App Mode
  const toggleStandaloneMode = (enable: boolean) => {
    setIsStandaloneApp(enable)
    try {
      if (enable) {
        localStorage.setItem('cf_whatsapp_standalone_mode', '1')
      } else {
        localStorage.removeItem('cf_whatsapp_standalone_mode')
      }
    } catch {}
  }

  // Trigger Native Install or Open Install Guide Modal
  const handleInstallAppClick = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt()
        const choice = await deferredInstallPrompt.userChoice
        if (choice?.outcome === 'accepted') {
          setDeferredInstallPrompt(null)
          toggleStandaloneMode(true)
          toast({ title: 'CF WhatsApp instalado com sucesso! 📲' })
          return
        }
      } catch {}
    }
    setInstallModalOpen(true)
  }

  // Toggle Sound & Request Notification Permission
  const handleToggleSoundAndNotif = async () => {
    if ( canUsePushNotifications() && Notification.permission === 'default') {
      const perm = await requestPushNotificationPermission()
      setNotifPermission(perm)
      if (perm === 'granted') {
        toast({
          title: 'Notificações WhatsApp Ativadas! 🔔',
          description: 'Você receberá alertas com som, vibração e botão de resposta rápida.'
        })
      }
    }
    const nextSound = !soundEnabled
    setSoundEnabled(nextSound)
    try {
      localStorage.setItem('cf_whatsapp_sound_muted', nextSound ? '0' : '1')
    } catch {}
    if (nextSound) {
      playWhatsAppIncomingSound(true)
    }
  }

  // Update App Badge and Document Title whenever unread count changes
  useEffect(() => {
    const totalUnread = conversations.reduce((acc, c) => acc + (Number(c.unreadCount) || 0), 0)
    updateAppBadge(totalUnread)
    if (typeof document !== 'undefined') {
      document.title = totalUnread > 0 ? `(${totalUnread}) CF WhatsApp` : 'CF WhatsApp • CorpFlats'
    }
  }, [conversations])

  // Auto-resize dinâmico do Textarea de mensagens
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      const minH = isExpandedEditor ? 140 : 42
      const maxH = isExpandedEditor ? 360 : 180
      const scrollH = textareaRef.current.scrollHeight
      const targetH = Math.min(Math.max(scrollH, minH), maxH)
      textareaRef.current.style.height = `${targetH}px`
    }
  }, [inputMessage, isExpandedEditor])

  // Handlers para redimensionar colunas
  const startResizingContacts = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingContacts(true)
    const startX = e.clientX
    const startWidth = contactsWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.max(260, Math.min(560, startWidth + deltaX))
      setContactsWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsDraggingContacts(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setContactsWidth(current => {
        try { localStorage.setItem('corpflats_chat_contacts_width', String(current)) } catch {}
        return current
      })
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const startResizingDossier = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingDossier(true)
    const startX = e.clientX
    const startWidth = dossierWidth

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.max(260, Math.min(580, startWidth + deltaX))
      setDossierWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsDraggingDossier(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDossierWidth(current => {
        try { localStorage.setItem('corpflats_chat_dossier_width', String(current)) } catch {}
        return current
      })
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Check URL query parameters on mount (e.g. ?phone=5522997124021)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const phoneParam = params.get('phone')
    if (phoneParam) {
      const cleanPhone = phoneParam.replace(/\D/g, '')
      if (cleanPhone) {
        setActivePhone(cleanPhone)
        setIsMobileListOpen(false)
      }
    }
  }, [])

  // Fetch Z-API connection status
  const fetchZapiStatus = async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) {
        const data = await res.json()
        setZapiStatus(data)
      }
    } catch {}
  }

  // Fetch Sofia Real-Time Assistance for Active Conversation
  const fetchSofiaAssistance = useCallback(async (phone: string, options?: { draftText?: string; resCode?: string | null; skipLlm?: boolean; silent?: boolean }) => {
    if (!phone) return
    if (!options?.silent) setLoadingSofiaAssist(true)
    try {
      const res = await fetch(`/api/whatsapp/chat/${phone}/sofia-assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftText: options?.draftText || '',
          reservationCode: options?.resCode || selectedResCode || null,
          skipLlm: Boolean(options?.skipLlm)
        })
      })
      if (res.ok) {
        const data: SofiaRealtimeAssistance = await res.json()
        setSofiaAssist(data)
      }
    } catch {} finally {
      if (!options?.silent) setLoadingSofiaAssist(false)
    }
  }, [selectedResCode])

  // Fetch Conversations list + Detect New Incoming Messages for WhatsApp-Style Notifications
  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoadingConversations(true)
    try {
      const res = await fetch('/api/whatsapp/chat/conversations?limit=80')
      if (res.ok) {
        const data = await res.json()
        const list: ChatConversation[] = data.conversations || []
        setConversations(list)

        const totalUnread = list.reduce((acc, c) => acc + (Number(c.unreadCount) || 0), 0)

        if (!initialConversationsLoadedRef.current) {
          for (const c of list) {
            if (c.lastMessage) {
              lastSeenMsgMapRef.current[c.phone] = `${c.lastMessage.timestamp || ''}_${c.lastMessage.text || ''}`
            }
          }
          initialConversationsLoadedRef.current = true
        } else {
          for (const c of list) {
            if (!c.lastMessage) continue
            const sig = `${c.lastMessage.timestamp || ''}_${c.lastMessage.text || ''}`
            const prevSig = lastSeenMsgMapRef.current[c.phone]
            lastSeenMsgMapRef.current[c.phone] = sig

            if (prevSig && prevSig !== sig && !c.lastMessage.fromMe) {
              const isCurrentActive = activePhoneRef.current === c.phone && !document.hidden
              if (soundEnabledRef.current) {
                playWhatsAppIncomingSound(isCurrentActive)
              }

              // If message arrived in another chat or tab is in background, fire native notification + floating banner
              if (activePhoneRef.current !== c.phone || document.hidden) {
                showWhatsAppChatNotification({
                  phone: c.phone,
                  senderName: c.name || c.formattedPhone || c.phone,
                  flatNumber: c.flatNumber,
                  reservationCode: c.reservationCode,
                  messageText: c.lastMessage.text || '[Mídia recebida]',
                  unreadCount: totalUnread || 1
                })
              }

              if (activePhoneRef.current !== c.phone) {
                setFloatingBanner({
                  phone: c.phone,
                  name: c.name || c.formattedPhone || c.phone,
                  flatNumber: c.flatNumber,
                  text: c.lastMessage.text || '📎 Mídia recebida',
                  timestamp: c.lastMessage.timestamp
                })
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Erro ao carregar conversas', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (!silent) setLoadingConversations(false)
    }
  }, [toast])

  // Auto-hide floating banner after 7 seconds
  useEffect(() => {
    if (!floatingBanner) return
    const timer = setTimeout(() => setFloatingBanner(null), 7000)
    return () => clearTimeout(timer)
  }, [floatingBanner])

  // Fetch Active Conversation Messages
  const fetchActiveMessages = useCallback(async (phone: string, silent = false, reservationCode?: string) => {
    if (!silent) setLoadingMessages(true)
    try {
      const activeCode = reservationCode || selectedResCode
      const queryParam = activeCode ? `?reservationCode=${encodeURIComponent(activeCode)}` : ''
      const res = await fetch(`/api/whatsapp/chat/conversations/${phone}${queryParam}`)
      if (res.ok) {
        const data = await res.json()
        if (data.conversation) {
          const reservation = data.reservation || data.conversation.reservation || null
          const otherReservations = data.otherReservations || data.conversation.otherReservations || []
          setActiveConversation({
            ...data.conversation,
            reservation,
            otherReservations
          })
          const msgs: ChatMessage[] = data.conversation.messages || []
          setMessages(msgs)

          // Check if the latest guest message changed -> refresh Sofia Real-Time Assistant!
          const lastGuestMsg = [...msgs].reverse().find(m => !m.fromMe)
          const guestKey = `${phone}_${lastGuestMsg?.id || lastGuestMsg?.timestamp || 'empty'}_${activeCode || ''}`
          if (lastSofiaGuestMsgKeyRef.current !== guestKey) {
            lastSofiaGuestMsgKeyRef.current = guestKey
            fetchSofiaAssistance(phone, { resCode: activeCode, silent: silent })
          }
        }
      }
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Erro ao carregar histórico', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }, [selectedResCode, fetchSofiaAssistance, toast])

  // Mark conversation as read
  const markAsRead = async (phone: string) => {
    try {
      await fetch(`/api/whatsapp/chat/${phone}/read`, { method: 'POST' })
      setConversations(prev => prev.map(c => c.phone === phone ? { ...c, unreadCount: 0 } : c))
    } catch {}
  }

  // Pin / Unpin conversation
  const togglePin = async (e: React.MouseEvent, phone: string) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/whatsapp/chat/${phone}/pin`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setConversations(prev => prev.map(c => c.phone === phone ? { ...c, pinned: data.pinned } : c))
        toast({ title: data.pinned ? 'Conversa fixada no topo' : 'Conversa desafixada' })
      }
    } catch {}
  }

  const [loadingAiSuggestion, setLoadingAiSuggestion] = useState(false)
  const [togglingAi, setTogglingAi] = useState(false)

  // Alternar IA Ativa / Pausada na conversa ativa
  const handleToggleAi = async () => {
    if (!activePhone) return
    try {
      setTogglingAi(true)
      const isCurrentlyPaused = Boolean(activeConversation?.aiPaused)
      const res = await fetch(`/api/whatsapp/chat/${activePhone}/ai-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiPaused: !isCurrentlyPaused })
      })
      if (res.ok) {
        const data = await res.json()
        setActiveConversation(prev => prev ? { ...prev, aiPaused: data.aiPaused, aiPausedReason: data.aiPausedReason } : null)
        setConversations(prev => prev.map(c => c.phone === activePhone ? { ...c, aiPaused: data.aiPaused, aiPausedReason: data.aiPausedReason } : c))
        toast({
          title: data.aiPaused ? 'Auto-Resposta Pausada (Sofia Modo Assistente Ativo) ⏸️' : 'Auto-Resposta da Sofia Ativada 🤖',
          description: data.aiPaused
            ? 'Você está no controle manual, mas a Sofia continuará sugerindo respostas e ações em tempo real!'
            : 'A Sofia responderá automaticamente novas mensagens deste hóspede.'
        })
      }
    } catch (err: any) {
      toast({ title: 'Erro ao alternar IA', description: err.message, variant: 'destructive' })
    } finally {
      setTogglingAi(false)
    }
  }

  // Copiloto: Sugerir Resposta com IA (ou refinar rascunho atual)
  const handleSuggestWithAi = async () => {
    if (!activePhone) return
    try {
      setLoadingAiSuggestion(true)
      await fetchSofiaAssistance(activePhone, { draftText: inputMessage, resCode: selectedResCode })
      setSofiaPanelExpanded(true)
      const res = await fetch(`/api/whatsapp/chat/${activePhone}/ai-suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage })
      })
      const data = await res.json()
      if (data.success && data.suggestion) {
        setInputMessage(data.suggestion)
        toast({
          title: 'Sugestão da Sofia Carregada! ✨',
          description: 'Revise ou pressione Enter para enviar.'
        })
        if (textareaRef.current) textareaRef.current.focus()
      }
    } catch (err: any) {
      toast({ title: 'Erro ao consultar Sofia', description: err.message, variant: 'destructive' })
    } finally {
      setLoadingAiSuggestion(false)
    }
  }

  // Execute a 1-click System Action recommended by Sofia
  const handleExecuteSofiaAction = async (action: SofiaSuggestedAction, sendConfirmReply: boolean) => {
    if (!activePhone) return
    if (action.actionType === 'calculate_quote_or_prereserve') {
      setLocation('/reservas')
      return
    }
    if (action.actionType === 'prepare_nfse') {
      const code = action.payload?.reservationCode || activeConversation?.reservationCode || ''
      setLocation(code ? `/reservas?code=${code}` : '/reservas')
      return
    }

    setExecutingActionId(action.id)
    try {
      const res = await fetch(`/api/whatsapp/chat/${activePhone}/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: action.actionType,
          payload: action.payload,
          sendConfirmReply,
          confirmReplyText: action.payload?.confirmReply || ''
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Não foi possível executar a ação.')
      }

      setCompletedActionIds(prev => ({ ...prev, [action.id]: true }))
      if (sendConfirmReply && soundEnabled) {
        playWhatsAppOutgoingSound()
      }
      toast({
        title: '⚡ Ação Executada pela Sofia!',
        description: sendConfirmReply
          ? `${data.message} Resposta de confirmação enviada ao hóspede!`
          : data.message
      })
      await fetchActiveMessages(activePhone, true, selectedResCode || undefined)
      fetchConversations(true)
    } catch (err: any) {
      toast({
        title: 'Erro ao executar ação',
        description: err.message,
        variant: 'destructive'
      })
    } finally {
      setExecutingActionId(null)
    }
  }

  // Initial Load + Global Background Polling for Conversations (every 3.5 seconds)
  useEffect(() => {
    fetchConversations()
    fetchZapiStatus()
    const convInterval = setInterval(() => {
      fetchConversations(true)
    }, 3500)
    const statusInterval = setInterval(fetchZapiStatus, 20000)
    return () => {
      clearInterval(convInterval)
      clearInterval(statusInterval)
    }
  }, [fetchConversations])

  // Active conversation message polling (every 3.5 seconds)
  useEffect(() => {
    if (!activePhone) return

    fetchActiveMessages(activePhone, false, selectedResCode || undefined)
    markAsRead(activePhone)

    const interval = setInterval(() => {
      fetchActiveMessages(activePhone, true, selectedResCode || undefined)
    }, 3500)

    return () => clearInterval(interval)
  }, [activePhone, selectedResCode, fetchActiveMessages])

  // Scroll down whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Select conversation
  const handleSelectConversation = (conv: ChatConversation) => {
    setSelectedResCode(null)
    setActivePhone(conv.phone)
    setActiveConversation(conv)
    setSofiaAssist(null)
    lastSofiaGuestMsgKeyRef.current = ''
    setIsMobileListOpen(false)
    if (floatingBanner?.phone === conv.phone) {
      setFloatingBanner(null)
    }
    markAsRead(conv.phone)
  }

  // Send Direct Text or Quick Button Message
  const sendTextOrMediaMessage = async (opts: {
    text: string
    mediaType?: 'text' | 'image' | 'document' | 'audio'
    mediaUrl?: string
    fileBase64?: string
    fileName?: string
    clearInput?: boolean
  }) => {
    if (!activePhone) return
    const textToSend = (opts.text || '').trim()
    const mType = opts.mediaType || 'text'
    if (!textToSend && mType === 'text' && !opts.fileBase64 && !opts.mediaUrl) return

    setSending(true)
    const tempId = 'temp-' + Date.now()
    const optimisticMsg: ChatMessage = {
      id: tempId,
      fromMe: true,
      sender: 'operator',
      senderName: user?.username || 'Operador',
      text: textToSend,
      type: mType,
      mediaUrl: opts.mediaUrl || opts.fileBase64 || undefined,
      fileName: opts.fileName,
      timestamp: new Date().toISOString(),
      status: 'sent'
    }

    setMessages(prev => [...prev, optimisticMsg])
    if (opts.clearInput !== false) {
      setInputMessage('')
    }

    try {
      const res = await fetch('/api/whatsapp/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone,
          message: textToSend,
          type: mType,
          mediaType: mType,
          mediaUrl: opts.mediaUrl || '',
          fileBase64: opts.fileBase64 || '',
          fileName: opts.fileName || '',
          reservationCode: selectedResCode || activeConversation?.reservationCode || null,
          reservationId: activeConversation?.reservationId
        })
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Falha ao enviar mensagem')
      }

      if (soundEnabled) {
        playWhatsAppOutgoingSound()
      }

      await fetchActiveMessages(activePhone, true, selectedResCode || undefined)
      fetchConversations(true)
    } catch (err: any) {
      toast({
        title: 'Erro no envio',
        description: err.message || 'Verifique se a Z-API está conectada.',
        variant: 'destructive'
      })
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m))
    } finally {
      setSending(false)
      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    }
  }

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    await sendTextOrMediaMessage({ text: inputMessage, mediaType: 'text', clearInput: true })
  }

  // Handle File Input Selection (Photo, Camera or PDF)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > 15 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'O limite máximo é de 15 MB.', variant: 'destructive' })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result || '')
      const isImg = file.type.startsWith('image/')
      const isAudio = file.type.startsWith('audio/')
      setPendingUpload({
        fileBase64: base64,
        fileName: file.name,
        mediaType: isImg ? 'image' : isAudio ? 'audio' : 'document',
        caption: inputMessage.trim()
      })
    }
    reader.readAsDataURL(file)
  }

  // Handle Clipboard Paste (Ctrl+V Screenshot/Image)
  const handlePasteClipboard = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          setPendingUpload({
            fileBase64: String(reader.result || ''),
            fileName: `print_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.png`,
            mediaType: 'image',
            caption: inputMessage.trim()
          })
        }
        reader.readAsDataURL(file)
        break
      }
    }
  }

  // Confirm Pending Upload Send
  const handleConfirmPendingUpload = async () => {
    if (!pendingUpload) return
    const up = pendingUpload
    setPendingUpload(null)
    await sendTextOrMediaMessage({
      text: up.caption,
      mediaType: up.mediaType,
      fileBase64: up.fileBase64,
      fileName: up.fileName,
      clearInput: Boolean(up.caption && up.caption === inputMessage.trim())
    })
  }

  // Microphone Audio Recording (MediaRecorder)
  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: 'Microfone indisponível neste navegador', variant: 'destructive' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
        ? 'audio/ogg; codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecordingAudio(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1)
      }, 1000)
    } catch (err: any) {
      toast({
        title: 'Permissão de microfone negada',
        description: 'Autorize o uso do microfone no navegador para gravar áudios.',
        variant: 'destructive'
      })
    }
  }

  const stopAudioRecording = (shouldSend: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    const recorder = mediaRecorderRef.current
    if (!recorder) {
      setIsRecordingAudio(false)
      return
    }

    recorder.onstop = () => {
      recorder.stream.getTracks().forEach(t => t.stop())
      setIsRecordingAudio(false)
      if (!shouldSend || audioChunksRef.current.length === 0) return

      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      const ext = (recorder.mimeType || '').includes('ogg') ? 'ogg' : 'webm'
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = String(reader.result || '')
        sendTextOrMediaMessage({
          text: '',
          mediaType: 'audio',
          fileBase64: base64,
          fileName: `audio_${Date.now()}.${ext}`,
          clearInput: false
        })
      }
      reader.readAsDataURL(blob)
    }

    try {
      recorder.stop()
    } catch {
      setIsRecordingAudio(false)
    }
  }

  // Send Attachment (URL fallback dialog)
  const handleSendAttachment = async () => {
    if (!activePhone || !attachUrl.trim()) {
      toast({ title: 'Insira a URL do arquivo', variant: 'destructive' })
      return
    }
    setAttachModalOpen(false)
    await sendTextOrMediaMessage({
      text: attachCaption.trim(),
      mediaType: attachType,
      mediaUrl: attachUrl.trim(),
      fileName: attachName.trim() || (attachType === 'document' ? 'documento.pdf' : 'imagem.jpg'),
      clearInput: false
    })
    setAttachUrl('')
    setAttachName('')
    setAttachCaption('')
  }

  // Open Message Rectification Dialog for Sofia's messages
  const handleOpenCorrectionModal = (msg: ChatMessage) => {
    setSelectedMsgForCorrection(msg)
    setCorrectionGuideline('')
    setRectificationText(
      msg.text
        ? 'Olá! Gostaria de retificar a informação anterior: '
        : 'Olá! Gostaria de retificar uma informação sobre sua estadia.'
    )
    setSendToGuest(true)
    setCorrectModalOpen(true)
  }

  // Save Guideline & Optionally Send Rectification Message
  const handleSaveCorrection = async () => {
    if (!selectedMsgForCorrection || !activePhone) return
    if (!correctionGuideline.trim()) {
      toast({
        title: 'Diretriz obrigatória',
        description: 'Informe o que a Sofia deve aprender.',
        variant: 'destructive'
      })
      return
    }

    setSavingCorrection(true)
    try {
      const payload = {
        messageId: selectedMsgForCorrection.id || selectedMsgForCorrection.messageId || null,
        originalText: selectedMsgForCorrection.text || '',
        originalMessageText: selectedMsgForCorrection.text || '',
        guideline: correctionGuideline.trim(),
        correctionText: correctionGuideline.trim(),
        correction: correctionGuideline.trim(),
        rectificationMessage: sendToGuest ? (rectificationText.trim() || null) : null,
        rectificationText: sendToGuest ? (rectificationText.trim() || null) : null,
        sendToGuest,
        category: 'factual',
        source: 'web_chat_operator'
      }

      const res = await fetch(`/api/whatsapp/chat/${activePhone}/correct-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: sendToGuest ? 'Diretriz Salva & Retificação Enviada!' : 'Diretriz Salva na Sofia!',
          description: sendToGuest
            ? 'A IA assimilou a nova regra e a mensagem de retificação foi enviada ao hóspede.'
            : 'A IA assimilou a nova regra com sucesso.'
        })
        setCorrectModalOpen(false)
        setSelectedMsgForCorrection(null)
        setCorrectionGuideline('')
        setRectificationText('')
        await fetchActiveMessages(activePhone, true)
        fetchConversations(true)
      } else {
        throw new Error(data.error || 'Erro ao processar retificação')
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar correção',
        description: err.message || 'Falha ao salvar diretriz',
        variant: 'destructive'
      })
    } finally {
      setSavingCorrection(false)
    }
  }

  // Start New Chat (from PMS Reservation or Manual)
  const handleStartNewChat = async (phone: string, name: string, reservationId?: number, initialMsg?: string) => {
    const cleanDigits = phone.replace(/\D/g, '')
    if (!cleanDigits) {
      toast({ title: 'Telefone inválido', variant: 'destructive' })
      return
    }

    try {
      const res = await fetch('/api/whatsapp/chat/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanDigits,
          name: name || 'Hóspede CorpFlats',
          reservationId,
          initialMessage: initialMsg
        })
      })

      if (res.ok) {
        setNewChatModalOpen(false)
        setActivePhone(cleanDigits)
        setIsMobileListOpen(false)
        fetchConversations()
        toast({ title: 'Conversa iniciada!' })
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    }
  }

  // Load PMS reservations for new chat modal
  const openNewChatDialog = async () => {
    setNewChatModalOpen(true)
    setLoadingPmsRes(true)
    try {
      const res = await fetch('/api/reservations')
      if (res.ok) {
        const data = await res.json()
        setPmsReservations(data || [])
      }
    } catch {} finally {
      setLoadingPmsRes(false)
    }
  }

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      if (filterTab === 'unread' && (!c.unreadCount || c.unreadCount <= 0)) return false
      if (filterTab === 'pinned' && !c.pinned) return false
      if (filterTab === 'today') {
        const todayStr = new Date().toISOString().split('T')[0]
        const checkin = c.reservation?.checkinDate
        const checkout = c.reservation?.checkoutDate
        if (!checkin || !checkout) return false
        if (todayStr < checkin || todayStr > checkout) return false
      }
      if (filterTab === 'active') {
        if (!c.reservation || c.reservation.status === 'cancelada') return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = (c.name || '').toLowerCase().includes(q)
        const matchPhone = (c.phone || '').includes(q) || (c.formattedPhone || '').includes(q)
        const matchFlat = (c.flatNumber || '').toLowerCase().includes(q)
        const matchCode = (c.reservationCode || '').toLowerCase().includes(q)
        const matchMsg = (c.lastMessage?.text || '').toLowerCase().includes(q)
        return matchName || matchPhone || matchFlat || matchCode || matchMsg
      }

      return true
    })
  }, [conversations, filterTab, searchQuery])

  // Filtered PMS reservations in dialog
  const filteredPmsRes = useMemo(() => {
    if (!pmsResSearch.trim()) return pmsReservations.slice(0, 25)
    const q = pmsResSearch.toLowerCase()
    return pmsReservations.filter(r =>
      (r.guestName || '').toLowerCase().includes(q) ||
      (r.code || '').toLowerCase().includes(q) ||
      String(r.flatNumber || '').includes(q) ||
      (r.guestPhone || '').includes(q)
    ).slice(0, 30)
  }, [pmsReservations, pmsResSearch])

  const formatTime = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const formatConvDate = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      const now = new Date()
      const isToday = d.toDateString() === now.toDateString()
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      const yesterday = new Date(now)
      yesterday.setDate(now.getDate() - 1)
      if (d.toDateString() === yesterday.toDateString()) {
        return 'Ontem'
      }
      return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
    } catch {
      return ''
    }
  }

  // Fallback quick buttons if Sofia Assist hasn't loaded yet
  const quickButtonsToRender: SofiaDynamicQuickButton[] = useMemo(() => {
    if (sofiaAssist?.dynamicQuickButtons && sofiaAssist.dynamicQuickButtons.length > 0) {
      return sofiaAssist.dynamicQuickButtons
    }
    const res = activeConversation?.reservation || {}
    const guestFirstName = (activeConversation?.name || 'Hóspede').split(' ')[0]
    const flatNum = activeConversation?.flatNumber || res.flatNumber || '101'
    const code = activeConversation?.reservationCode || res.code || 'RES-101'
    return [
      {
        id: 'qb_checkin',
        icon: '📝',
        label: 'Check-in Digital',
        text: `Olá, *${guestFirstName}*! Para agilizar sua entrada no Flat ${flatNum}, preencha sua ficha rápida de pré check-in:\n📝 https://corpflats.com.br/pre-checkin/${code}`
      },
      {
        id: 'qb_wifi',
        icon: '📶',
        label: 'Wi-Fi & Acesso',
        text: `Olá, *${guestFirstName}*! Seguem os dados de acesso ao Wi-Fi do seu flat:\n📶 *Rede:* CorpFlats-Hospedes\n🔑 *Senha:* corpflats2026`
      },
      {
        id: 'qb_cafe',
        icon: '🥐',
        label: 'Link do Café',
        text: `Olá, *${guestFirstName}*! Você pode escolher os itens e o horário da sua bandeja de café no flat pelo link:\n🥐 https://corpflats.com.br/cafe/${code}`
      },
      {
        id: 'qb_location',
        icon: '📍',
        label: 'Localização GPS',
        text: `Olá, *${guestFirstName}*! Segue a localização do CorpFlats:\n📍 Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ\n🗺️ https://share.google/LHu3541d5lhkdvbL2`
      },
      {
        id: 'qb_checkout',
        icon: '🚪',
        label: 'Check-out',
        text: `Olá, *${guestFirstName}*! Lembramos que o check-out é até as 12:00. Ao sair, deixe o cartão na portaria e confirme aqui:\n🚪 https://corpflats.com.br/checkout/${code}`
      },
      {
        id: 'qb_manual',
        icon: '📘',
        label: 'Manual (PDF)',
        mediaType: 'document',
        mediaUrl: '/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf',
        fileName: 'Manual_do_Hospede_CorpFlats.pdf',
        text: `Olá, *${guestFirstName}*! Segue em anexo o Manual do Hóspede do Flat ${flatNum}.`
      },
      {
        id: 'qb_review',
        icon: '⭐',
        label: 'Avaliação Google',
        text: `Olá, *${guestFirstName}*! ⭐\nEsperamos que sua experiência no *CorpFlats* tenha sido fantástica!\n\nPoderia nos avaliar com 5 estrelas no Google? Leva apenas 30 segundos e nos ajuda muito! 🙏\n\nhttps://search.google.com/local/writereview?placeid=ChIJV6u4FRTVvQARAKQO7n-p-BA`
      }
    ]
  }, [sofiaAssist, activeConversation])

  const activeStageStyle = STAGE_BADGE_MAP[sofiaAssist?.stayStage || 'sem_reserva'] || STAGE_BADGE_MAP.sem_reserva

  const mainContent = (
    <div className={`flex ${isStandaloneApp ? 'h-[100dvh]' : 'h-[calc(100dvh-64px)] md:h-[100dvh]'} w-full overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans relative`}>

      {/* Hidden Direct File & Camera Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* FLOATING IN-APP WHATSAPP BANNER (For incoming messages in other conversations) */}
      {floatingBanner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md bg-[#008069] text-white rounded-2xl shadow-2xl border border-emerald-400/40 p-3 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
            onClick={() => {
              const target = conversations.find(c => c.phone === floatingBanner.phone)
              if (target) {
                handleSelectConversation(target)
              } else {
                setActivePhone(floatingBanner.phone)
                setIsMobileListOpen(false)
              }
              setFloatingBanner(null)
            }}
          >
            <div className="w-10 h-10 rounded-full bg-white/20 text-white font-black text-xs flex items-center justify-center shrink-0">
              {(floatingBanner.name || 'H').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black truncate">{floatingBanner.name}</span>
                {floatingBanner.flatNumber && (
                  <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-white/20 shrink-0">
                    Flat {floatingBanner.flatNumber}
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-emerald-50 truncate">{floatingBanner.text}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2.5 text-[11px] font-bold bg-white text-[#008069] hover:bg-emerald-50 rounded-xl"
              onClick={() => {
                const target = conversations.find(c => c.phone === floatingBanner.phone)
                if (target) handleSelectConversation(target)
                else {
                  setActivePhone(floatingBanner.phone)
                  setIsMobileListOpen(false)
                }
                setFloatingBanner(null)
              }}
            >
              Responder
            </Button>
            <button
              type="button"
              onClick={() => {
                markAsRead(floatingBanner.phone)
                setFloatingBanner(null)
              }}
              className="p-1 rounded-lg hover:bg-white/15 text-white/80 hover:text-white"
              title="Marcar como lida"
            >
              <CheckCheck className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFloatingBanner(null)}
              className="p-1 rounded-lg hover:bg-white/15 text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* COLUNA 1: LISTA DE CONVERSAS (Redimensionável) */}
      <div
        style={{ width: isMobileListOpen ? undefined : `${contactsWidth}px` }}
        className={`${isMobileListOpen ? 'flex w-full' : 'hidden md:flex'} flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 h-full overflow-hidden transition-[width] duration-75`}
      >
        {/* Header Superior Estilo WhatsApp App */}
        <div className={`p-3 ${isStandaloneApp ? 'bg-[#008069] text-white' : 'bg-slate-50/90 dark:bg-slate-900/90'} border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2`}>
          <div className="flex items-center gap-2.5 min-w-0">
            {isStandaloneApp && (
              <button
                type="button"
                onClick={() => {
                  toggleStandaloneMode(false)
                  setLocation('/')
                }}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white shrink-0"
                title="Voltar ao ERP CorpFlats"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className={`w-9 h-9 rounded-2xl ${isStandaloneApp ? 'bg-white/20 text-white' : 'bg-[#008069] text-white'} flex items-center justify-center shadow-xs shrink-0`}>
              <MessageSquare className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className={`text-sm font-black tracking-tight ${isStandaloneApp ? 'text-white' : 'text-slate-900 dark:text-slate-100'} leading-tight flex items-center gap-1.5`}>
                <span className="truncate">CF WhatsApp</span>
                {zapiStatus?.connected ? (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isStandaloneApp ? 'bg-emerald-900/50 text-emerald-100 border border-emerald-400/40' : 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800'}`} title="Instância Z-API Online">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Offline
                  </span>
                )}
              </h2>
              <p className={`text-[10.5px] truncate ${isStandaloneApp ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                Sofia Assistente Ativa • {conversations.length} chats
              </p>
            </div>
          </div>

          {/* Ações do Header: Som/Notificações, Instalar App, Atualizar, Novo Chat */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-lg ${isStandaloneApp ? 'text-white hover:bg-white/15' : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'}`}
              title={soundEnabled ? 'Sons e Notificações Ativos (Clique para configurar)' : 'Sons Silenciados (Clique para ativar)'}
              onClick={handleToggleSoundAndNotif}
            >
              {soundEnabled && notifPermission === 'granted' ? (
                <Bell className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
              ) : soundEnabled ? (
                <Bell className="w-4 h-4" />
              ) : (
                <BellOff className="w-4 h-4 opacity-70" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-2 rounded-lg text-[11px] font-bold gap-1 ${isStandaloneApp ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800'}`}
              title="Instalar App no Celular ou Alternar Modo Tela Cheia"
              onClick={handleInstallAppClick}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">App</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-lg ${isStandaloneApp ? 'text-white hover:bg-white/15' : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'}`}
              title="Atualizar conversas"
              onClick={() => fetchConversations()}
            >
              <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              size="sm"
              className={`h-8 px-2.5 rounded-lg text-xs font-bold gap-1 shadow-2xs ${isStandaloneApp ? 'bg-white text-[#008069] hover:bg-emerald-50' : 'bg-[#008069] hover:bg-emerald-700 text-white'}`}
              onClick={openNewChatDialog}
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Novo</span>
            </Button>
          </div>
        </div>

        {/* Banner de Permissão de Notificação Nativa (se ainda não autorizada) */}
        {canUsePushNotifications() && notifPermission === 'default' && (
          <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-emerald-600 shrink-0 animate-bounce" />
              <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                Ative os alertas estilo WhatsApp com som!
              </span>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                const p = await requestPushNotificationPermission()
                setNotifPermission(p)
              }}
              className="h-6 px-2.5 text-[10.5px] font-bold bg-[#008069] hover:bg-emerald-700 text-white rounded-lg shrink-0"
            >
              Ativar Agora
            </Button>
          </div>
        )}

        {/* Campo de Pesquisa */}
        <div className="p-2.5 border-b border-slate-200/80 dark:border-slate-800/80 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar hóspede, telefone, flat ou reserva..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-9 pr-7 text-xs rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border-transparent focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Abas / Filtros Rápidos */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap transition-all ${
                filterTab === 'all'
                  ? 'bg-[#008069] text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Todas
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('unread')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap flex items-center gap-1 transition-all ${
                filterTab === 'unread'
                  ? 'bg-[#008069] text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>Não Lidas</span>
              {conversations.filter(c => c.unreadCount > 0).length > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {conversations.filter(c => c.unreadCount > 0).length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('today')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap transition-all ${
                filterTab === 'today'
                  ? 'bg-[#008069] text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Hóspedes Hoje
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('pinned')}
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] whitespace-nowrap flex items-center gap-1 transition-all ${
                filterTab === 'pinned'
                  ? 'bg-[#008069] text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Pin className="w-2.5 h-2.5" />
              <span>Fixadas</span>
            </button>
          </div>
        </div>

        {/* Lista de Itens de Conversa */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loadingConversations && conversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs text-slate-500">Carregando conversas do WhatsApp...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2 text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-xs font-semibold">Nenhuma conversa encontrada</p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 rounded-lg mt-2"
                onClick={openNewChatDialog}
              >
                Iniciar nova conversa
              </Button>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = activePhone === conv.phone
              const initials = (conv.name || 'H')
                .split(' ')
                .map(w => w[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase()

              return (
                <div
                  key={conv.phone}
                  onClick={() => handleSelectConversation(conv)}
                  className={`p-3 flex items-start gap-3 cursor-pointer transition-colors relative group ${
                    isSelected
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-[#008069]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {/* Avatar do Hóspede */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#008069] to-teal-500 text-white font-black text-sm flex items-center justify-center shadow-2xs">
                      {initials}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#25D366] border-2 border-white dark:border-slate-900 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Conteúdo da Conversa */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className={`text-xs ${conv.unreadCount > 0 ? 'font-black text-slate-950 dark:text-white' : 'font-bold text-slate-900 dark:text-slate-100'} truncate`}>
                          {conv.name || conv.formattedPhone}
                        </span>
                        {conv.flatNumber && (
                          <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 shrink-0 border border-emerald-300 dark:border-emerald-800">
                            Flat {conv.flatNumber}
                          </span>
                        )}
                      </div>
                      <span className={`text-[10px] shrink-0 font-semibold ${conv.unreadCount > 0 ? 'text-[#008069] dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                        {formatConvDate(conv.lastMessage?.timestamp)}
                      </span>
                    </div>

                    {/* Código da Reserva & Canal & Status IA */}
                    <div className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400 mb-1 flex-wrap">
                      {conv.reservationCode && (
                        <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">
                          {conv.reservationCode}
                        </span>
                      )}
                      {conv.channel && (
                        <>
                          <span>•</span>
                          <span className="capitalize text-[10px] text-slate-400">{conv.channel}</span>
                        </>
                      )}
                      {conv.aiPaused ? (
                        conv.aiPausedReason === 'guest_requested_human' ? (
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 shrink-0 border border-rose-300 dark:border-rose-800">
                            🚨 Pede Atendente
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 shrink-0 border border-purple-300 dark:border-purple-800 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> Sofia Co-piloto
                          </span>
                        )
                      ) : (
                        <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shrink-0 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5">
                          <Bot className="w-2.5 h-2.5" /> Sofia Auto
                        </span>
                      )}
                    </div>

                    {/* Snippet da Última Mensagem */}
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11.5px] truncate flex items-center gap-1 ${conv.unreadCount > 0 ? 'font-bold text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>
                        {conv.lastMessage?.fromMe && (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        {conv.lastMessage?.type === 'image' && <ImageIcon className="w-3 h-3 shrink-0 text-slate-400" />}
                        {conv.lastMessage?.type === 'document' && <FileText className="w-3 h-3 shrink-0 text-slate-400" />}
                        {conv.lastMessage?.type === 'audio' && <Music className="w-3 h-3 shrink-0 text-slate-400" />}
                        <span className="truncate">
                          {conv.lastMessage?.text || (conv.lastMessage?.type ? `[${conv.lastMessage.type}]` : 'Nenhuma mensagem recente')}
                        </span>
                      </p>

                      <div className="flex items-center gap-1 shrink-0">
                        {conv.pinned && (
                          <Pin className="w-3 h-3 text-slate-400 fill-slate-400" title="Fixada no topo" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => togglePin(e, conv.phone)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-emerald-600 rounded transition-opacity"
                          title={conv.pinned ? 'Desafixar' : 'Fixar no topo'}
                        >
                          {conv.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* DIVISOR REDIMENSIONÁVEL: LISTA DE CONTATOS / CHAT */}
      <div
        onMouseDown={startResizingContacts}
        onDoubleClick={() => {
          setContactsWidth(310)
          try { localStorage.setItem('corpflats_chat_contacts_width', '310') } catch {}
        }}
        className={`hidden md:flex w-2 hover:w-2.5 -mr-1 items-center justify-center cursor-col-resize z-20 group relative transition-all select-none ${
          isDraggingContacts ? 'bg-emerald-500 w-2.5' : 'bg-transparent hover:bg-emerald-400/30'
        }`}
        title="Arraste para redimensionar a lista de contatos • Duplo clique para restaurar (310px)"
      >
        <div className={`w-1 h-8 rounded-full transition-colors ${
          isDraggingContacts ? 'bg-white shadow-xs' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-emerald-500'
        }`} />
      </div>

      {/* COLUNA 2: ÁREA DE MENSAGENS, SOFIA ASSISTENTE ATIVA E COMPOSITOR */}
      <div className={`${!isMobileListOpen ? 'flex' : 'hidden md:flex'} flex-col flex-1 h-full min-w-[320px] sm:min-w-[360px] bg-[#efeae2] dark:bg-slate-950 relative overflow-hidden`}>
        {activeConversation ? (
          <>
            {/* Header do Chat Ativo */}
            <div className={`h-15 px-3 sm:px-4 ${isStandaloneApp ? 'bg-[#008069] text-white' : 'bg-white dark:bg-slate-900'} border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-10 shadow-2xs gap-2`}>
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`md:hidden h-8 w-8 rounded-lg -ml-1 shrink-0 ${isStandaloneApp ? 'text-white hover:bg-white/15' : 'text-slate-600'}`}
                  onClick={() => setIsMobileListOpen(true)}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>

                <div
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
                  onClick={() => setShowDossier(!showDossier)}
                >
                  {(activeConversation.name || 'H').slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setShowDossier(!showDossier)}>
                  <div className="flex items-center gap-1.5 truncate">
                    <h3 className={`text-xs sm:text-sm font-black truncate ${isStandaloneApp ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                      {activeConversation.name}
                    </h3>
                    <span className={`text-[10.5px] sm:text-xs font-mono truncate hidden sm:inline ${isStandaloneApp ? 'text-emerald-100' : 'text-slate-500'}`}>
                      {activeConversation.formattedPhone || activeConversation.phone}
                    </span>
                  </div>

                  <div className={`flex items-center gap-1 text-[10px] sm:text-[11px] truncate ${isStandaloneApp ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {activeConversation.flatNumber && (
                      <Badge variant="secondary" className="text-[9.5px] sm:text-[10px] px-1.5 py-0 font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 shrink-0">
                        Flat {activeConversation.flatNumber}
                      </Badge>
                    )}
                    {activeConversation.reservationCode && (
                      <span className={`font-mono font-semibold truncate ${isStandaloneApp ? 'text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        {activeConversation.reservationCode}
                      </span>
                    )}
                    {sofiaAssist?.stayStageLabel && (
                      <span className={`hidden lg:inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9.5px] font-bold border ${activeStageStyle.color}`}>
                        {activeStageStyle.icon} {sofiaAssist.stayStageLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ações do Header do Chat */}
              <div className="flex items-center gap-1 shrink-0">
                {activeConversation.aiPaused ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleAi}
                    disabled={togglingAi}
                    className="h-8 px-2 sm:px-2.5 rounded-lg border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 text-[11px] font-bold gap-1 hover:bg-purple-100 shrink-0"
                    title="Auto-resposta pausada (Sofia ativa como sua assistente em tempo real). Clique para religar resposta automática."
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span className="hidden xl:inline">Sofia Assistente</span>
                    <Play className="w-3 h-3 text-purple-500 ml-0.5" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleAi}
                    disabled={togglingAi}
                    className="h-8 px-2 sm:px-2.5 rounded-lg border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-[11px] font-bold gap-1 hover:bg-emerald-100 shrink-0"
                    title="Sofia respondendo automaticamente + assistente em tempo real. Clique para assumir manual."
                  >
                    <Bot className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden xl:inline">Sofia Auto</span>
                    <Pause className="w-3 h-3 text-slate-400 ml-0.5" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-lg shrink-0 ${isStandaloneApp ? 'text-white hover:bg-white/15' : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600'}`}
                  title="Atualizar conversa e sugestões da Sofia"
                  onClick={() => {
                    fetchActiveMessages(activeConversation.phone)
                    fetchSofiaAssistance(activeConversation.phone, { resCode: selectedResCode })
                  }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${(loadingMessages || loadingSofiaAssist) ? 'animate-spin' : ''}`} />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 px-2 sm:px-2.5 rounded-lg text-xs font-bold gap-1 transition-colors shrink-0 ${
                    showDossier ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300' : ''
                  }`}
                  onClick={() => setShowDossier(!showDossier)}
                  title="Exibir/Ocultar Dossiê da Reserva"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dossiê</span>
                </Button>
              </div>
            </div>

            {/* Área de Mensagens (Wallpaper WhatsApp) */}
            <div
              className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-2.5"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0, 128, 105, 0.05) 0%, transparent 80%)`,
                backgroundSize: '24px 24px'
              }}
            >
              <div className="text-center my-1">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/80 dark:bg-slate-800 text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 shadow-2xs">
                  🔒 WhatsApp Oficial CorpFlats • Assistido em tempo real pela Sofia IA
                </span>
              </div>

              {loadingMessages && messages.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
                  <p className="text-xs text-slate-500">Carregando mensagens...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center space-y-2 max-w-sm mx-auto bg-white/90 dark:bg-slate-900/90 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                  <MessageSquare className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Nenhuma mensagem ainda</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Use uma das sugestões da Sofia ou os botões dinâmicos abaixo para iniciar o atendimento.
                  </p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isFromMe = msg.fromMe
                  const prevMsg = messages[index - 1]
                  const showDateHeader = !prevMsg || new Date(prevMsg.timestamp).toDateString() !== new Date(msg.timestamp).toDateString()

                  return (
                    <React.Fragment key={msg.id || index}>
                      {showDateHeader && (
                        <div className="text-center my-2.5">
                          <span className="px-3 py-1 rounded-full bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 shadow-2xs">
                            {new Date(msg.timestamp).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
                          </span>
                        </div>
                      )}

                      <div className={`flex w-full ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[88%] sm:max-w-[76%] md:max-w-[68%] rounded-2xl p-2.5 sm:p-3 shadow-xs relative space-y-1 transition-all ${
                            isFromMe
                              ? 'bg-[#d9fdd3] dark:bg-emerald-950/80 border border-emerald-200/80 dark:border-emerald-800/60 rounded-tr-xs text-slate-900 dark:text-slate-100'
                              : 'bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-tl-xs text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {isFromMe ? (
                            <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#008069] dark:text-emerald-400 border-b border-emerald-300/40 dark:border-emerald-800/40 pb-1 mb-1">
                              <span>{msg.senderName || 'CorpFlats'}</span>
                              {msg.triggerEvent && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-mono text-[9px]">
                                  {msg.triggerEvent.startsWith('sofia_action_') ? '⚡ Ação Sofia' : '🤖 Régua / IA'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-400 border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
                              <User className="w-3 h-3" />
                              <span>{activeConversation.name}</span>
                            </div>
                          )}

                          {msg.type === 'image' && msg.mediaUrl && (
                            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 my-1">
                              <img
                                src={msg.mediaUrl}
                                alt="Imagem compartilhada"
                                className="max-h-64 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(msg.mediaUrl, '_blank')}
                              />
                            </div>
                          )}

                          {msg.type === 'document' && msg.mediaUrl && (
                            <a
                              href={msg.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 p-2.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition-colors my-1 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                  {msg.fileName || 'documento.pdf'}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">Abrir documento</p>
                              </div>
                              <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                            </a>
                          )}

                          {msg.type === 'audio' && msg.mediaUrl && (
                            <div className="p-2 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 my-1 min-w-[220px]">
                              <audio controls src={msg.mediaUrl} className="w-full h-8" />
                            </div>
                          )}

                          {msg.text && (
                            <div className="text-xs md:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                              {msg.text}
                            </div>
                          )}

                          {msg.buttons && msg.buttons.length > 0 && (
                            <div className="space-y-1 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50">
                              {msg.buttons.map((btn, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-center bg-white dark:bg-slate-800 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                                >
                                  🔘 {btn.label}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                            <span>{formatTime(msg.timestamp)}</span>
                            {isFromMe && (
                              <>
                                {msg.status === 'failed' ? (
                                  <AlertCircle className="w-3 h-3 text-rose-500" title="Falha no envio" />
                                ) : msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] dark:text-emerald-400" title="Lida" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-slate-400" title="Entregue" />
                                ) : (
                                  <Check className="w-3 h-3 text-slate-400" title="Enviada" />
                                )}
                              </>
                            )}
                          </div>

                          {isFromMe && !msg.triggerEvent && (msg.senderName?.toLowerCase().includes('sofia') || msg.sender === 'system') && (
                            <div className="pt-1.5 mt-1 border-t border-emerald-300/60 dark:border-emerald-800/40 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => handleOpenCorrectionModal(msg)}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10.5px] font-bold text-emerald-900 dark:text-emerald-300 bg-white/80 dark:bg-emerald-900/50 hover:bg-white transition-colors shadow-2xs cursor-pointer"
                                title="Corrigir resposta da Sofia e retificar com o hóspede"
                              >
                                <span>✏️</span> Corrigir / Ensinar Sofia
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* =====================================================================
                PAINEL DA SOFIA ASSISTENTE ATIVA EM TEMPO REAL
                (Ações no Sistema em 1 Clique + Sugestões de Resposta + Botões Dinâmicos)
               ===================================================================== */}
            <div className="bg-gradient-to-b from-purple-50/95 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border-t border-purple-200/80 dark:border-purple-900/50 shrink-0 shadow-sm">
              
              {/* Cabeçalho Compacto da Sofia Assistente */}
              <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-purple-100/80 dark:border-slate-800">
                <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-black shrink-0 shadow-2xs">
                    <Sparkles className={`w-3 h-3 ${loadingSofiaAssist ? 'animate-spin' : ''}`} />
                    SOFIA ATIVA
                  </span>

                  {sofiaAssist?.stayStageLabel && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${activeStageStyle.color}`}>
                      <span>{activeStageStyle.icon}</span>
                      <span>{sofiaAssist.stayStageLabel}</span>
                    </span>
                  )}

                  {sofiaAssist?.detectedTopics?.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-purple-100/80 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 text-[10px] font-bold shrink-0 border border-purple-200 dark:border-purple-800"
                    >
                      {TOPIC_LABELS[t] || t}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => activePhone && fetchSofiaAssistance(activePhone, { draftText: inputMessage, resCode: selectedResCode })}
                    className="px-2 py-0.5 rounded-md text-[10.5px] font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-950/60 flex items-center gap-1 transition-colors"
                    title="Gerar novas sugestões com a Sofia"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSofiaAssist ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Atualizar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSofiaPanelExpanded(!sofiaPanelExpanded)}
                    className="p-1 rounded-md text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                    title={sofiaPanelExpanded ? 'Recolher sugestões da Sofia' : 'Expandir sugestões da Sofia'}
                  >
                    {sofiaPanelExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Corpo Expansível: Ações de Sistema em 1 Clique + Sugestões de Resposta */}
              {sofiaPanelExpanded && (
                <div className="px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
                  {/* 1. AÇÕES DE SISTEMA DETECTADAS PELA SOFIA */}
                  {sofiaAssist?.suggestedActions && sofiaAssist.suggestedActions.length > 0 && (
                    <div className="space-y-1.5">
                      {sofiaAssist.suggestedActions.map(act => {
                        const isDone = completedActionIds[act.id]
                        const isRunning = executingActionId === act.id
                        return (
                          <div
                            key={act.id}
                            className={`p-2 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
                              isDone
                                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="text-base leading-none mt-0.5">{act.icon || '⚡'}</span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                                    {act.title}
                                  </span>
                                  <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                                    {act.badge}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                                  {act.description}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isDone ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 px-2 py-1">
                                  <CheckCircle2 className="w-4 h-4" /> Executado!
                                </span>
                              ) : (
                                <>
                                  {act.payload?.confirmReply && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={isRunning}
                                      onClick={() => handleExecuteSofiaAction(act, true)}
                                      className="h-7 px-2.5 text-[11px] font-bold bg-[#008069] hover:bg-emerald-700 text-white rounded-lg gap-1 shadow-2xs"
                                    >
                                      {isRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                      <span>Executar + Responder</span>
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isRunning}
                                    onClick={() => handleExecuteSofiaAction(act, false)}
                                    className="h-7 px-2 text-[11px] font-bold rounded-lg border-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950"
                                  >
                                    <span>Só Executar</span>
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 2. SUGESTÕES DE RESPOSTA EM TEMPO REAL (2-3 OPÇÕES PRONTAS) */}
                  {sofiaAssist?.suggestedReplies && sofiaAssist.suggestedReplies.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {sofiaAssist.suggestedReplies.map(rep => (
                        <div
                          key={rep.id}
                          className="group p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-purple-200/80 dark:border-purple-900/60 hover:border-purple-400 shadow-2xs flex flex-col justify-between gap-1.5 transition-all"
                        >
                          <div
                            className="cursor-pointer space-y-0.5"
                            onClick={() => {
                              setInputMessage(rep.text)
                              if (textareaRef.current) textareaRef.current.focus()
                            }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" />
                                {rep.label}
                              </span>
                              <span className="text-[9.5px] text-slate-400">Clique para editar</span>
                            </div>
                            <p className="text-[11.5px] text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
                              {rep.text}
                            </p>
                          </div>

                          <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                            <button
                              type="button"
                              onClick={() => {
                                setInputMessage(rep.text)
                                if (textareaRef.current) textareaRef.current.focus()
                              }}
                              className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              type="button"
                              disabled={sending}
                              onClick={() => sendTextOrMediaMessage({ text: rep.text, mediaType: 'text', clearInput: false })}
                              className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-[#008069] hover:bg-emerald-700 text-white flex items-center gap-1 shadow-2xs"
                            >
                              <span>Enviar Agora</span>
                              <Send className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. BARRA DE BOTÕES DE ENVIO RÁPIDO DINÂMICOS (Ordenados pelo Teor e Momento da Estadia) */}
              <div className="px-3 py-1.5 bg-slate-100/90 dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="text-[10px] font-black uppercase text-[#008069] dark:text-emerald-400 shrink-0 flex items-center gap-1">
                  ⚡ Envio Rápido:
                </span>

                {quickButtonsToRender.map(qb => (
                  <div
                    key={qb.id}
                    className={`inline-flex items-center rounded-lg border text-[11px] font-semibold whitespace-nowrap shadow-2xs transition-all shrink-0 overflow-hidden ${
                      qb.highlighted
                        ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-500 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-500/30'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setInputMessage(prev => (prev ? prev + '\n\n' + qb.text : qb.text))
                        if (textareaRef.current) textareaRef.current.focus()
                      }}
                      className="h-6 px-2 flex items-center gap-1 hover:bg-emerald-50/60 dark:hover:bg-slate-700/60"
                      title="Clique para inserir no campo de texto"
                    >
                      <span>{qb.icon}</span>
                      <span>{qb.label}</span>
                      {qb.highlighted && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() =>
                        sendTextOrMediaMessage({
                          text: qb.text,
                          mediaType: qb.mediaType || 'text',
                          mediaUrl: qb.mediaUrl,
                          fileName: qb.fileName,
                          clearInput: false
                        })
                      }
                      className="h-6 px-1.5 border-l border-slate-200 dark:border-slate-700 hover:bg-[#008069] hover:text-white text-emerald-700 dark:text-emerald-400 transition-colors flex items-center"
                      title={`Enviar "${qb.label}" imediatamente`}
                    >
                      <Send className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé de Envio (Área de Digitação + Gravação de Áudio) */}
            <div className="p-2 sm:p-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 transition-all">
              {isRecordingAudio ? (
                /* Barra de Gravação de Áudio Estilo WhatsApp */
                <div className="w-full h-12 px-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                    <span className="text-xs font-black text-rose-700 dark:text-rose-300 font-mono">
                      Gravando áudio... {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => stopAudioRecording(false)}
                      className="h-8 px-3 rounded-xl text-xs font-bold text-slate-600 border-slate-300"
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => stopAudioRecording(true)}
                      className="h-8 px-3.5 rounded-xl bg-[#008069] hover:bg-emerald-700 text-white text-xs font-bold gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar Áudio</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xs focus-within:border-[#008069] focus-within:bg-white dark:focus-within:bg-slate-900 transition-all overflow-hidden flex flex-col">
                  {(isExpandedEditor || inputMessage.length > 40 || inputMessage.includes('\n')) && (
                    <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {inputMessage.length} caracteres
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {inputMessage.trim() && (
                          <button
                            type="button"
                            onClick={() => setInputMessage('')}
                            className="text-[10.5px] text-rose-500 hover:underline px-1.5 py-0.5 rounded"
                          >
                            Limpar
                          </button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsExpandedEditor(!isExpandedEditor)}
                          className="h-5 px-1.5 text-[10.5px] font-bold gap-1 text-slate-600 dark:text-slate-300 hover:text-emerald-600 rounded"
                        >
                          {isExpandedEditor ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                          <span>{isExpandedEditor ? 'Recolher' : 'Expandir'}</span>
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="w-full relative">
                    <Textarea
                      ref={textareaRef}
                      rows={isExpandedEditor ? 5 : 1}
                      value={inputMessage}
                      onChange={e => setInputMessage(e.target.value)}
                      onPaste={handlePasteClipboard}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Mensagem (Enter envia • Ctrl+V cola print/foto)..."
                      className={`w-full border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 text-xs sm:text-sm font-sans leading-relaxed text-slate-800 dark:text-slate-100 placeholder:text-slate-400 resize-none ${
                        isExpandedEditor ? 'min-h-[130px] max-h-[340px]' : 'min-h-[42px] max-h-[160px]'
                      }`}
                    />
                  </div>

                  {/* Barra de Ações Inferior */}
                  <div className="px-2 py-1 bg-slate-100/60 dark:bg-slate-800/80 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-600 shrink-0"
                            title="Inserir Emoji"
                          >
                            <Smile className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-64 p-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-lg">
                          <div className="grid grid-cols-5 gap-1.5 text-center">
                            {EMOJI_LIST.map((emoji, eIdx) => (
                              <button
                                key={eIdx}
                                type="button"
                                onClick={() => {
                                  setInputMessage(prev => prev + emoji)
                                  if (textareaRef.current) textareaRef.current.focus()
                                }}
                                className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-lg flex items-center justify-center transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Dropdown de Anexo Direto (Arquivo, Câmera, Manual ou URL) */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-600 shrink-0"
                            title="Anexar foto, câmera ou PDF"
                          >
                            <Paperclip className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" className="w-56 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                          <DropdownMenuItem
                            className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="w-4 h-4 text-emerald-600" />
                            <span>Escolher Foto ou PDF do Aparelho</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2"
                            onClick={() => cameraInputRef.current?.click()}
                          >
                            <Camera className="w-4 h-4 text-teal-600" />
                            <span>Tirar Foto com a Câmera</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2"
                            onClick={() => {
                              sendTextOrMediaMessage({
                                text: `Segue em anexo o Manual do Hóspede CorpFlats.`,
                                mediaType: 'document',
                                mediaUrl: '/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf',
                                fileName: 'Manual_do_Hospede_CorpFlats.pdf',
                                clearInput: false
                              })
                            }}
                          >
                            <FileText className="w-4 h-4 text-rose-600" />
                            <span>Enviar Manual do Hóspede (PDF)</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer flex items-center gap-2 text-xs font-medium py-1.5 text-slate-500"
                            onClick={() => {
                              setAttachType('image')
                              setAttachName('imagem.jpg')
                              setAttachModalOpen(true)
                            }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Enviar por Link / URL...</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Botão Direto de Câmera no Mobile */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => cameraInputRef.current?.click()}
                        className="h-8 w-8 rounded-lg text-slate-500 hover:text-emerald-600 shrink-0 sm:hidden"
                        title="Tirar Foto"
                      >
                        <Camera className="w-4 h-4" />
                      </Button>

                      {/* Botão Copiloto: Refinar / Gerar Resposta com Sofia */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSuggestWithAi}
                        disabled={loadingAiSuggestion || !activePhone}
                        className="h-8 px-2 rounded-lg text-purple-600 dark:text-purple-300 hover:bg-purple-100/70 dark:hover:bg-purple-950/60 font-bold text-xs gap-1 shrink-0 transition-colors"
                        title="Pedir para a Sofia escrever ou melhorar a resposta"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${loadingAiSuggestion ? 'animate-spin text-purple-600' : ''}`} />
                        <span className="text-[11px]">Redigir com Sofia</span>
                      </Button>
                    </div>

                    {/* Direita: Gravar Áudio ou Enviar Texto */}
                    <div className="flex items-center gap-1.5">
                      {!inputMessage.trim() ? (
                        <Button
                          type="button"
                          onClick={startAudioRecording}
                          className="h-8 w-8 sm:w-auto sm:px-3 rounded-xl bg-[#008069] hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shrink-0 shadow-xs flex items-center justify-center"
                          title="Gravar mensagem de voz"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Áudio</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          disabled={sending}
                          onClick={() => handleSendMessage()}
                          className="h-8 px-3.5 rounded-xl bg-[#008069] hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shrink-0 shadow-xs flex items-center justify-center"
                        >
                          {sending ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : (
                            <>
                              <span>Enviar</span>
                              <Send className="w-3 h-3" />
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Estado Vazio */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-[#008069] flex items-center justify-center shadow-lg">
              <MessageSquare className="w-10 h-10" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                CF WhatsApp • Sofia Assistente Ativa
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Selecione uma conversa ao lado para conversar com o hóspede com sugestões de resposta e ações no sistema em tempo real, ou instale como aplicativo dedicado no celular.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                className="bg-[#008069] hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 rounded-xl shadow-xs px-4 py-2"
                onClick={openNewChatDialog}
              >
                <Plus className="w-4 h-4" />
                <span>Nova Conversa</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-bold gap-1.5 rounded-xl px-4 py-2 border-emerald-300 text-emerald-800 dark:text-emerald-300"
                onClick={handleInstallAppClick}
              >
                <Download className="w-4 h-4" />
                <span>Instalar no Celular</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* BACKDROP MOBILE / LAPTOP PARA O DOSSIÊ */}
      {activeConversation && showDossier && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-2xs z-30 xl:hidden transition-opacity"
          onClick={() => setShowDossier(false)}
        />
      )}

      {/* DIVISOR REDIMENSIONÁVEL: CHAT / DOSSIÊ */}
      {activeConversation && showDossier && (
        <div
          onMouseDown={startResizingDossier}
          onDoubleClick={() => {
            setDossierWidth(300)
            try { localStorage.setItem('corpflats_chat_dossier_width', '300') } catch {}
          }}
          className={`hidden xl:flex w-2 hover:w-2.5 -ml-1 items-center justify-center cursor-col-resize z-20 group relative transition-all select-none ${
            isDraggingDossier ? 'bg-emerald-500 w-2.5' : 'bg-transparent hover:bg-emerald-400/30'
          }`}
        >
          <div className={`w-1 h-8 rounded-full transition-colors ${
            isDraggingDossier ? 'bg-white shadow-xs' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-emerald-500'
          }`} />
        </div>
      )}

      {/* COLUNA 3: DOSSIÊ LATERAL DA RESERVA / HÓSPEDE */}
      {activeConversation && showDossier && (
        <div
          style={{ width: `${dossierWidth}px` }}
          className="fixed inset-y-0 right-0 z-40 xl:static xl:z-auto flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shrink-0 h-full overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 shadow-2xl xl:shadow-none transition-[width] duration-75"
        >
          <div className="p-3.5 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-emerald-600 shrink-0" />
              <h4 className="text-xs font-black uppercase text-slate-900 dark:text-slate-100 tracking-wider truncate">
                Dossiê da Reserva & Hóspede
              </h4>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-600"
              onClick={() => setShowDossier(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-4 space-y-3">
            <div className="text-center space-y-1 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="w-14 h-14 rounded-full bg-[#008069] text-white font-black text-lg flex items-center justify-center mx-auto shadow-xs">
                {(activeConversation.name || 'H').slice(0, 2).toUpperCase()}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-1">
                {activeConversation.name}
              </h4>
              <p className="text-xs text-slate-500 font-mono">
                {activeConversation.formattedPhone || activeConversation.phone}
              </p>
            </div>

            {activeConversation.reservation ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Reserva:</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {activeConversation.reservation.code}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Status:</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] uppercase font-bold ${getReservationStatusInfo(activeConversation.reservation.status).className}`}
                  >
                    {getReservationStatusInfo(activeConversation.reservation.status).label}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Quarto / Flat:</span>
                  <span className="font-black text-slate-900 dark:text-slate-100">
                    Flat {activeConversation.reservation.flatNumber}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Check-in:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeConversation.reservation.checkinDate?.split('-').reverse().join('/')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Check-out:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {activeConversation.reservation.checkoutDate?.split('-').reverse().join('/')}
                  </span>
                </div>

                {activeConversation.reservation.vehiclePlate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Placa Veículo:</span>
                    <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      🚗 {activeConversation.reservation.vehiclePlate}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Valor Total:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {Number(activeConversation.reservation.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Pagamento:</span>
                  <Badge
                    variant={getPaymentInfo(activeConversation.reservation).label === 'Pago ✓' ? 'default' : 'outline'}
                    className={`text-[10px] uppercase font-bold ${getPaymentInfo(activeConversation.reservation).className}`}
                  >
                    {getPaymentInfo(activeConversation.reservation).label}
                  </Badge>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center space-y-1">
                <p className="text-xs text-slate-500">Nenhuma reserva PMS associada a este telefone.</p>
              </div>
            )}
          </div>

          {activeConversation.otherReservations && activeConversation.otherReservations.length > 0 && (
            <div className="p-4 space-y-2.5 border-b border-slate-100 dark:border-slate-800">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Outras Reservas deste Hóspede ({activeConversation.otherReservations.length})
              </span>
              <div className="space-y-2">
                {activeConversation.otherReservations.map((ores: any) => {
                  const stInfo = getReservationStatusInfo(ores.status)
                  const payInfo = getPaymentInfo(ores)
                  return (
                    <div key={ores.code} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="font-bold text-slate-800 dark:text-slate-200">Flat {ores.flatNumber}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[9.5px] uppercase font-bold py-0 ${stInfo.className}`}>
                            {stInfo.label}
                          </Badge>
                          <Badge variant={payInfo.label === 'Pago ✓' ? 'default' : 'outline'} className={`text-[9.5px] uppercase font-bold py-0 ${payInfo.className}`}>
                            {payInfo.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-mono">{ores.code}</span>
                        <span>{ores.checkinDate?.split('-').reverse().join('/')} a {ores.checkoutDate?.split('-').reverse().join('/')}</span>
                      </div>
                      <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedResCode(ores.code)
                            if (activePhone) {
                              fetchActiveMessages(activePhone, false, ores.code)
                            }
                          }}
                          className="h-6 px-1.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
                        >
                          <ArrowRightCircle className="w-3.5 h-3.5" /> Ativar no Dossiê
                        </Button>
                        <a
                          href={`/reservas?code=${ores.code}`}
                          className="text-[10.5px] font-semibold text-emerald-600 hover:underline flex items-center gap-0.5"
                        >
                          Ver no PMS <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeConversation.reservation && (
            <div className="p-4 space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                Acessos Diretos no PMS
              </span>
              <a
                href={`/reservas?code=${activeConversation.reservation.code}`}
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  Ver no Calendário PMS
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </a>
              <a
                href={`/portal-hospede/${activeConversation.reservation.code}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  Portal do Hóspede
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* MODAL: PREVIEW DE UPLOAD DIRETO / PRINT COLADO */}
      <Dialog open={Boolean(pendingUpload)} onOpenChange={(o) => !o && setPendingUpload(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              {pendingUpload?.mediaType === 'image' ? (
                <>
                  <ImageIcon className="w-5 h-5 text-emerald-600" />
                  Enviar Imagem para {activeConversation?.name}
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-rose-600" />
                  Enviar Arquivo para {activeConversation?.name}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {pendingUpload && (
            <div className="space-y-3 py-2">
              {pendingUpload.mediaType === 'image' ? (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/5 max-h-64 flex items-center justify-center">
                  <img src={pendingUpload.fileBase64} alt="Preview" className="max-h-60 object-contain" />
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-2.5">
                  <FileText className="w-6 h-6 text-rose-600 shrink-0" />
                  <span className="text-xs font-bold truncate">{pendingUpload.fileName}</span>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold">Legenda (Opcional):</label>
                <Input
                  placeholder="Adicione uma legenda..."
                  value={pendingUpload.caption}
                  onChange={e => setPendingUpload(prev => prev ? { ...prev, caption: e.target.value } : null)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleConfirmPendingUpload()
                    }
                  }}
                  className="text-xs h-9 rounded-xl"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingUpload(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={sending}
              onClick={handleConfirmPendingUpload}
              className="bg-[#008069] hover:bg-emerald-700 text-white text-xs font-bold gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: INSTALAR APP NO CELULAR / MODO TELA CHEIA */}
      <Dialog open={installModalOpen} onOpenChange={setInstallModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black text-[#008069] dark:text-emerald-400">
              <Smartphone className="w-5 h-5" />
              Instalar CF WhatsApp no Celular
            </DialogTitle>
            <DialogDescription className="text-xs">
              Use o WhatsApp do CorpFlats como um aplicativo dedicado na tela inicial do seu celular, separado do restante do ERP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                <span>📱 Modo Aplicativo em Tela Cheia</span>
                <Badge className="bg-[#008069] text-white text-[10px]">
                  {isStandaloneApp ? 'Ativo' : 'Disponível'}
                </Badge>
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                O Modo App oculta o menu lateral do sistema hoteleiro e deixa apenas o WhatsApp em 100% da tela, igual ao aplicativo oficial.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  toggleStandaloneMode(!isStandaloneApp)
                  setInstallModalOpen(false)
                }}
                className="w-full bg-[#008069] hover:bg-emerald-700 text-white font-bold text-xs rounded-xl"
              >
                {isStandaloneApp ? 'Voltar ao Modo Com Menu do Sistema' : 'Ativar Modo App Tela Cheia Agora'}
              </Button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <p className="font-bold text-slate-900 dark:text-slate-100">Como fixar o ícone na Tela Inicial do Celular:</p>
              <ul className="space-y-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                <li>• <strong>No Android (Chrome):</strong> Toque nos 3 pontinhos <strong>(⋮)</strong> no canto superior e selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</li>
                <li>• <strong>No iPhone (Safari):</strong> Toque no botão <strong>Compartilhar (⬆️)</strong> na barra inferior e escolha <strong>"Adicionar à Tela de Início"</strong>.</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setInstallModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: INICIAR NOVO CHAT */}
      <Dialog open={newChatModalOpen} onOpenChange={setNewChatModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              Iniciar Nova Conversa no WhatsApp
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione um hóspede da base do PMS ou informe um número de telefone com DDD.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto py-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                1. Selecionar Hóspede com Reserva no PMS:
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Filtrar por nome, flat ou código de reserva..."
                  value={pmsResSearch}
                  onChange={e => setPmsResSearch(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-xl"
                />
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                {loadingPmsRes ? (
                  <div className="p-4 text-center text-xs text-slate-400">Carregando reservas...</div>
                ) : filteredPmsRes.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">Nenhum hóspede encontrado.</div>
                ) : (
                  filteredPmsRes.map(r => (
                    <div
                      key={r.id}
                      onClick={() => handleStartNewChat(r.guestPhone, r.guestName, r.id)}
                      className="p-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{r.guestName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Flat {r.flatNumber} • {r.code} • {r.guestPhone || 'Sem telefone'}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs font-bold text-emerald-600">
                        Abrir Chat
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                2. Ou digitar número manualmente:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500">Telefone (com DDD):</label>
                  <Input
                    placeholder="Ex: 22997124021"
                    value={manualPhone}
                    onChange={e => setManualPhone(e.target.value)}
                    className="h-8 text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-500">Nome do Contato:</label>
                  <Input
                    placeholder="Ex: Carlos Silva"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    className="h-8 text-xs rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500">Mensagem Inicial (Opcional):</label>
                <Textarea
                  rows={2}
                  placeholder="Olá! Como podemos ajudar?"
                  value={manualInitialMsg}
                  onChange={e => setManualInitialMsg(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>
              <Button
                size="sm"
                onClick={() => handleStartNewChat(manualPhone, manualName, undefined, manualInitialMsg)}
                disabled={!manualPhone.trim()}
                className="w-full bg-[#008069] hover:bg-emerald-700 text-white text-xs font-bold gap-1 rounded-xl shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Iniciar Chat com Telefone Digitado</span>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewChatModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: ENVIAR MÍDIA POR URL */}
      <Dialog open={attachModalOpen} onOpenChange={setAttachModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <ExternalLink className="w-5 h-5 text-emerald-600" />
              Enviar Arquivo por URL Pública
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold">URL Pública do Arquivo:</label>
              <Input
                placeholder="https://corpflats.com.br/..."
                value={attachUrl}
                onChange={e => setAttachUrl(e.target.value)}
                className="text-xs h-8 rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">Legenda (Opcional):</label>
              <Input
                placeholder="Segue arquivo..."
                value={attachCaption}
                onChange={e => setAttachCaption(e.target.value)}
                className="text-xs h-8 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAttachModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={sending || !attachUrl.trim()}
              onClick={handleSendAttachment}
              className="bg-[#008069] hover:bg-emerald-700 text-white text-xs font-bold gap-1"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CORRIGIR RESPOSTA & ENSINAR SOFIA */}
      <Dialog open={correctModalOpen} onOpenChange={setCorrectModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black text-emerald-800 dark:text-emerald-300">
              <span>✏️</span> Corrigir Resposta & Ensinar Sofia
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Ensine a regra correta para a IA e retifique cordialmente com o hóspede no WhatsApp em 1 clique.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs overflow-y-auto">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Mensagem Original da Sofia:
              </span>
              <p className="italic text-slate-700 dark:text-slate-300 leading-relaxed">
                "{selectedMsgForCorrection?.text || 'Sem texto'}"
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span>🧠</span> O que a Sofia deve aprender? (Diretriz / Regra)
              </label>
              <Textarea
                rows={3}
                value={correctionGuideline}
                onChange={e => setCorrectionGuideline(e.target.value)}
                placeholder="Ex: O flat 905 tem cama queen e o checkout é às 11:00."
                className="text-xs"
              />
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <span>💬</span> Mensagem Cordial de Retificação para o WhatsApp
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Enviar ao Hóspede</span>
                  <input
                    type="checkbox"
                    checked={sendToGuest}
                    onChange={e => setSendToGuest(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer h-4 w-4"
                  />
                </div>
              </div>
              <Textarea
                rows={3}
                value={rectificationText}
                onChange={e => setRectificationText(e.target.value)}
                disabled={!sendToGuest}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCorrectModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCorrection}
              disabled={savingCorrection || !correctionGuideline.trim()}
              className="bg-[#008069] hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {savingCorrection ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {sendToGuest ? 'Salvar Diretriz & Enviar Retificação' : 'Salvar Apenas na IA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  if (isStandaloneApp) {
    return mainContent
  }

  return <Shell>{mainContent}</Shell>
}
