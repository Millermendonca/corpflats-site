import React, { useState, useEffect, useRef, useMemo } from 'react'
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
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
  Info,
  Wifi,
  MapPin,
  AlertCircle,
  X,
  Download,
  Smartphone,
  FileCheck
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
  lastMessage?: {
    text: string
    timestamp: string
    fromMe: boolean
    sender: string
    type: string
  }
  reservation?: any
}

const EMOJI_LIST = [
  '👋', '😊', '🏨', '🔑', '🥐', '☕', '🚗', '⭐', '📄', '✅', '❤️', '🕒', '📍', '📱', '✨', '👍', '🙏', '🏖️', '🚪', '🛎️'
]

export default function WhatsappChat() {
  const [, setLocation] = useLocation()
  const { data: user } = useGetMe()
  const { toast } = useToast()

  // Conversations State
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [activePhone, setActivePhone] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'active' | 'today' | 'pinned'>('all')

  // UI Panels
  const [showDossier, setShowDossier] = useState(true)
  const [isMobileListOpen, setIsMobileListOpen] = useState(true)

  // Message Input State
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)

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

  // Attachment Dialog
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [attachType, setAttachType] = useState<'image' | 'document'>('image')
  const [attachUrl, setAttachUrl] = useState('')
  const [attachName, setAttachName] = useState('')
  const [attachCaption, setAttachCaption] = useState('')

  // Scroll to bottom reference
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Fetch Conversations list
  const fetchConversations = async (silent = false) => {
    if (!silent) setLoadingConversations(true)
    try {
      const res = await fetch('/api/whatsapp/chat/conversations?limit=80')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
      }
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Erro ao carregar conversas', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (!silent) setLoadingConversations(false)
    }
  }

  // Fetch Active Conversation Messages
  const fetchActiveMessages = async (phone: string, silent = false) => {
    if (!silent) setLoadingMessages(true)
    try {
      const res = await fetch(`/api/whatsapp/chat/conversations/${phone}`)
      if (res.ok) {
        const data = await res.json()
        if (data.conversation) {
          setActiveConversation(data.conversation)
          setMessages(data.conversation.messages || [])
        }
      }
    } catch (err: any) {
      if (!silent) {
        toast({ title: 'Erro ao carregar histórico', description: err.message, variant: 'destructive' })
      }
    } finally {
      if (!silent) setLoadingMessages(false)
    }
  }

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

  // Initial Load
  useEffect(() => {
    fetchConversations()
    fetchZapiStatus()
    const statusInterval = setInterval(fetchZapiStatus, 20000)
    return () => clearInterval(statusInterval)
  }, [])

  // Auto-sync polling for active conversation (every 4.5 seconds)
  useEffect(() => {
    if (!activePhone) return

    fetchActiveMessages(activePhone)
    markAsRead(activePhone)

    const interval = setInterval(() => {
      fetchActiveMessages(activePhone, true)
      fetchConversations(true)
    }, 4500)

    return () => clearInterval(interval)
  }, [activePhone])

  // Scroll down whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Select conversation
  const handleSelectConversation = (conv: ChatConversation) => {
    setActivePhone(conv.phone)
    setActiveConversation(conv)
    setIsMobileListOpen(false)
    markAsRead(conv.phone)
  }

  // Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!activePhone) return
    const textToSend = inputMessage.trim()
    if (!textToSend && !sending) return

    setSending(true)

    // Optimistic message
    const tempId = 'temp-' + Date.now()
    const optimisticMsg: ChatMessage = {
      id: tempId,
      fromMe: true,
      sender: 'operator',
      senderName: user?.username || 'Operador',
      text: textToSend,
      type: 'text',
      timestamp: new Date().toISOString(),
      status: 'sent'
    }

    setMessages(prev => [...prev, optimisticMsg])
    setInputMessage('')

    try {
      const res = await fetch('/api/whatsapp/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone,
          message: textToSend,
          type: 'text',
          reservationId: activeConversation?.reservationId
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Falha ao enviar mensagem')
      }

      const resData = await res.json()
      if (resData.message) {
        setMessages(prev => prev.map(m => m.id === tempId ? resData.message : m))
      }

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

  // Send Attachment (Image or Document)
  const handleSendAttachment = async () => {
    if (!activePhone || !attachUrl.trim()) {
      toast({ title: 'Insira a URL do arquivo', variant: 'destructive' })
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/whatsapp/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: activePhone,
          message: attachCaption,
          type: attachType,
          mediaUrl: attachUrl.trim(),
          fileName: attachName.trim() || (attachType === 'document' ? 'documento.pdf' : 'imagem.jpg'),
          caption: attachCaption.trim(),
          reservationId: activeConversation?.reservationId
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao enviar mídia')
      }

      toast({ title: 'Mídia enviada com sucesso!' })
      setAttachModalOpen(false)
      setAttachUrl('')
      setAttachName('')
      setAttachCaption('')
      fetchActiveMessages(activePhone)
      fetchConversations(true)
    } catch (err: any) {
      toast({ title: 'Erro de envio', description: err.message, variant: 'destructive' })
    } finally {
      setSending(false)
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

  // Quick message template insertion helper
  const handleInsertQuickMessage = (templateType: string) => {
    const res = activeConversation?.reservation || {}
    const guestFirstName = (activeConversation?.name || 'Hóspede').split(' ')[0]
    const flatNum = activeConversation?.flatNumber || res.flatNumber || '101'
    const code = activeConversation?.reservationCode || res.code || 'RES-101'

    let text = ''
    switch (templateType) {
      case 'wifi':
        text = `Olá, *${guestFirstName}*! Seguem os dados de acesso à rede Wi-Fi do seu flat:
📶 *Rede:* CorpFlats-Hospedes
🔑 *Senha:* corpflats2026

Fique à vontade e tenha uma excelente estadia!`
        break
      case 'checkin':
        text = `Olá, *${guestFirstName}*! Para agilizar sua entrada no Flat ${flatNum}, preencha sua ficha rápida de pré check-in:
📝 https://corpflats.onrender.com/pre-checkin/${code}

Assim liberamos seu acesso imediatamente na portaria!`
        break
      case 'cafe':
        text = `Bom dia, *${guestFirstName}*! Nosso café da manhã é servido das 06:30 às 09:30.
Você pode escolher os itens do seu café pelo link:
🥐 https://corpflats.onrender.com/minha-reserva/${code}/cafe

Qualquer dúvida estamos à disposição!`
        break
      case 'checkout':
        text = `Olá, *${guestFirstName}*! Esperamos que sua estadia tenha sido excelente!
Lembramos que o horário de check-out é até as 12:00.
Ao sair, basta deixar a chave na recepção e confirmar a saída aqui:
🚪 https://corpflats.onrender.com/checkout/${code}

Tenha um ótimo retorno!`
        break
      case 'location':
        text = `Olá, *${guestFirstName}*! Segue a localização do CorpFlats:
📍 *Endereço:* Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ
🗺️ *Google Maps:* https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209

Estamos te aguardando!`
        break
      case 'manual':
        text = `Olá, *${guestFirstName}*! Segue o Guia e Manual do Flat ${flatNum} com todas as instruções de ar-condicionado, TV e comodidades:
📖 https://corpflats.onrender.com/Manual_do_Hospede_CorpFlats.pdf

Desejamos uma ótima hospedagem!`
        break
      case 'review':
        text = `Olá, *${guestFirstName}*! Foi um prazer recebê-lo no CorpFlats!
Poderia nos avaliar com 5 estrelas no Google Maps? Leva menos de 1 minuto e nos ajuda muito:
⭐ https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209

Muito obrigado!`
        break
    }

    setInputMessage(prev => (prev ? prev + '\n\n' + text : text))
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  // Filtered conversation list
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // Filter tab
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

      // Search query
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

  // Helper date formatter for message timestamps
  const formatTime = (isoString?: string) => {
    if (!isoString) return ''
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // Format date for conversation list
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

  return (
    <Shell>
      <div className="flex h-[calc(100dvh-64px)] md:h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans">
        
        {/* COLUNA 1: LISTA DE CONVERSAS */}
        <div className={`${isMobileListOpen ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-[380px] lg:w-[420px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0 h-full overflow-hidden`}>
          
          {/* Header Superior da Barra Lateral */}
          <div className="p-3.5 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <MessageSquare className="w-4.5 h-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-1.5">
                  WhatsApp PMS
                  {zapiStatus?.connected ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800" title="Instância Z-API Online">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800" title="Clique para abrir a tela de conexão">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Offline
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {conversations.length} conversas sincronizadas
                </p>
              </div>
            </div>

            {/* Ações do Header */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="Atualizar conversas"
                onClick={() => fetchConversations()}
              >
                <RefreshCw className={`w-4 h-4 ${loadingConversations ? 'animate-spin text-emerald-600' : ''}`} />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="Configurações Z-API"
                onClick={() => setLocation('/zapi-conexao')}
              >
                <Smartphone className="w-4 h-4" />
              </Button>

              <Button
                size="sm"
                className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 shadow-2xs"
                onClick={openNewChatDialog}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Chat</span>
              </Button>
            </div>
          </div>

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
                    ? 'bg-emerald-600 text-white shadow-2xs'
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
                    ? 'bg-emerald-600 text-white shadow-2xs'
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
                    ? 'bg-emerald-600 text-white shadow-2xs'
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
                    ? 'bg-emerald-600 text-white shadow-2xs'
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
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-emerald-600'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Avatar do Hóspede */}
                    <div className="relative shrink-0">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-sm flex items-center justify-center shadow-2xs">
                        {initials}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-900 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Conteúdo da Conversa */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {conv.name || conv.formattedPhone}
                          </span>
                          {conv.flatNumber && (
                            <span className="text-[9.5px] font-black px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 shrink-0 border border-emerald-300 dark:border-emerald-800">
                              Flat {conv.flatNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {formatConvDate(conv.lastMessage?.timestamp)}
                        </span>
                      </div>

                      {/* Código da Reserva & Canal */}
                      <div className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-slate-400 mb-1">
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
                      </div>

                      {/* Snippet da Última Mensagem */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
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

                        {/* Ícones de Ação (Pin) */}
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

        {/* COLUNA 2: ÁREA DE MENSAGENS E CHAT */}
        <div className={`${!isMobileListOpen ? 'flex' : 'hidden md:flex'} flex-col flex-1 h-full min-w-0 bg-slate-50 dark:bg-slate-950 relative overflow-hidden`}>
          
          {activeConversation ? (
            <>
              {/* Header do Chat Ativo */}
              <div className="h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 z-10 shadow-2xs">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Botão Voltar no Mobile */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 rounded-lg -ml-1 text-slate-600"
                    onClick={() => setIsMobileListOpen(true)}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shadow-2xs shrink-0">
                    {(activeConversation.name || 'H').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Detalhes do Hóspede */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                        {activeConversation.name}
                      </h3>
                      <span className="text-xs text-slate-500 font-mono">
                        {activeConversation.formattedPhone || activeConversation.phone}
                      </span>
                    </div>

                    {/* Pílula Resumo da Reserva */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {activeConversation.flatNumber && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                          Flat {activeConversation.flatNumber}
                        </Badge>
                      )}
                      {activeConversation.reservationCode && (
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {activeConversation.reservationCode}
                        </span>
                      )}
                      {activeConversation.reservation?.checkinDate && (
                        <span className="hidden sm:inline text-[10.5px]">
                          • {activeConversation.reservation.checkinDate.split('-').reverse().join('/')} a {activeConversation.reservation.checkoutDate.split('-').reverse().join('/')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações do Header do Chat */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    title="Atualizar mensagens"
                    onClick={() => fetchActiveMessages(activeConversation.phone)}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin text-emerald-600' : ''}`} />
                  </Button>

                  <a
                    href={`https://wa.me/${activeConversation.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors"
                    title="Abrir conversa no WhatsApp Web externo"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="hidden sm:inline">WhatsApp Externo</span>
                  </a>

                  <Button
                    variant="outline"
                    size="sm"
                    className={`h-8 px-2.5 rounded-lg text-xs font-bold gap-1.5 transition-colors ${
                      showDossier ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300' : ''
                    }`}
                    onClick={() => setShowDossier(!showDossier)}
                    title="Exibir/Ocultar Dossiê do Hóspede e Reserva"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Dossiê</span>
                  </Button>
                </div>
              </div>

              {/* Área de Mensagens (Wallpaper WhatsApp) */}
              <div 
                className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.03) 0%, transparent 80%)`,
                  backgroundSize: '24px 24px'
                }}
              >
                {/* Badge Informativo do Início */}
                <div className="text-center my-2">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-200/70 dark:bg-slate-800 text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 shadow-2xs">
                    🔒 Mensagens sincronizadas com Z-API Oficial CorpFlats
                  </span>
                </div>

                {loadingMessages && messages.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
                    <p className="text-xs text-slate-500">Carregando mensagens...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center space-y-2 max-w-sm mx-auto bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                    <MessageSquare className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Nenhuma mensagem trocada ainda</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Envie uma mensagem de boas-vindas ou use um dos atalhos rápidos abaixo.
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isFromMe = msg.fromMe
                    const prevMsg = messages[index - 1]
                    const showDateHeader = !prevMsg || new Date(prevMsg.timestamp).toDateString() !== new Date(msg.timestamp).toDateString()

                    return (
                      <React.Fragment key={msg.id || index}>
                        {/* Divisor de Data */}
                        {showDateHeader && (
                          <div className="text-center my-3">
                            <span className="px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 shadow-2xs">
                              {new Date(msg.timestamp).toLocaleDateString('pt-BR', { dateStyle: 'full' })}
                            </span>
                          </div>
                        )}

                        {/* Balão de Mensagem */}
                        <div className={`flex w-full ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[85%] sm:max-w-[75%] md:max-w-[65%] rounded-2xl p-3 shadow-xs relative space-y-1.5 transition-all ${
                              isFromMe
                                ? 'bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-800/60 rounded-tr-xs text-slate-900 dark:text-slate-100'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-tl-xs text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {/* Header do Balão: Remetente ou Régua Automática */}
                            {isFromMe ? (
                              <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border-b border-emerald-200/50 dark:border-emerald-800/40 pb-1 mb-1">
                                <span>{msg.senderName || 'CorpFlats'}</span>
                                {msg.triggerEvent && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-mono text-[9px]">
                                    🤖 Régua Automática
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-400 border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
                                <User className="w-3 h-3" />
                                <span>{activeConversation.name}</span>
                              </div>
                            )}

                            {/* Conteúdo de Mídia: Imagem */}
                            {msg.type === 'image' && msg.mediaUrl && (
                              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 my-1">
                                <img
                                  src={msg.mediaUrl}
                                  alt="Imagem compartilhada"
                                  className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                  onClick={() => window.open(msg.mediaUrl, '_blank')}
                                />
                              </div>
                            )}

                            {/* Conteúdo de Mídia: Documento / PDF */}
                            {msg.type === 'document' && msg.mediaUrl && (
                              <a
                                href={msg.mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 transition-colors my-1 group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                    {msg.fileName || 'documento.pdf'}
                                  </p>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Documento PDF</p>
                                </div>
                                <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              </a>
                            )}

                            {/* Conteúdo de Mídia: Áudio */}
                            {msg.type === 'audio' && msg.mediaUrl && (
                              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 my-1">
                                <audio controls src={msg.mediaUrl} className="w-full h-8" />
                              </div>
                            )}

                            {/* Texto Principal da Mensagem */}
                            {msg.text && (
                              <div className="text-xs md:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                                {msg.text}
                              </div>
                            )}

                            {/* Botões Interativos (se houver) */}
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

                            {/* Rodapé do Balão: Horário e Status */}
                            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-0.5">
                              <span>{formatTime(msg.timestamp)}</span>
                              {isFromMe && (
                                <>
                                  {msg.status === 'failed' ? (
                                    <AlertCircle className="w-3 h-3 text-rose-500" title="Falha no envio" />
                                  ) : msg.status === 'read' ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600" title="Lida" />
                                  ) : msg.status === 'delivered' ? (
                                    <CheckCheck className="w-3.5 h-3.5 text-slate-400" title="Entregue" />
                                  ) : (
                                    <Check className="w-3 h-3 text-slate-400" title="Enviada" />
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Barra de Atalhos Rápidos (Quick Messages) */}
              <div className="px-3 py-1.5 bg-slate-100/90 dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-300 shrink-0 flex items-center gap-1">
                  ⚡ Atalhos:
                </span>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('wifi')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  <span>Wi-Fi</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('checkin')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <FileCheck className="w-3 h-3 text-emerald-600" />
                  <span>Check-in Digital</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('cafe')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <Coffee className="w-3 h-3 text-amber-600" />
                  <span>Café da Manhã</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('checkout')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <Clock className="w-3 h-3 text-purple-600" />
                  <span>Check-out</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('location')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <MapPin className="w-3 h-3 text-rose-600" />
                  <span>GPS Localização</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('manual')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span>Manual (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInsertQuickMessage('review')}
                  className="h-6 px-2 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap shadow-2xs hover:scale-102 transition-transform"
                >
                  <span className="text-amber-500 text-xs">⭐</span>
                  <span>Avaliação Google</span>
                </button>
              </div>

              {/* Rodapé de Envio (Input Area) */}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-end gap-2 shrink-0">
                
                {/* Popover de Emojis */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Smile className="w-5 h-5" />
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

                {/* Dropdown de Anexo (Imagem ou Documento) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Paperclip className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                    <DropdownMenuItem
                      className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2"
                      onClick={() => {
                        setAttachType('image')
                        setAttachName('imagem.jpg')
                        setAttachModalOpen(true)
                      }}
                    >
                      <ImageIcon className="w-4 h-4 text-emerald-600" />
                      <span>Enviar Imagem / Foto</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer flex items-center gap-2 text-xs font-semibold py-2"
                      onClick={() => {
                        setAttachType('document')
                        setAttachName('Manual_do_Hospede_CorpFlats.pdf')
                        setAttachUrl('https://corpflats.onrender.com/Manual_do_Hospede_CorpFlats.pdf')
                        setAttachModalOpen(true)
                      }}
                    >
                      <FileText className="w-4 h-4 text-rose-600" />
                      <span>Enviar Documento PDF</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Campo de Digitação */}
                <div className="flex-1 min-w-0">
                  <Textarea
                    ref={textareaRef}
                    rows={1}
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    placeholder="Digite uma mensagem (Enter para enviar, Shift+Enter para nova linha)..."
                    className="min-h-[40px] max-h-32 text-xs md:text-sm py-2.5 px-3 rounded-xl resize-none bg-slate-100 dark:bg-slate-800/80 border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                  />
                </div>

                {/* Botão de Envio */}
                <Button
                  type="button"
                  disabled={sending || !inputMessage.trim()}
                  onClick={() => handleSendMessage()}
                  className="h-10 w-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white p-0 shrink-0 shadow-xs flex items-center justify-center disabled:opacity-50"
                >
                  {sending ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </>
          ) : (
            /* Estado Vazio (Nenhuma conversa selecionada) */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-600 flex items-center justify-center shadow-lg">
                <MessageSquare className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  WhatsApp Web Integrado ao CorpFlats
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Acompanhe em tempo real todas as mensagens enviadas aos hóspedes (réguas automáticas, avisos de café, confirmações) e responda diretamente pelo painel.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 rounded-xl shadow-xs px-4 py-2"
                onClick={openNewChatDialog}
              >
                <Plus className="w-4 h-4" />
                <span>Iniciar Nova Conversa</span>
              </Button>
            </div>
          )}
        </div>

        {/* COLUNA 3: DOSSIÊ LATERAL DA RESERVA / HÓSPEDE (Collapsible) */}
        {activeConversation && showDossier && (
          <div className="hidden xl:flex flex-col w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shrink-0 h-full overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            
            {/* Header do Dossiê */}
            <div className="p-4 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black uppercase text-slate-900 dark:text-slate-100 tracking-wider">
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

            {/* Informações do Hóspede */}
            <div className="p-4 space-y-3">
              <div className="text-center space-y-1 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="w-14 h-14 rounded-full bg-emerald-600 text-white font-black text-lg flex items-center justify-center mx-auto shadow-xs">
                  {(activeConversation.name || 'H').slice(0, 2).toUpperCase()}
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 pt-1">
                  {activeConversation.name}
                </h4>
                <p className="text-xs text-slate-500 font-mono">
                  {activeConversation.formattedPhone || activeConversation.phone}
                </p>
              </div>

              {/* Detalhes da Reserva Vinculada */}
              {activeConversation.reservation ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Reserva:</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {activeConversation.reservation.code}
                    </span>
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

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Hóspedes:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {activeConversation.reservation.guestCount || 1} pessoas
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Valor Total:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {Number(activeConversation.reservation.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Pagamento:</span>
                    <Badge
                      variant={activeConversation.reservation.paymentStatus === 'pago' ? 'default' : 'outline'}
                      className={`text-[10px] uppercase font-bold ${
                        activeConversation.reservation.paymentStatus === 'pago'
                          ? 'bg-emerald-600 text-white'
                          : 'border-amber-500 text-amber-700 bg-amber-50'
                      }`}
                    >
                      {activeConversation.reservation.paymentStatus || 'Pendente'}
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center space-y-1">
                  <p className="text-xs text-slate-500">Nenhuma reserva PMS associada a este telefone.</p>
                </div>
              )}
            </div>

            {/* Links Rápidos do PMS */}
            {activeConversation.reservation && (
              <div className="p-4 space-y-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  Acessos Diretos no PMS
                </span>

                <a
                  href={`/reservas?code=${activeConversation.reservation.code}`}
                  className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 transition-colors"
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
                  className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                    Portal do Hóspede
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>

                <a
                  href={`/pedidos-cafe`}
                  className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5 text-amber-600" />
                    Painel do Café da Manhã
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </div>
            )}
          </div>
        )}

      </div>

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
            {/* Opção 1: Selecionar Hóspede do PMS */}
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
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          {r.guestName}
                        </div>
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

            {/* Opção 2: Contato Avulso */}
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
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 rounded-xl shadow-xs"
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

      {/* MODAL: ENVIAR MÍDIA / ANEXO */}
      <Dialog open={attachModalOpen} onOpenChange={setAttachModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              {attachType === 'image' ? (
                <>
                  <ImageIcon className="w-5 h-5 text-emerald-600" />
                  Enviar Imagem no WhatsApp
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-rose-600" />
                  Enviar Documento PDF no WhatsApp
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Envie fotos do quarto, recibos ou documentos diretamente na conversa do hóspede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-bold">URL Pública do Arquivo ({attachType === 'image' ? 'JPG/PNG' : 'PDF'}):</label>
              <Input
                placeholder="https://corpflats.onrender.com/..."
                value={attachUrl}
                onChange={e => setAttachUrl(e.target.value)}
                className="text-xs h-8 rounded-xl"
              />
            </div>

            {attachType === 'document' && (
              <div className="space-y-1">
                <label className="text-xs font-bold">Nome do Arquivo:</label>
                <Input
                  placeholder="Manual_do_Hospede_CorpFlats.pdf"
                  value={attachName}
                  onChange={e => setAttachName(e.target.value)}
                  className="text-xs h-8 rounded-xl"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold">Legenda da Mídia (Opcional):</label>
              <Input
                placeholder="Ex: Segue foto do quarto ou manual em anexo"
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 shadow-xs"
            >
              {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Enviar Arquivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Shell>
  )
}
