import { useState, useEffect, useRef } from "react"
import { useLocation } from "wouter"
import { useGetMe } from "@workspace/api-client-react"
import { Shell } from "@/components/layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog"
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { 
  MessageSquare, 
  Send, 
  Clock, 
  Sparkles, 
  CheckCheck, 
  ExternalLink, 
  Phone, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  QrCode, 
  Smartphone, 
  Sliders, 
  ListFilter, 
  Play, 
  Trash2, 
  Edit3, 
  Plus, 
  Zap, 
  Key, 
  Wifi, 
  MapPin, 
  Coffee, 
  User, 
  Calendar, 
  DoorOpen, 
  Star, 
  HelpCircle,
  Eye,
  ShieldCheck,
  RotateCcw,
  FileText
} from "lucide-react"
import { AccessDenied } from "@/components/access-denied"
import { useQuickMessages, WhatsAppQuickMessage, renderQuickMessage } from "@/hooks/use-quick-messages"

interface ButtonAction {
  id: string
  type: "URL" | "CALL" | "REPLY"
  label: string
  url?: string
  phone?: string
}

export const CHANNEL_OPTIONS = [
  { 
    id: "site", 
    label: "Site Oficial", 
    icon: "🌐", 
    description: "Reservas feitas diretamente pelo motor de reservas do site CorpFlats",
    badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200"
  },
  { 
    id: "whatsapp", 
    label: "WhatsApp Direto", 
    icon: "💬", 
    description: "Reservas fechadas diretamente pelo time de vendas via WhatsApp",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200"
  },
  { 
    id: "booking", 
    label: "Booking.com", 
    icon: "🏨", 
    description: "Reservas recebidas via Booking.com (OTA)",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200"
  },
  { 
    id: "airbnb", 
    label: "Airbnb", 
    icon: "🔴", 
    description: "Reservas recebidas via Airbnb (OTA)",
    badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200"
  },
  { 
    id: "outros", 
    label: "Balcão / Outros", 
    icon: "🏢", 
    description: "Reservas presenciais, corporativas, Decolar, Expedia ou outros canais",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200"
  },
]

interface WhatsAppTemplate {
  id: string
  triggerEvent: string
  title: string
  description?: string
  enabled: boolean
  channels?: string[]
  triggerTiming: "immediate" | "before_event" | "after_event" | "fixed_time_day_of" | "fixed_time_day_before"
  offsetValue: number
  offsetUnit: "minutes" | "hours" | "days"
  fixedTime?: string
  message: string
  footer?: string
  buttons?: ButtonAction[]
  hasAttachment?: boolean
  documentUrl?: string
  documentName?: string
  documentCaption?: string
}

interface QueueItem {
  id: string
  reservationId: number
  reservationCode: string
  guestName: string
  guestPhone: string
  channel?: string
  triggerEvent: string
  templateId: string
  title: string
  footer?: string
  scheduledFor: string
  status: "scheduled" | "sent" | "failed" | "cancelled"
  sentAt?: string | null
  error?: string | null
  method?: string
  renderedMessage: string
  renderedButtons?: ButtonAction[]
  documentUrl?: string
  documentName?: string
  createdAt?: string
}

interface HistoryItem {
  id: string
  reservationCode?: string
  guestName: string
  guestPhone: string
  triggerEvent: string
  message: string
  buttons?: ButtonAction[]
  documentUrl?: string
  documentName?: string
  status: "sent" | "failed"
  method: string
  error?: string | null
  sentAt: string
}

interface ZapiConfig {
  instanceId: string
  token: string
  clientToken: string
  enabled: boolean
  deliveryMode?: "text_links" | "buttons" | "auto"
  fallbackToText: boolean
  wifiNetwork: string
  wifiPassword: string
  googleReviewUrl: string
  guestGuidePdfUrl?: string
  guestGuidePdfName?: string
}

const TAG_GROUPS = [
  {
    category: "👤 Hóspede",
    tags: [
      { tag: "{{nome_hospede}}", label: "Nome Completo", example: "Carlos Silva" },
      { tag: "{{primeiro_nome}}", label: "Primeiro Nome", example: "Carlos" },
      { tag: "{{telefone_hospede}}", label: "Telefone WhatsApp", example: "(22) 99887-7665" },
    ]
  },
  {
    category: "🏨 Reserva",
    tags: [
      { tag: "{{numero_reserva}}", label: "Cód. Reserva", example: "RES-113-0034" },
      { tag: "{{quarto}}", label: "Flat / Quarto", example: "113" },
      { tag: "{{data_checkin}}", label: "Data Entrada", example: "03/09/2026" },
      { tag: "{{data_checkout}}", label: "Data Saída", example: "05/09/2026" },
      { tag: "{{horario_checkin}}", label: "Horário Check-in", example: "14:00" },
      { tag: "{{horario_checkout}}", label: "Horário Check-out", example: "12:00" },
      { tag: "{{num_hospedes}}", label: "Qtd. Hóspedes", example: "2" },
      { tag: "{{num_diarias}}", label: "Qtd. Diárias", example: "2" },
      { tag: "{{valor_total}}", label: "Valor Total", example: "R$ 450,00" },
      { tag: "{{status_pagamento}}", label: "Status Pagto.", example: "Confirmado / Pago" },
      { tag: "{{canal_reserva}}", label: "Canal de Venda", example: "Site Oficial" },
    ]
  },
  {
    category: "💳 Pagamento & PIX",
    tags: [
      { tag: "{{valor_total}}", label: "Valor Total da Reserva", example: "R$ 450,00" },
      { tag: "{{valor_pago}}", label: "Quanto foi Pago", example: "R$ 200,00" },
      { tag: "{{quanto_falta}}", label: "Quanto Falta Pagar", example: "R$ 250,00" },
      { tag: "{{saldo_restante}}", label: "Saldo Restante", example: "R$ 250,00" },
      { tag: "{{status_confirmacao}}", label: "Status de Confirmação", example: "Pré-Reserva" },
      { tag: "{{chave_pix}}", label: "Chave PIX Hotel", example: "47.964.813/0001-65" },
      { tag: "{{titular_pix}}", label: "Titular PIX", example: "CorpFlats Hospedagem" },
      { tag: "{{instrucao_saldo}}", label: "Instrução Dinâmica de Saldo", example: "Saldo restante de R$ 250,00 a acertar no check-in." },
    ]
  },
  {
    category: "🏢 Propriedade & Wi-Fi",
    tags: [
      { tag: "{{nome_hotel}}", label: "Nome Hotel", example: "CorpFlats" },
      { tag: "{{endereco_hotel}}", label: "Endereço", example: "Rua Conselheiro Otaviano, 209" },
      { tag: "{{link_maps}}", label: "Link GPS Google", example: "https://maps.google.com/..." },
      { tag: "{{wifi_rede}}", label: "Nome Wi-Fi", example: "CorpFlats-Hospedes" },
      { tag: "{{wifi_senha}}", label: "Senha Wi-Fi", example: "corpflats2026" },
      { tag: "{{telefone_hotel}}", label: "WhatsApp Administração", example: "5522997124021" },
    ]
  },
  {
    category: "🔗 Links Inteligentes (Personalizados)",
    tags: [
      { tag: "{{link_checkin_digital}}", label: "📝 Ficha Check-in Online", example: "https://.../pre-checkin/RES-..." },
      { tag: "{{link_portal_hospede}}", label: "🏨 Portal do Hóspede", example: "https://.../portal-hospede/RES-..." },
      { tag: "{{link_cafe_manha}}", label: "🥐 Link do Café da Manhã", example: "https://.../cafe/RES-..." },
      { tag: "{{link_checkout}}", label: "🚪 Check-out Expresso", example: "https://.../checkout/RES-..." },
      { tag: "{{link_avaliacao_google}}", label: "⭐ Avaliação Google Maps", example: "https://g.page/r/.../review" },
      { tag: "{{link_guia_hospede}}", label: "📖 Manual do Hóspede (PDF)", example: "https://.../Manual_do_Hospede.pdf" },
    ]
  }
]

export default function WhatsappAutomation() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()

  // Tab control
  const [activeTab, setActiveTab] = useState<string>("rules")

  // State: Templates
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [currentTemplate, setCurrentTemplate] = useState<WhatsAppTemplate | null>(null)

  // Editor states
  const [editingMessage, setEditingMessage] = useState<string>("")
  const [editingTitle, setEditingTitle] = useState<string>("")
  const [editingFooter, setEditingFooter] = useState<string>("")
  const [editingTiming, setEditingTiming] = useState<WhatsAppTemplate["triggerTiming"]>("immediate")
  const [editingOffsetValue, setEditingOffsetValue] = useState<number>(0)
  const [editingOffsetUnit, setEditingOffsetUnit] = useState<"minutes" | "hours" | "days">("hours")
  const [editingFixedTime, setEditingFixedTime] = useState<string>("09:00")
  const [editingButtons, setEditingButtons] = useState<ButtonAction[]>([])
  const [editingChannels, setEditingChannels] = useState<string[]>(["site", "whatsapp", "booking", "airbnb", "outros"])
  const [editingEnabled, setEditingEnabled] = useState<boolean>(true)
  const [editingHasAttachment, setEditingHasAttachment] = useState<boolean>(false)
  const [editingDocumentUrl, setEditingDocumentUrl] = useState<string>("")
  const [editingDocumentName, setEditingDocumentName] = useState<string>("Manual_do_Hospede_CorpFlats.pdf")
  const [editingDocumentCaption, setEditingDocumentCaption] = useState<string>("")
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // State: Queue & History
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loadingQueue, setLoadingQueue] = useState<boolean>(false)
  const [queueSearch, setQueueSearch] = useState<string>("")

  // State: Z-API Config & Status
  const [config, setConfig] = useState<ZapiConfig>({
    instanceId: "",
    token: "",
    clientToken: "",
    enabled: false,
    deliveryMode: "text_links",
    fallbackToText: true,
    wifiNetwork: "CorpFlats-Hospedes",
    wifiPassword: "corpflats2026",
    googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
  })
  const [statusInfo, setStatusInfo] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false)

  // State: Quick Test Modal
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false)
  const [testPhone, setTestPhone] = useState<string>("")
  const [testMessage, setTestMessage] = useState<string>("")
  const [testReservationId, setTestReservationId] = useState<string>("")
  const [testIncludeButtons, setTestIncludeButtons] = useState<boolean>(true)
  const [testIncludeDocument, setTestIncludeDocument] = useState<boolean>(false)
  const [testSendMode, setTestSendMode] = useState<"text" | "buttons">("text")
  const [sendingTest, setSendingTest] = useState<boolean>(false)

  // State: Reservations list for preview & testing
  const [reservations, setReservations] = useState<any[]>([])
  const [selectedPreviewResCode, setSelectedPreviewResCode] = useState<string>("sample")

  // State: View Message Dialog
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false)
  const [previewModalItem, setPreviewModalItem] = useState<QueueItem | null>(null)

  // Mensagens Rápidas (Manuais) State
  const {
    quickMessages,
    toggleQuickMessage,
    saveQuickMessage,
    deleteQuickMessage,
    resetQuickMessages
  } = useQuickMessages()

  const [qmModalOpen, setQmModalOpen] = useState(false)
  const [editingQm, setEditingQm] = useState<WhatsAppQuickMessage | null>(null)
  const [qmTitle, setQmTitle] = useState("")
  const [qmShortLabel, setQmShortLabel] = useState("")
  const [qmIcon, setQmIcon] = useState("💬")
  const [qmCategory, setQmCategory] = useState("Geral")
  const [qmDescription, setQmDescription] = useState("")
  const [qmEnabled, setQmEnabled] = useState(true)
  const [qmMessage, setQmMessage] = useState("")
  const [qmFooter, setQmFooter] = useState("")
  const [hoveredPreviewQm, setHoveredPreviewQm] = useState<WhatsAppQuickMessage | null>(null)

  const handleOpenCreateQm = () => {
    setEditingQm(null)
    setQmTitle("")
    setQmShortLabel("")
    setQmIcon("💬")
    setQmCategory("Geral")
    setQmDescription("")
    setQmEnabled(true)
    setQmMessage("Olá, *{{primeiro_nome}}*! ")
    setQmFooter("CorpFlats • Central de Atendimento")
    setQmModalOpen(true)
  }

  const handleOpenEditQm = (qm: WhatsAppQuickMessage) => {
    setEditingQm(qm)
    setQmTitle(qm.title)
    setQmShortLabel(qm.shortLabel || qm.title.slice(0, 12))
    setQmIcon(qm.icon || "💬")
    setQmCategory(qm.category || "Geral")
    setQmDescription(qm.description || "")
    setQmEnabled(qm.enabled !== false)
    setQmMessage(qm.message)
    setQmFooter(qm.footer || "")
    setQmModalOpen(true)
  }

  const handleSaveQmForm = async () => {
    if (!qmTitle.trim() || !qmMessage.trim()) {
      toast({ title: "Preencha o título e a mensagem", variant: "destructive" })
      return
    }

    const newItem: WhatsAppQuickMessage = {
      id: editingQm ? editingQm.id : `qm_custom_${Date.now()}`,
      title: qmTitle.trim(),
      shortLabel: qmShortLabel.trim() || qmTitle.trim().slice(0, 12),
      icon: qmIcon || "💬",
      category: qmCategory || "Geral",
      description: qmDescription.trim(),
      enabled: qmEnabled,
      message: qmMessage.trim(),
      footer: qmFooter.trim(),
      buttons: editingQm?.buttons || []
    }

    await saveQuickMessage(newItem)
    setQmModalOpen(false)
  }

  // Initial Data Fetching
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get("tab")
      if (tabParam) {
        setActiveTab(tabParam)
      }
    }
    fetchTemplates()
    fetchQueue()
    fetchConfig()
    fetchReservations()
    checkStatus()
  }, [])

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/whatsapp/templates")
      if (res.ok) {
        const data = await res.json()
        setTemplates(data)
        if (data.length > 0 && !selectedTemplateId) {
          selectTemplateForEditing(data[0])
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchQueue = async () => {
    setLoadingQueue(true)
    try {
      const res = await fetch("/api/whatsapp/queue")
      if (res.ok) {
        const data = await res.json()
        setQueue(data.queue || [])
        setHistory(data.history || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingQueue(false)
    }
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/whatsapp/config")
      if (res.ok) {
        const data = await res.json()
        setConfig(prev => ({ ...prev, ...data }))
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchReservations = async () => {
    try {
      const res = await fetch("/api/pms/calendar?start=2026-09-01&end=2026-09-30")
      if (res.ok) {
        const data = await res.json()
        setReservations(data.reservations || [])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const checkStatus = async (showToast = false) => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/whatsapp/status")
      if (res.ok) {
        const data = await res.json()
        setStatusInfo(data)
        if (showToast) {
          if (data.connected) {
            toast({
              title: "🟢 WhatsApp Conectado com Sucesso!",
              description: data.phone 
                ? `Instância Z-API online no aparelho ${data.phone}. Pronta para envios!`
                : "Instância Z-API online e pronta para disparos com botões."
            })
          } else {
            toast({
              title: "Atenção: Instância Desconectada",
              description: data.error || data.message || "Aguardando leitura do QR Code na Z-API.",
              variant: "destructive"
            })
          }
        }
      } else {
        if (showToast) {
          toast({
            title: "Falha na Verificação",
            description: "Não foi possível contactar a Z-API. Verifique as credenciais.",
            variant: "destructive"
          })
        }
      }
    } catch (e: any) {
      console.error(e)
      if (showToast) {
        toast({ title: "Erro de Conexão", description: e.message, variant: "destructive" })
      }
    } finally {
      setLoadingStatus(false)
    }
  }

  const selectTemplateForEditing = (tpl: WhatsAppTemplate) => {
    setSelectedTemplateId(tpl.id)
    setCurrentTemplate(tpl)
    setEditingTitle(tpl.title || "")
    setEditingMessage(tpl.message || "")
    setEditingFooter(tpl.footer || "")
    setEditingTiming(tpl.triggerTiming || "immediate")
    setEditingOffsetValue(tpl.offsetValue || 0)
    setEditingOffsetUnit(tpl.offsetUnit || "hours")
    setEditingFixedTime(tpl.fixedTime || "09:00")
    setEditingButtons(tpl.buttons ? JSON.parse(JSON.stringify(tpl.buttons)) : [])
    const tplChannels = tpl.channels && Array.isArray(tpl.channels) && tpl.channels.length > 0
      ? tpl.channels
      : ["site", "whatsapp", "booking", "airbnb", "outros"]
    setEditingChannels(tplChannels)
    setEditingEnabled(tpl.enabled !== false)
    setEditingHasAttachment(Boolean(tpl.hasAttachment || tpl.documentUrl))
    setEditingDocumentUrl(tpl.documentUrl || "")
    setEditingDocumentName(tpl.documentName || "Manual_do_Hospede_CorpFlats.pdf")
    setEditingDocumentCaption(tpl.documentCaption || "")
  }

  // Toggle individual channel for the current editing template
  const handleToggleChannel = (channelId: string) => {
    setEditingChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId)
      } else {
        return [...prev, channelId]
      }
    })
  }

  // Upload de Documento / PDF do Manual do Hóspede
  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast({
        title: "Formato inválido",
        description: "Por favor, selecione um arquivo em formato PDF.",
        variant: "destructive"
      })
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo permitido para o documento é de 25 MB.",
        variant: "destructive"
      })
      return
    }

    setUploadingDoc(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const fileBase64 = reader.result as string
          const res = await fetch("/api/whatsapp/upload-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name,
              templateId: currentTemplate?.id
            })
          })
          const data = await res.json()
          if (res.ok && data.success) {
            setEditingHasAttachment(true)
            setEditingDocumentUrl(data.url)
            setEditingDocumentName(data.fileName)
            toast({
              title: "✓ Arquivo PDF anexado!",
              description: `${data.fileName} carregado e configurado para disparo automático.`
            })
          } else {
            toast({
              title: "Falha no upload",
              description: data.error || "Não foi possível carregar o arquivo.",
              variant: "destructive"
            })
          }
        } catch (err: any) {
          toast({ title: "Erro ao enviar arquivo", description: err.message, variant: "destructive" })
        } finally {
          setUploadingDoc(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (err: any) {
      toast({ title: "Erro na leitura do arquivo", description: err.message, variant: "destructive" })
      setUploadingDoc(false)
    }
  }

  // Insert tag at current cursor position in the message textarea
  const insertTagAtCursor = (tag: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setEditingMessage(prev => prev + tag)
      return
    }

    const start = textarea.selectionStart ?? editingMessage.length
    const end = textarea.selectionEnd ?? editingMessage.length
    const before = editingMessage.substring(0, start)
    const after = editingMessage.substring(end)
    const updated = before + tag + after

    setEditingMessage(updated)

    setTimeout(() => {
      textarea.focus()
      const newPos = start + tag.length
      textarea.setSelectionRange(newPos, newPos)
    }, 15)
  }

  // Add / Remove buttons in template
  const handleAddButton = () => {
    if (editingButtons.length >= 3) {
      toast({ title: "Limite atingido", description: "O WhatsApp permite no máximo 3 botões por mensagem.", variant: "destructive" })
      return
    }
    const newBtn: ButtonAction = {
      id: `btn_${Date.now()}`,
      type: "URL",
      label: "Novo Botão",
      url: "{{link_checkin_digital}}"
    }
    setEditingButtons([...editingButtons, newBtn])
  }

  const handleRemoveButton = (idx: number) => {
    setEditingButtons(editingButtons.filter((_, i) => i !== idx))
  }

  const handleUpdateButton = (idx: number, patch: Partial<ButtonAction>) => {
    const updated = [...editingButtons]
    updated[idx] = { ...updated[idx], ...patch }
    setEditingButtons(updated)
  }

  // Save Current Template
  const handleSaveTemplate = async () => {
    if (!currentTemplate) return

    const updatedTemplate: WhatsAppTemplate = {
      ...currentTemplate,
      title: editingTitle,
      message: editingMessage,
      footer: editingFooter,
      triggerTiming: editingTiming,
      offsetValue: editingOffsetValue,
      offsetUnit: editingOffsetUnit,
      fixedTime: editingFixedTime,
      buttons: editingButtons,
      channels: editingChannels,
      enabled: editingEnabled,
      hasAttachment: editingHasAttachment,
      documentUrl: editingHasAttachment ? editingDocumentUrl : "",
      documentName: editingHasAttachment ? editingDocumentName : "",
      documentCaption: editingHasAttachment ? editingDocumentCaption : ""
    }

    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTemplate)
      })

      if (res.ok) {
        toast({ 
          title: "Template salvo com sucesso!", 
          description: `Régua atualizada com ${editingChannels.length} canal(is) configurado(s).` 
        })
        setTemplates(prev => prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t))
        setCurrentTemplate(updatedTemplate)
      } else {
        toast({ title: "Erro ao salvar template", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    }
  }

  // Toggle template enabled state directly from cards
  const handleToggleTemplate = async (tpl: WhatsAppTemplate, newEnabled: boolean) => {
    const updated = { ...tpl, enabled: newEnabled }
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      })
      if (res.ok) {
        setTemplates(prev => prev.map(t => t.id === tpl.id ? updated : t))
        if (currentTemplate?.id === tpl.id) {
          setEditingEnabled(newEnabled)
        }
        toast({
          title: newEnabled ? "Gatilho ativado!" : "Gatilho pausado",
          description: `Régua '${tpl.title}' ${newEnabled ? "agora está em operação" : "foi desativada temporariamente"}.`
        })
      }
    } catch (e) {
      toast({ title: "Falha ao alternar status", variant: "destructive" })
    }
  }

  // Immediate "Send Now" (Antecipar Disparo)
  const handleSendNow = async (queueId: string, guestName: string) => {
    try {
      const res = await fetch(`/api/whatsapp/queue/${queueId}/send-now`, { method: "POST" })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "⚡ Mensagem enviada com sucesso!",
          description: `Disparo imediato concluído para ${guestName} via ${data.result?.method === "buttons" ? "Botões Interativos" : "Texto Formatado"}.`
        })
        fetchQueue()
      } else {
        toast({
          title: "Falha no envio Z-API",
          description: data.error || data.result?.error || "Verifique se a instância Z-API está conectada.",
          variant: "destructive"
        })
        fetchQueue()
      }
    } catch (err: any) {
      toast({ title: "Erro de comunicação", description: err.message, variant: "destructive" })
    }
  }

  // Cancel queue item
  const handleCancelQueue = async (queueId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/queue/${queueId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Agendamento cancelado", description: "A mensagem não será enviada." })
        fetchQueue()
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  // Quick Test Dispatch
  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: "Telefone obrigatório", description: "Digite o WhatsApp com DDD.", variant: "destructive" })
      return
    }

    setSendingTest(true)
    try {
      const payload: any = {
        phone: testPhone,
        message: testMessage || editingMessage,
        title: editingTitle,
        footer: editingFooter,
        reservationId: testReservationId || null,
        sendMode: testSendMode
      }

      if (testSendMode === "buttons") {
        if (testIncludeButtons && editingButtons.length > 0) {
          payload.buttons = editingButtons
        } else {
          payload.buttons = [
            { id: "btn_test_chk", type: "URL", label: "📝 Ficha Check-in", url: "https://corpflats.onrender.com/pre-checkin/RES-113-0034" },
            { id: "btn_test_res", type: "URL", label: "🏨 Ver Reserva", url: "https://corpflats.onrender.com/minha-reserva/RES-113-0034" },
            { id: "btn_test_call", type: "CALL", label: "📞 Falar na Administração", phone: "5522997124021" }
          ]
        }
      }

      if (testIncludeDocument) {
        payload.sendDocument = true
        payload.documentUrl = editingDocumentUrl || config.guestGuidePdfUrl || "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf"
        payload.documentName = editingDocumentName || config.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf"
        payload.documentCaption = editingDocumentCaption || ""
      }

      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok && data.success) {
        const isSelf = statusInfo?.phone && testPhone.replace(/\D/g, "").endsWith(statusInfo.phone.replace(/\D/g, ""))
        const isButtons = data.method === "buttons"
        const isFallback = data.method === "fallback_text"

        toast({
          title: isFallback 
            ? "⚠️ Entregue via Texto com Links (Fallback Z-API)" 
            : isButtons 
              ? "✓ Teste enviado com Botões Interativos!" 
              : "✓ Teste enviado com sucesso!",
          description: isFallback
            ? `Aviso Z-API: "${data.buttonError || 'Recurso de botões requer ativação prévia no painel'}". A mensagem foi entregue em texto com os links de acesso direto.${testIncludeDocument ? ' PDF anexo enviado!' : ''}`
            : isSelf
              ? `Entregue via Z-API (${isButtons ? "Com Botões Interativos" : "Texto com Links"}${testIncludeDocument ? " + PDF Guia" : ""}). Verifique sua conversa "Você" no WhatsApp!`
              : `Entregue via Z-API (${isButtons ? "Com Botões Interativos" : "Texto com Links"}${testIncludeDocument ? " + PDF Guia" : ""}). Verifique o aparelho destinatário!`
        })
        setTestModalOpen(false)
        fetchQueue()
      } else {
        toast({
          title: "Falha ao enviar teste",
          description: data.error || "Verifique as credenciais da Z-API e conexão do WhatsApp.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "Erro de disparo", description: err.message, variant: "destructive" })
    } finally {
      setSendingTest(false)
    }
  }

  // Helper to render live preview text with simulated or real reservation data
  const renderPreviewText = (text: string) => {
    if (!text) return ""

    let targetRes: any = {
      guestName: "Carlos Silva",
      guestPhone: "(22) 99887-7665",
      code: "RES-113-0034",
      flatNumber: "113",
      checkinDate: "2026-09-03",
      checkoutDate: "2026-09-05",
      totalAmount: 450,
      paymentStatus: "pago",
      guestCount: 2,
      channel: "Site Oficial CorpFlats"
    }

    if (selectedPreviewResCode !== "sample") {
      const found = reservations.find(r => r.code === selectedPreviewResCode || String(r.id) === selectedPreviewResCode)
      if (found) targetRes = found
    }

    const firstName = (targetRes.guestName || "Hóspede").split(" ")[0]
    const code = targetRes.code || `RES-${targetRes.flatNumber || "113"}-0001`
    const mapsUrl = config.googleReviewUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209"

    const totalAmount = Number(targetRes.totalAmount) || 450
    const paidAmount = Number(targetRes.paidAmount ?? (targetRes.paymentStatus === "pago" ? totalAmount : 0))
    const pendingAmount = Math.max(0, totalAmount - paidAmount)
    const fmtTotal = totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const fmtPaid = paidAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const fmtPending = pendingAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const isPreReserva = targetRes.status === "pre_reserva"

    const map: Record<string, string> = {
      "{{nome_hospede}}": targetRes.guestName || "Hóspede",
      "{{primeiro_nome}}": firstName,
      "{{telefone_hospede}}": targetRes.guestPhone || "(22) 99887-7665",
      "{{numero_reserva}}": code,
      "{{quarto}}": String(targetRes.flatNumber || "113"),
      "{{data_checkin}}": targetRes.checkinDate ? targetRes.checkinDate.split("-").reverse().join("/") : "03/09/2026",
      "{{data_checkout}}": targetRes.checkoutDate ? targetRes.checkoutDate.split("-").reverse().join("/") : "05/09/2026",
      "{{horario_checkin}}": "14:00",
      "{{horario_checkout}}": "12:00",
      "{{num_hospedes}}": String(targetRes.guestCount || 2),
      "{{num_diarias}}": "2",
      "{{valor_total}}": fmtTotal,
      "{{valor_pago}}": fmtPaid,
      "{{quanto_falta}}": fmtPending,
      "{{saldo_restante}}": fmtPending,
      "{{status_confirmacao}}": isPreReserva ? "Pré-Reserva" : "Confirmada",
      "{{status_pagamento}}": targetRes.paymentStatus === "pago" ? "Confirmado / Pago" : (paidAmount > 0 ? "Sinal Pago" : "Pendente"),
      "{{chave_pix}}": "47.964.813/0001-65",
      "{{titular_pix}}": "CorpFlats Hospedagem",
      "{{instrucao_saldo}}": pendingAmount > 0 ? `Saldo restante de ${fmtPending} a acertar no check-in.` : "Reserva 100% quitada.",
      "{{canal_reserva}}": targetRes.channel || "Site CorpFlats",
      "{{nome_hotel}}": "CorpFlats - Soho Residence",
      "{{endereco_hotel}}": "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
      "{{link_maps}}": mapsUrl,
      "{{wifi_rede}}": config.wifiNetwork || "CorpFlats-Hospedes",
      "{{wifi_senha}}": config.wifiPassword || "corpflats2026",
      "{{telefone_hotel}}": "5522997124021",
      "{{link_checkin_digital}}": `https://corpflats.onrender.com/pre-checkin/${code}`,
      "{{link_portal_hospede}}": `https://corpflats.onrender.com/portal-hospede/${code}`,
      "{{link_cafe_manha}}": `https://corpflats.onrender.com/cafe/${code}`,
      "{{link_checkout}}": `https://corpflats.onrender.com/checkout/${code}`,
      "{{link_avaliacao_google}}": config.googleReviewUrl || "https://g.page/r/corpflats/review"
    }

    let rendered = text
    for (const [tag, val] of Object.entries(map)) {
      rendered = rendered.split(tag).join(val)
    }
    return rendered
  }

  // Format WhatsApp markdown (*bold*, _italic_) into styled HTML safely
  const formatWhatsappMarkdown = (txt: string) => {
    const rendered = renderPreviewText(txt)
    return rendered
      .split("\n")
      .map((line, lineIdx) => {
        // Simple bold parser
        const parts = line.split(/(\*[^*]+\*)/g)
        return (
          <span key={lineIdx} className="block leading-relaxed min-h-[1.2em]">
            {parts.map((p, pIdx) => {
              if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
                return <strong key={pIdx} className="font-bold text-neutral-900 dark:text-neutral-50">{p.slice(1, -1)}</strong>
              }
              return <span key={pIdx}>{p}</span>
            })}
          </span>
        )
      })
  }

  if (!loadingUser && user?.role !== "admin") {
    return <AccessDenied moduleName="Automação de WhatsApp" />
  }

  const filteredQueue = queue.filter(q => 
    !queueSearch.trim() || 
    q.guestName.toLowerCase().includes(queueSearch.toLowerCase()) ||
    q.reservationCode.toLowerCase().includes(queueSearch.toLowerCase()) ||
    q.triggerEvent.toLowerCase().includes(queueSearch.toLowerCase())
  )

  return (
    <Shell>
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Header Superior */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                  Automação WhatsApp & Gatilhos
                  <Badge 
                    variant="outline" 
                    onClick={() => setLocation("/zapi-conexao")}
                    title="Clique para configurar o Modo de Entrega em Conexão Z-API"
                    className={`cursor-pointer text-xs gap-1 transition-all ${
                      (config.deliveryMode || "text_links") === "text_links"
                        ? "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100"
                        : "border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100"
                    }`}
                  >
                    {(config.deliveryMode || "text_links") === "text_links" ? "💬 Texto com Links (100% Entregue)" : "🔘 Botões Interativos (Meta)"}
                  </Badge>
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground">
                  Régua completa de mensagens automáticas com botões, links de check-in, café e disparo antecipado.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Z-API Badge */}
            <div 
              onClick={() => setLocation("/zapi-conexao")}
              title="Clique para gerenciar a Conexão Z-API em Sistema & Integrações"
              className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs hover:bg-muted/50 transition-colors"
            >
              {loadingStatus ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Checando Z-API...</span>
                </>
              ) : statusInfo?.connected ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">Z-API Conectado</span>
                  {statusInfo.phone && <span className="text-muted-foreground text-[11px]">({statusInfo.phone})</span>}
                </>
              ) : config.instanceId ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-amber-700 dark:text-amber-400">Aguardando Conexão / QR Code</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-rose-700 dark:text-rose-400">Z-API Não Configurada</span>
                </>
              )}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => setLocation("/zapi-conexao")}
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              Conexão Z-API
            </Button>

            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 text-xs rounded-xl"
              onClick={() => {
                setTestMessage(renderPreviewText(editingMessage))
                setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                setTestIncludeDocument(editingHasAttachment || Boolean(editingDocumentUrl))
                setTestModalOpen(true)
              }}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              Disparo de Teste
            </Button>
          </div>
        </div>

        {/* Tabs Principais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto rounded-xl p-1 bg-muted/60">
            <TabsTrigger value="rules" className="rounded-lg text-xs font-bold gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Régua Automática
            </TabsTrigger>
            <TabsTrigger value="quick_messages" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
              ⚡ Mensagens Rápidas
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-600 text-white font-black">
                {quickMessages.filter(m => m.enabled !== false).length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <Clock className="w-3.5 h-3.5 text-purple-500" />
              Fila de Envios
              {queue.filter(q => q.status === "scheduled").length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-purple-600 text-white font-black">
                  {queue.filter(q => q.status === "scheduled").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg text-xs font-bold gap-1.5">
              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 1: RÉGUA DE GATILHOS (AUTOMAÇÕES)
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="rules" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border shadow-xs">
              <div>
                <h2 className="text-base font-bold text-foreground">Gatilhos Automáticos do Ciclo do Hóspede</h2>
                <p className="text-xs text-muted-foreground">
                  Escolha o momento exato em que o CorpFlats deve falar com o cliente no WhatsApp.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    if (confirm("Deseja restaurar os templates padrão oficiais com botões interativos?")) {
                      await fetch("/api/whatsapp/reset-templates", { method: "POST" })
                      fetchTemplates()
                      toast({ title: "Templates restaurados com sucesso!" })
                    }
                  }}
                  className="text-xs gap-1.5"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restaurar Padrões
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(tpl => {
                const isImmediate = tpl.triggerTiming === "immediate"
                const isBefore = tpl.triggerTiming === "before_event"
                const isAfter = tpl.triggerTiming === "after_event"
                const isFixedDayOf = tpl.triggerTiming === "fixed_time_day_of"
                const isFixedBefore = tpl.triggerTiming === "fixed_time_day_before"

                let timingLabel = "⚡ Disparo Imediato"
                if (isBefore) timingLabel = `⏱️ ${tpl.offsetValue} ${tpl.offsetUnit === "days" ? "dias" : "horas"} antes`
                if (isAfter) timingLabel = `⏱️ ${tpl.offsetValue} ${tpl.offsetUnit === "days" ? "dias" : "horas"} depois`
                if (isFixedDayOf) timingLabel = `🕒 No dia às ${tpl.fixedTime || "09:00"}`
                if (isFixedBefore) timingLabel = `🥐 Véspera às ${tpl.fixedTime || "18:00"}`

                return (
                  <Card key={tpl.id} className={`rounded-2xl border transition-all hover:shadow-md ${tpl.enabled ? 'border-border' : 'opacity-60 bg-muted/30'}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge 
                            variant="secondary" 
                            className="text-[11px] font-bold py-0.5 px-2 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200"
                          >
                            {timingLabel}
                          </Badge>
                          {(tpl.hasAttachment || tpl.documentUrl) && (
                            <Badge 
                              variant="secondary" 
                              className="text-[10px] font-bold py-0.5 px-2 bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 flex items-center gap-1"
                            >
                              <FileText className="w-2.5 h-2.5" />
                              PDF Anexo
                            </Badge>
                          )}
                        </div>
                        <Switch 
                          checked={tpl.enabled}
                          onCheckedChange={(checked) => handleToggleTemplate(tpl, checked)}
                        />
                      </div>
                      <CardTitle className="text-base font-bold mt-2 text-foreground leading-snug">
                        {tpl.title}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2">
                        {tpl.description || "Gatilho de notificação automática via WhatsApp."}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="p-3 rounded-xl bg-muted/50 text-xs text-muted-foreground line-clamp-3 font-mono border">
                        {tpl.message}
                      </div>

                      {/* Botões anexados */}
                      {tpl.buttons && tpl.buttons.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Botões Interativos ({tpl.buttons.length}):</span>
                          <div className="flex flex-wrap gap-1.5">
                            {tpl.buttons.map((b, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border border-emerald-200">
                                {b.type === "URL" && <ExternalLink className="w-2.5 h-2.5" />}
                                {b.type === "CALL" && <Phone className="w-2.5 h-2.5" />}
                                {b.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Documento PDF Anexo */}
                      {(tpl.hasAttachment || tpl.documentUrl) && (
                        <div className="p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center gap-2 text-xs text-blue-900 dark:text-blue-300">
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <div className="truncate flex-1 min-w-0">
                            <span className="font-semibold truncate block">{tpl.documentName || "Manual_do_Hospede_CorpFlats.pdf"}</span>
                            {tpl.documentCaption && (
                              <p className="text-[10px] text-blue-700 dark:text-blue-400 truncate mt-0.5">{tpl.documentCaption}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Canais Destinatários Permitidos */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          Canais de Reserva Alvo:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {tpl.targetChannels && tpl.targetChannels.length > 0 ? (
                            tpl.targetChannels.map((c) => (
                              <Badge key={c} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                {c}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">Todos os canais</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t flex items-center justify-between">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            selectTemplateForEditing(tpl)
                            setActiveTab("editor")
                            editorRef.current?.scrollIntoView({ behavior: "smooth" })
                          }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Editar Mensagem & Botões
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] px-2"
                          onClick={() => {
                            selectTemplateForEditing(tpl)
                            setTestMessage(renderPreviewText(tpl.message))
                            setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                            setTestIncludeDocument(Boolean(tpl.hasAttachment || tpl.documentUrl))
                            setTestModalOpen(true)
                          }}
                        >
                          <Send className="w-3 h-3 text-emerald-600 mr-1" />
                          Testar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 2: EDITOR DE MENSAGENS COM INSERÇÃO DE TAGS NO CURSOR & PREVIEW
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="editor" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Lado Esquerdo: Formulário & Tags (Col 7) */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Seletor do Template a Editar */}
                <Card className="rounded-2xl border shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setActiveTab("rules")}
                        className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
                      >
                        ← Voltar para a Lista de Réguas
                      </Button>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold">Personalizar Mensagem & Gatilho</CardTitle>
                        <CardDescription className="text-xs">Selecione qual momento da jornada você deseja configurar e os canais autorizados.</CardDescription>
                      </div>
                      <Select 
                        value={selectedTemplateId} 
                        onValueChange={(val) => {
                          const tpl = templates.find(t => t.id === val)
                          if (tpl) selectTemplateForEditing(tpl)
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[240px] text-xs font-semibold">
                          <SelectValue placeholder="Escolha um gatilho..." />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map(t => (
                            <SelectItem key={t.id} value={t.id} className="text-xs font-medium">
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Título & Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label className="text-xs font-bold">Nome / Título da Regra</Label>
                        <Input 
                          value={editingTitle} 
                          onChange={(e) => setEditingTitle(e.target.value)}
                          placeholder="Ex: Nova Reserva • Confirmação"
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1.5 flex flex-col justify-end">
                        <Label className="text-xs font-bold">Status do Gatilho</Label>
                        <div className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-muted/30">
                          <Switch 
                            checked={editingEnabled} 
                            onCheckedChange={setEditingEnabled} 
                          />
                          <span className="text-xs font-bold">{editingEnabled ? "Ativado" : "Pausado"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Momento do Disparo (Gatilho de Tempo / Offset) */}
                    <div className="p-3.5 rounded-xl bg-muted/40 border space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                          Momento do Disparo (Quando Enviar?)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1 space-y-1">
                          <Label className="text-[11px] font-semibold">Gatilho de Tempo</Label>
                          <Select 
                            value={editingTiming} 
                            onValueChange={(val: any) => setEditingTiming(val)}
                          >
                            <SelectTrigger className="text-xs h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="immediate" className="text-xs">⚡ No momento do evento</SelectItem>
                              <SelectItem value="before_event" className="text-xs">⏱️ Antes do evento</SelectItem>
                              <SelectItem value="after_event" className="text-xs">⏱️ Após o evento</SelectItem>
                              <SelectItem value="fixed_time_day_of" className="text-xs">🕒 No dia (horário fixo)</SelectItem>
                              <SelectItem value="fixed_time_day_before" className="text-xs">🥐 Véspera (horário fixo)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {(editingTiming === "before_event" || editingTiming === "after_event") && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold">Antecedência / Atraso</Label>
                              <Input 
                                type="number" 
                                min={1}
                                value={editingOffsetValue} 
                                onChange={(e) => setEditingOffsetValue(Number(e.target.value))}
                                className="text-xs h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold">Unidade</Label>
                              <Select 
                                value={editingOffsetUnit} 
                                onValueChange={(val: any) => setEditingOffsetUnit(val)}
                              >
                                <SelectTrigger className="text-xs h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="minutes" className="text-xs">Minutos</SelectItem>
                                  <SelectItem value="hours" className="text-xs">Horas</SelectItem>
                                  <SelectItem value="days" className="text-xs">Dias</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}

                        {(editingTiming === "fixed_time_day_of" || editingTiming === "fixed_time_day_before") && (
                          <div className="sm:col-span-2 space-y-1">
                            <Label className="text-[11px] font-semibold">Horário exato do envio</Label>
                            <Input 
                              type="time" 
                              value={editingFixedTime} 
                              onChange={(e) => setEditingFixedTime(e.target.value)}
                              className="text-xs h-9"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CANAIS DE RESERVA DESTINATÁRIOS (FILTRO POR CANAL DE ORIGEM) */}
                    <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ListFilter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                              Canais de Reserva Destinatários
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                              Defina quais hóspedes receberão esta mensagem automática de acordo com o canal onde reservaram.
                            </p>
                          </div>
                        </div>

                        {/* Botões de Ação Rápida */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingChannels(["site", "whatsapp"])}
                            className={`h-7 text-[11px] px-2.5 font-bold gap-1 transition-all ${
                              editingChannels.length === 2 && editingChannels.includes("site") && editingChannels.includes("whatsapp")
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : "hover:bg-muted"
                            }`}
                            title="Ativa apenas hóspedes do Site Próprio e WhatsApp (ideal para café da manhã e ofertas exclusivas)"
                          >
                            ⚡ Apenas Diretos (Site + WhatsApp)
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingChannels(["site", "whatsapp", "booking", "airbnb", "outros"])}
                            className={`h-7 text-[11px] px-2 font-semibold ${
                              editingChannels.length === 5 ? "border-primary text-primary bg-primary/5" : ""
                            }`}
                          >
                            🌐 Todos os Canais
                          </Button>
                        </div>
                      </div>

                      {/* Grid de Canais Selecionáveis */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {CHANNEL_OPTIONS.map((ch) => {
                          const isSelected = editingChannels.includes(ch.id);
                          const isLastOdd = ch.id === "outros";
                          return (
                            <div
                              key={ch.id}
                              onClick={() => handleToggleChannel(ch.id)}
                              className={`cursor-pointer p-3.5 rounded-xl border transition-all select-none flex flex-col justify-between gap-2 ${
                                isSelected 
                                  ? "bg-white dark:bg-slate-900 border-emerald-500 shadow-2xs ring-1 ring-emerald-500/20" 
                                  : "bg-muted/20 border-border opacity-60 hover:opacity-100 hover:bg-muted/40"
                              } ${isLastOdd ? "md:col-span-2" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <span className="text-2xl shrink-0 leading-none select-none mt-0.5">{ch.icon}</span>
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-foreground whitespace-nowrap">
                                        {ch.label}
                                      </span>
                                      {isSelected ? (
                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200">
                                          Ativo
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                                          Pausado
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                      {ch.description}
                                    </p>
                                  </div>
                                </div>

                                <Switch
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleChannel(ch.id)}
                                  className="shrink-0 mt-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Resumo do Status de Envio */}
                      <div className="p-2 rounded-lg bg-muted/40 border text-[11px] flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
                          <span>Destinatários selecionados:</span>
                          <strong className="text-foreground">
                            {editingChannels.length === 5 
                              ? "Todos os Canais (Sem restrição)" 
                              : editingChannels.length === 0 
                                ? "Nenhum canal (Mensagem pausada para todos)" 
                                : `${editingChannels.length} canal(is) ativo(s): ${editingChannels.map(id => CHANNEL_OPTIONS.find(o => o.id === id)?.label).join(", ")}`}
                          </strong>
                        </div>

                        {editingChannels.length === 0 && (
                          <Badge variant="destructive" className="text-[10px]">
                            ⚠️ Nenhum hóspede receberá
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* PALETA DE TAGS CLICÁVEIS (INSERÇÃO NO CURSOR) */}
                    <div className="space-y-2 p-3.5 rounded-xl border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          Tags Dinâmicas (Clique para inserir onde está o cursor de texto):
                        </span>
                      </div>

                      <div className="space-y-2.5 pt-1">
                        {TAG_GROUPS.map((grp, gIdx) => (
                          <div key={gIdx} className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                              {grp.category}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {grp.tags.map((t, tIdx) => (
                                <button
                                  key={tIdx}
                                  type="button"
                                  onClick={() => insertTagAtCursor(t.tag)}
                                  title={`Exemplo real: ${t.example}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 shadow-2xs hover:bg-emerald-100 dark:hover:bg-emerald-900/60 hover:border-emerald-400 transition-colors"
                                >
                                  <span>{t.label}</span>
                                  <code className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1 rounded">
                                    {t.tag}
                                  </code>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Campo da Mensagem */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold">Texto da Mensagem (com formatação WhatsApp)</Label>
                        <span className="text-[11px] text-muted-foreground">
                          Dica: Use <strong>*negrito*</strong> para destacar.
                        </span>
                      </div>
                      <Textarea 
                        ref={textareaRef}
                        rows={10}
                        value={editingMessage}
                        onChange={(e) => setEditingMessage(e.target.value)}
                        placeholder="Digite sua mensagem aqui e clique nas tags acima..."
                        className="text-xs leading-relaxed font-sans font-medium"
                      />
                    </div>

                    {/* Rodapé da Mensagem */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Texto do Rodapé (Opcional - Z-API Footer)</Label>
                      <Input 
                        value={editingFooter}
                        onChange={(e) => setEditingFooter(e.target.value)}
                        placeholder="Ex: CorpFlats • Edifício Soho Residence"
                        className="text-xs"
                      />
                    </div>

                    {/* CONSTRUTOR DE BOTÕES INTERATIVOS (Z-API) */}
                    <div className="p-3.5 rounded-xl border bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-emerald-600" />
                          <div>
                            <span className="text-xs font-bold text-foreground">Botões Interativos (Z-API Button Actions)</span>
                            <p className="text-[10px] text-muted-foreground">Até 3 botões com links rápidos para o cliente clicar com 1 toque.</p>
                          </div>
                        </div>

                        {editingButtons.length < 3 && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={handleAddButton}
                            className="text-xs h-7 gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar Botão
                          </Button>
                        )}
                      </div>

                      {editingButtons.length === 0 ? (
                        <div className="text-center p-3 rounded-lg border border-dashed text-xs text-muted-foreground">
                          Nenhum botão adicionado. A mensagem será enviada apenas com o texto formatado.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {editingButtons.map((btn, bIdx) => (
                            <div key={bIdx} className="p-2.5 rounded-xl bg-card border flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                              <div className="w-full sm:w-[130px]">
                                <Select 
                                  value={btn.type} 
                                  onValueChange={(val: any) => handleUpdateButton(bIdx, { type: val })}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="URL" className="text-xs">🔗 Abrir Link</SelectItem>
                                    <SelectItem value="CALL" className="text-xs">📞 Ligar Telefone</SelectItem>
                                    <SelectItem value="REPLY" className="text-xs">💬 Resposta Rápida</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="w-full sm:w-[180px]">
                                <Input 
                                  placeholder="Texto do Botão" 
                                  value={btn.label}
                                  onChange={(e) => handleUpdateButton(bIdx, { label: e.target.value })}
                                  className="text-xs h-8"
                                />
                              </div>

                              <div className="flex-1 w-full">
                                {btn.type === "URL" && (
                                  <Input 
                                    placeholder="URL (aceita tags ex: {{link_checkin_digital}})" 
                                    value={btn.url || ""}
                                    onChange={(e) => handleUpdateButton(bIdx, { url: e.target.value })}
                                    className="text-xs h-8 font-mono"
                                  />
                                )}
                                {btn.type === "CALL" && (
                                  <Input 
                                    placeholder="Telefone (ex: {{telefone_hotel}} ou 5522997124021)" 
                                    value={btn.phone || ""}
                                    onChange={(e) => handleUpdateButton(bIdx, { phone: e.target.value })}
                                    className="text-xs h-8 font-mono"
                                  />
                                )}
                                {btn.type === "REPLY" && (
                                  <span className="text-[11px] text-muted-foreground italic px-2">
                                    Envia o texto do botão como resposta do cliente no WhatsApp.
                                  </span>
                                )}
                              </div>

                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleRemoveButton(bIdx)}
                                className="text-rose-500 hover:text-rose-700 h-8 w-8 p-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ANEXO DE DOCUMENTO / GUIA DO HÓSPEDE EM PDF (Z-API) */}
                    <div className="p-3.5 rounded-xl border bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-base shrink-0">
                            📄
                          </div>
                          <div>
                            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              Anexo de Documento / Guia em PDF (Z-API)
                              {editingHasAttachment && (
                                <Badge className="text-[10px] bg-blue-600 text-white font-semibold">Ativo</Badge>
                              )}
                            </span>
                            <p className="text-[10px] text-muted-foreground">
                              Envia o arquivo PDF (Manual do Hóspede / Regras) automaticamente anexado no WhatsApp.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Label htmlFor="attach-switch" className="text-xs font-semibold cursor-pointer">
                            {editingHasAttachment ? "Anexo Ativado" : "Sem Anexo"}
                          </Label>
                          <Switch 
                            id="attach-switch"
                            checked={editingHasAttachment}
                            onCheckedChange={setEditingHasAttachment}
                          />
                        </div>
                      </div>

                      {editingHasAttachment && (
                        <div className="space-y-3 pt-2 border-t border-blue-200/60 dark:border-blue-800/40">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-foreground">
                                Nome do Arquivo no WhatsApp:
                              </Label>
                              <Input 
                                value={editingDocumentName}
                                onChange={(e) => setEditingDocumentName(e.target.value)}
                                placeholder="Manual_do_Hospede_CorpFlats.pdf"
                                className="text-xs h-8 bg-white dark:bg-neutral-900"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] font-bold text-foreground">
                                Carregar Novo Arquivo do Computador:
                              </Label>
                              <div className="flex items-center gap-2">
                                <label className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-blue-700 dark:text-blue-300 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors shadow-2xs">
                                  {uploadingDoc ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      Carregando...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-3.5 h-3.5" />
                                      {editingDocumentUrl ? "Trocar Arquivo PDF" : "Selecionar Arquivo PDF"}
                                    </>
                                  )}
                                  <input 
                                    type="file" 
                                    accept=".pdf,application/pdf" 
                                    className="hidden" 
                                    onChange={handleUploadDocument}
                                    disabled={uploadingDoc}
                                  />
                                </label>

                                {editingDocumentUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => window.open(editingDocumentUrl, "_blank")}
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    Visualizar PDF
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] font-bold text-foreground">
                              Legenda Opcional do Arquivo (WhatsApp Caption):
                            </Label>
                            <Input 
                              value={editingDocumentCaption}
                              onChange={(e) => setEditingDocumentCaption(e.target.value)}
                              placeholder="Ex: Segue o Manual do Hóspede em PDF para sua comodidade! 📖"
                              className="text-xs h-8 bg-white dark:bg-neutral-900"
                            />
                          </div>

                          {editingDocumentUrl ? (
                            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="font-medium truncate max-w-[280px] sm:max-w-[400px]">
                                  Arquivo pronto para envio: <strong>{editingDocumentName || 'manual.pdf'}</strong>
                                </span>
                              </div>
                              <Badge variant="outline" className="text-[10px] bg-white dark:bg-neutral-800 text-emerald-700 dark:text-emerald-300 border-emerald-300">
                                PDF Configurado
                              </Badge>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-300">
                              ℹ️ Selecione o arquivo PDF do manual no seu computador acima para ativar o envio automático.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          if (currentTemplate) selectTemplateForEditing(currentTemplate)
                        }}
                        className="text-xs"
                      >
                        Descartar Alterações
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            setTestMessage(renderPreviewText(editingMessage))
                            setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                            setTestModalOpen(true)
                          }}
                          className="text-xs gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5 text-emerald-600" />
                          Testar Este Template
                        </Button>

                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={handleSaveTemplate}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-xs font-bold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Salvar Template
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Lado Direito: Preview WhatsApp ao Vivo (Col 5) */}
              <div className="lg:col-span-5 space-y-4">
                <Card className="rounded-2xl border shadow-xs sticky top-20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        Pré-Visualização do Celular (WhatsApp Real)
                      </CardTitle>
                      
                      {/* Seletor de reserva para preview */}
                      <Select value={selectedPreviewResCode} onValueChange={setSelectedPreviewResCode}>
                        <SelectTrigger className="h-7 text-[11px] w-[140px]">
                          <SelectValue placeholder="Dados de Exemplo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sample" className="text-xs">Exemplo Padrão</SelectItem>
                          {reservations.slice(0, 8).map(r => (
                            <SelectItem key={r.id || r.code} value={r.code || String(r.id)} className="text-xs">
                              {r.guestName} (Flat {r.flatNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <CardDescription className="text-[11px]">
                      Veja como o texto e os botões serão renderizados no smartphone do hóspede.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {/* Mockup do Celular WhatsApp */}
                    <div className="w-full max-w-[340px] mx-auto rounded-[32px] p-3 bg-neutral-900 shadow-2xl border-4 border-neutral-800">
                      
                      {/* Notch e Câmera */}
                      <div className="w-24 h-4 bg-neutral-800 rounded-full mx-auto mb-2" />

                      {/* Top Bar WhatsApp */}
                      <div className="bg-[#075E54] text-white p-2.5 rounded-t-2xl flex items-center gap-2 shadow-xs">
                        <div className="w-7 h-7 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-xs border border-white/20">
                          CF
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-xs block leading-tight truncate">CorpFlats Soho</span>
                          <span className="text-[9px] text-emerald-200 block">online</span>
                        </div>
                        <Phone className="w-3.5 h-3.5 opacity-80" />
                      </div>

                      {/* Chat Wallpaper Container */}
                      <div className="bg-[#EFEAE2] dark:bg-[#0B141A] min-h-[380px] max-h-[480px] overflow-y-auto p-3 rounded-b-2xl flex flex-col justify-end space-y-2 text-neutral-800 dark:text-neutral-200 font-sans">
                        
                        {/* Data Pill */}
                        <div className="text-center my-1">
                          <span className="bg-white/80 dark:bg-neutral-800/80 text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 px-2 py-0.5 rounded-md shadow-2xs">
                            HOJE
                          </span>
                        </div>

                        {/* Balão de Mensagem Estilo WhatsApp */}
                        <div className="relative self-end max-w-[92%] bg-[#D9FDD3] dark:bg-[#005C4B] rounded-2xl rounded-tr-xs shadow-xs p-2.5 pb-1 text-xs border border-emerald-300/30">
                          
                          {/* Conteúdo formatado */}
                          <div className="text-[12px] whitespace-pre-wrap break-words text-neutral-900 dark:text-neutral-100">
                            {formatWhatsappMarkdown(editingMessage)}
                          </div>

                          {/* Footer da mensagem */}
                          {editingFooter && (
                            <div className="mt-2 text-[10px] text-neutral-500 dark:text-neutral-400 italic border-t border-neutral-300/40 dark:border-neutral-700/40 pt-1">
                              {editingFooter}
                            </div>
                          )}

                          {/* Timestamp + Checks Azuis */}
                          <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                            <span>14:32</span>
                            <CheckCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 inline" />
                          </div>
                        </div>

                        {/* Botões Interativos (Renderizados logo abaixo do balão) */}
                        {editingButtons && editingButtons.length > 0 && (
                          <div className="self-end w-[92%] space-y-1.5 pt-0.5">
                            {editingButtons.map((btn, idx) => (
                              <button
                                key={idx}
                                type="button"
                                className="w-full bg-white dark:bg-[#1F2C34] hover:bg-neutral-50 dark:hover:bg-[#2A3942] text-sky-600 dark:text-sky-400 font-bold text-xs py-2 px-3 rounded-xl shadow-xs border border-neutral-200 dark:border-neutral-700 flex items-center justify-center gap-1.5 transition-colors"
                              >
                                {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                                {btn.type === "CALL" && <Phone className="w-3.5 h-3.5" />}
                                {btn.type === "REPLY" && <MessageSquare className="w-3.5 h-3.5" />}
                                <span className="truncate">{btn.label || "Ação Rápida"}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Balão do Documento PDF Anexo (se ativo) */}
                        {editingHasAttachment && (
                          <div className="relative self-end max-w-[92%] bg-[#D9FDD3] dark:bg-[#005C4B] rounded-2xl rounded-tr-xs shadow-xs p-2 text-xs border border-emerald-300/30 space-y-1.5 animate-in fade-in-50">
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/80 dark:bg-black/25 border border-emerald-200/50 dark:border-emerald-700/50">
                              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 font-bold text-[10px] shrink-0 border border-red-200">
                                PDF
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-[11px] block truncate text-neutral-900 dark:text-neutral-100">
                                  {editingDocumentName || "Manual_do_Hospede_CorpFlats.pdf"}
                                </span>
                                <span className="text-[9px] text-muted-foreground block">
                                  Documento PDF • Guia do Hóspede
                                </span>
                              </div>
                            </div>
                            {editingDocumentCaption && (
                              <p className="text-[11px] text-neutral-800 dark:text-neutral-200 px-0.5 whitespace-pre-wrap">
                                {editingDocumentCaption}
                              </p>
                            )}
                            <div className="flex justify-end items-center gap-1 text-[9px] text-neutral-500 dark:text-neutral-400">
                              <span>14:32</span>
                              <CheckCheck className="w-3 h-3 text-sky-500" />
                            </div>
                          </div>
                        )}

                      </div>

                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 2: MENSAGENS RÁPIDAS (MANUAIS - ATALHOS NO CARD DO PMS)
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="quick_messages" className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border shadow-xs">
              <div>
                <h2 className="text-base font-black text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                  Mensagens Rápidas para Envio Manual
                </h2>
                <p className="text-xs text-muted-foreground">
                  Estas mensagens aparecem como botões na <strong>janelinha flutuante da reserva</strong> (no calendário) e no modal de detalhes. Use o botão liga/desliga para escolher exatamente quais atalhos exibir no card.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    if (confirm("Deseja restaurar as mensagens rápidas de fábrica (Cobrança, Check-in, Café, Wi-Fi, Saída e Avaliação)?")) {
                      await resetQuickMessages()
                    }
                  }}
                  className="text-xs gap-1.5 rounded-xl border-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                  Restaurar Padrões
                </Button>

                <Button 
                  size="sm" 
                  onClick={handleOpenCreateQm}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 rounded-xl shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova Mensagem Rápida
                </Button>
              </div>
            </div>

            {/* Grid de Mensagens Rápidas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {quickMessages.map((qm) => {
                const isHovered = hoveredPreviewQm?.id === qm.id;
                return (
                  <Card 
                    key={qm.id} 
                    className={`rounded-3xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                      qm.enabled !== false 
                        ? 'border-emerald-200 dark:border-emerald-800/80 shadow-xs bg-card' 
                        : 'border-slate-200 dark:border-slate-800 opacity-80 bg-slate-50/50 dark:bg-slate-900/40'
                    }`}
                  >
                    <CardHeader className="p-4 pb-3 border-b border-border/60 bg-muted/20">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 border shadow-2xs flex items-center justify-center text-xl shrink-0">
                            {qm.icon || "💬"}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <CardTitle className="text-sm font-black text-foreground">
                                {qm.title}
                              </CardTitle>
                              {qm.category && (
                                <Badge variant="outline" className="text-[10px] font-semibold py-0 px-1.5">
                                  {qm.category}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                              <span>Botão no card:</span>
                              <span className="font-mono font-bold text-foreground px-1.5 py-0.2 rounded bg-muted text-[10px] border">
                                [{qm.icon} {qm.shortLabel || qm.title}]
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botão Switch Liga / Desliga (Ativar ou Desativar no Card) */}
                        <div className="flex items-center gap-2 shrink-0 bg-white dark:bg-slate-900 py-1 px-2.5 rounded-xl border shadow-2xs">
                          <Label htmlFor={`sw-${qm.id}`} className="text-[11px] font-bold cursor-pointer">
                            {qm.enabled !== false ? (
                              <span className="text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Ativo no Card
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-medium flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                                Oculto
                              </span>
                            )}
                          </Label>
                          <Switch
                            id={`sw-${qm.id}`}
                            checked={qm.enabled !== false}
                            onCheckedChange={(checked) => toggleQuickMessage(qm.id, checked)}
                          />
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-2">
                        {qm.description && (
                          <p className="text-xs text-muted-foreground font-medium">
                            {qm.description}
                          </p>
                        )}

                        {/* Visualizador de mensagem WhatsApp */}
                        <div className="p-3 rounded-2xl bg-[#E7FFDB] dark:bg-[#005C4B]/35 border border-emerald-200 dark:border-emerald-800/80 space-y-2 text-xs text-neutral-900 dark:text-neutral-100">
                          <div className="whitespace-pre-wrap font-sans leading-relaxed text-[11.5px]">
                            {renderPreviewText(qm.message)}
                          </div>

                          {qm.buttons && qm.buttons.length > 0 && (
                            <div className="pt-1.5 border-t border-emerald-300/40 dark:border-emerald-700/50 space-y-1">
                              <span className="text-[9.5px] uppercase font-bold text-emerald-900/70 dark:text-emerald-300/70">
                                Botões Integrados (Z-API):
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {qm.buttons.map(b => (
                                  <span key={b.id} className="text-[10px] px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border font-bold text-emerald-800 dark:text-emerald-300 shadow-2xs">
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {qm.footer && (
                            <div className="text-[10px] text-muted-foreground italic pt-0.5">
                              {qm.footer}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Barra Inferior com Prévia ao Passar Mouse e Ações */}
                      <div className="pt-3 border-t flex items-center justify-between gap-2 flex-wrap">
                        {/* Simulação da Janelinha Flutuante ao parar o mouse */}
                        <div className="relative">
                          <button
                            type="button"
                            onMouseEnter={() => setHoveredPreviewQm(qm)}
                            onMouseLeave={() => setHoveredPreviewQm(null)}
                            className="h-7 px-2.5 text-[11px] font-bold rounded-xl border bg-white dark:bg-slate-900 border-emerald-300 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 flex items-center gap-1.5 shadow-2xs transition-colors"
                          >
                            <span>{qm.icon || "💬"}</span>
                            <span>{qm.shortLabel || qm.title}</span>
                            <span className="text-[10px] font-normal text-muted-foreground ml-1">
                              (Passe o mouse p/ ver prévia)
                            </span>
                          </button>

                          {isHovered && (
                            <div className="absolute left-0 bottom-[calc(100%+8px)] z-50 p-3 rounded-2xl bg-slate-950/98 text-white border border-slate-700 shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 pointer-events-none w-[290px] text-left">
                              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 mb-1.5">
                                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                                  <span>{qm.icon}</span> {qm.title}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                  Janelinha Flutuante
                                </span>
                              </div>
                              <div className="text-[11px] leading-relaxed text-slate-200 font-normal whitespace-pre-wrap max-h-36 overflow-y-auto pr-1">
                                {renderPreviewText(qm.message)}
                              </div>
                              <div className="mt-2 pt-1 border-t border-slate-800/80 text-[9.5px] text-emerald-400 font-bold">
                                ⚡ Disparo instantâneo com 1 clique
                              </div>
                              <div className="absolute top-full left-6 w-2.5 h-2.5 -mt-1 bg-slate-950 border-r border-b border-slate-700 rotate-45" />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[11px] gap-1 rounded-xl"
                            onClick={() => {
                              setTestMessage(renderPreviewText(qm.message))
                              setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                              setTestModalOpen(true)
                            }}
                          >
                            <Send className="w-3 h-3 text-emerald-600" />
                            Testar Disparo
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[11px] gap-1 rounded-xl"
                            onClick={() => handleOpenEditQm(qm)}
                          >
                            <Edit3 className="w-3 h-3 text-sky-600" />
                            Editar
                          </Button>

                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            onClick={() => {
                              if (confirm(`Deseja excluir a mensagem rápida "${qm.title}"?`)) {
                                deleteQuickMessage(qm.id)
                              }
                            }}
                            title="Excluir mensagem rápida"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 3: FILA DE ENVIOS AGENDADOS COM AÇÃO "ENVIAR AGORA"
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="queue" className="space-y-4">
            <Card className="rounded-2xl border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      Fila de Mensagens Programadas
                      <Badge variant="outline" className="text-xs font-semibold">
                        {filteredQueue.length} {filteredQueue.length === 1 ? "item" : "itens"}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Mensagens calculadas para as próximas reservas. Você pode antecipar qualquer disparo clicando em <strong>"Enviar Agora"</strong>.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input 
                      placeholder="Buscar por hóspede, quarto ou código..."
                      value={queueSearch}
                      onChange={(e) => setQueueSearch(e.target.value)}
                      className="w-full sm:w-[260px] text-xs h-8"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchQueue}
                      disabled={loadingQueue}
                      className="text-xs h-8 gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingQueue ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {filteredQueue.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground space-y-2 border rounded-xl border-dashed">
                    <Clock className="w-8 h-8 mx-auto opacity-40 text-purple-500" />
                    <p className="text-sm font-semibold">Nenhuma mensagem pendente na fila no momento.</p>
                    <p className="text-xs text-muted-foreground">
                      Assim que houverem novas reservas confirmadas, a régua agendará as mensagens aqui automaticamente.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {filteredQueue.map((item) => {
                      const isScheduled = item.status === "scheduled"
                      const isSent = item.status === "sent"
                      const isFailed = item.status === "failed"
                      const isCancelled = item.status === "cancelled"

                      return (
                        <div key={item.id} className="p-4 bg-card flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground">{item.guestName}</span>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {item.reservationCode}
                              </Badge>

                              {/* Canal de Origem da Reserva */}
                              {item.channel && (
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                                  CHANNEL_OPTIONS.find(o => o.id === item.channel)?.badgeClass || "bg-muted text-foreground"
                                }`}>
                                  <span>{CHANNEL_OPTIONS.find(o => o.id === item.channel)?.icon || "🏷️"}</span>
                                  <span>{CHANNEL_OPTIONS.find(o => o.id === item.channel)?.label || item.channel}</span>
                                </span>
                              )}

                              <span className="text-xs text-muted-foreground font-mono">
                                📞 {item.guestPhone}
                              </span>

                              {/* Status Badge */}
                              {isScheduled && (
                                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold">
                                  ⏱️ Agendado
                                </Badge>
                              )}
                              {isSent && (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                                  ✓ Enviado
                                </Badge>
                              )}
                              {isFailed && (
                                <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-bold">
                                  ✕ Falha
                                </Badge>
                              )}
                              {isCancelled && (
                                <div className="flex items-center gap-1.5">
                                  <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 text-[10px]">
                                    Cancelado
                                  </Badge>
                                  {item.error && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                      ({item.error})
                                    </span>
                                  )}
                                </div>
                              )}

                              {(item.hasAttachment || item.documentUrl) && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] font-bold border-blue-200 flex items-center gap-1">
                                  <FileText className="w-2.5 h-2.5" />
                                  PDF
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              <span className="font-semibold text-primary">{item.title}</span>
                              <span>•</span>
                              <span>
                                Horário Previsto: <strong>{new Date(item.scheduledFor).toLocaleString("pt-BR")}</strong>
                              </span>
                              {item.sentAt && (
                                <>
                                  <span>•</span>
                                  <span>Enviado às: {new Date(item.sentAt).toLocaleTimeString("pt-BR")}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Ver Prévia */}
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-xs h-8 gap-1"
                              onClick={() => {
                                setPreviewModalItem(item)
                                setPreviewModalOpen(true)
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver Mensagem
                            </Button>

                            {/* Botão Enviar Agora (Antecipar) */}
                            {isScheduled && (
                              <Button 
                                variant="default" 
                                size="sm" 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5 shadow-xs font-bold"
                                onClick={() => handleSendNow(item.id, item.guestName)}
                              >
                                <Zap className="w-3.5 h-3.5 fill-white" />
                                Enviar Agora
                              </Button>
                            )}

                            {/* Cancelar Agendamento */}
                            {isScheduled && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-muted-foreground hover:text-rose-600 h-8 w-8 p-0"
                                onClick={() => handleCancelQueue(item.id)}
                                title="Cancelar agendamento"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 4: HISTÓRICO DE ENVIOS
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="history" className="space-y-4">
            <Card className="rounded-2xl border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Histórico de Disparos Concluídos</CardTitle>
                    <CardDescription className="text-xs">Registro de mensagens enviadas aos hóspedes.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchQueue} className="text-xs h-8 gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {history.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground border rounded-xl border-dashed">
                    Nenhum envio registrado ainda.
                  </div>
                ) : (
                  <div className="divide-y border rounded-xl overflow-hidden">
                    {history.map((hist) => (
                      <div key={hist.id} className="p-3.5 bg-card flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{hist.guestName}</span>
                            <span className="font-mono text-muted-foreground">({hist.guestPhone})</span>
                            {hist.reservationCode && (
                              <Badge variant="outline" className="text-[10px] font-mono">{hist.reservationCode}</Badge>
                            )}
                            {(hist.hasAttachment || hist.documentUrl) && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 text-[10px] font-bold border-blue-200 flex items-center gap-1">
                                <FileText className="w-2.5 h-2.5" />
                                PDF
                              </Badge>
                            )}
                            <Badge className={hist.status === "sent" ? "bg-emerald-100 text-emerald-800 text-[10px]" : "bg-rose-100 text-rose-800 text-[10px]"}>
                              {hist.status === "sent" ? "✓ Entregue" : "✕ Erro"}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground line-clamp-1">{hist.message}</p>
                        </div>
                        <div className="text-right shrink-0 text-muted-foreground">
                          <div>{new Date(hist.sentAt).toLocaleString("pt-BR")}</div>
                          <span className="text-[10px] font-semibold text-primary uppercase">Método: {hist.method}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL DE DISPARO DE TESTE RÁPIDO
        ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                Disparo de Teste no WhatsApp
              </DialogTitle>
              <DialogDescription className="text-xs">
                Receba e valide a mensagem diretamente no seu smartphone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {/* Informações do Remetente Conectado */}
              <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Aparelho Remetente:
                  </span>
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">
                    {statusInfo?.name ? `${statusInfo.name} ` : ""}({statusInfo?.phone ? `+${statusInfo.phone}` : "Conectado"})
                  </span>
                </div>
                <div className="text-[11px] leading-tight space-y-1">
                  <span className="text-emerald-800 dark:text-emerald-300 font-medium block">
                    💡 <strong>Dica de Entrega Garantida:</strong> Se você trocou de conta de WhatsApp recentemente na Z-API, a Meta frequentemente descarta botões interativos.
                  </span>
                  <span className="text-muted-foreground block text-[10px]">
                    Utilize <strong>Texto com Links</strong> para garantir entrega direta de 100% das mensagens no celular destinatário.
                  </span>
                </div>
              </div>

              {/* Seletor de Formato do Envio */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Formato do Envio</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTestSendMode("text")}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      testSendMode === "text"
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-600"
                        : "bg-muted/30 hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      📝 Texto com Links
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      Recomendado • 100% garantido para contas pessoais e qualquer celular.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTestSendMode("buttons")
                      setTestIncludeButtons(true)
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      testSendMode === "buttons"
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-600"
                        : "bg-muted/30 hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                      🔘 Botões Interativos
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      Requer WhatsApp Business ativo e aprovado na Z-API.
                    </p>
                  </button>
                </div>
              </div>

              {/* Telefone de Destino */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Número de Destino (Quem vai RECEBER)</Label>
                  <span className="text-[10px] text-muted-foreground">Com DDD</span>
                </div>
                <Input 
                  placeholder="Ex: 22998505276 ou 22997124021"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="text-xs font-mono"
                />

                {/* Atalhos para preenchimento rápido */}
                <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Preencher rápido:</span>
                  {statusInfo?.phone && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      className="text-[10px] h-6 px-2 py-0"
                      onClick={() => setTestPhone(statusInfo.phone)}
                    >
                      Meu Celular ({statusInfo.phone.slice(-4)})
                    </Button>
                  )}
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="text-[10px] h-6 px-2 py-0"
                    onClick={() => setTestPhone("22997124021")}
                  >
                    Hotel CorpFlats (22 99712-4021)
                  </Button>
                </div>

                {/* Alerta se estiver enviando para o próprio número */}
                {testPhone && statusInfo?.phone && testPhone.replace(/\D/g, "").endsWith(statusInfo.phone.replace(/\D/g, "")) && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                    💡 <strong>Atenção:</strong> Você está enviando para o próprio número conectado. A mensagem aparecerá na sua conversa <strong>"Você / Mensagens Salvas"</strong> no WhatsApp (sem toque de mensagem recebida).
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Simular Dados de uma Reserva Real</Label>
                <Select value={testReservationId} onValueChange={setTestReservationId}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Escolha uma reserva para preencher tags..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Sem dados reais (Manter texto atual)</SelectItem>
                    {reservations.slice(0, 10).map(r => (
                      <SelectItem key={r.id || r.code} value={String(r.id || r.code)} className="text-xs">
                        {r.guestName} (Flat {r.flatNumber} - {r.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold">Mensagem que será enviada</Label>
                <Textarea 
                  rows={5}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="text-xs leading-relaxed font-mono text-[11px]"
                />
              </div>

              {testSendMode === "buttons" && (
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      🔘 Botões Interativos Anexados {editingButtons.length > 0 ? `(${editingButtons.length})` : "(Padrão de Demonstração)"}
                    </span>
                    {editingButtons.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Incluir</span>
                        <Switch 
                          checked={testIncludeButtons}
                          onCheckedChange={setTestIncludeButtons}
                        />
                      </div>
                    )}
                  </div>

                  {editingButtons.length > 0 ? (
                    testIncludeButtons && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {editingButtons.map((btn: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-background rounded-lg border text-xs shadow-xs font-medium">
                            <span>{btn.label}</span>
                            <span className="text-[9px] px-1 py-0.2 bg-muted text-muted-foreground rounded font-mono">
                              {btn.type === "CALL" ? "Ligação" : "Link"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        Como este modelo específico não possui botões configurados no template, anexaremos botões interativos de teste para demonstrar a funcionalidade:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2.5 py-1 bg-white dark:bg-background rounded-lg border text-xs font-medium text-emerald-900 dark:text-emerald-200 shadow-2xs">
                          📝 Ficha Check-in
                        </span>
                        <span className="px-2.5 py-1 bg-white dark:bg-background rounded-lg border text-xs font-medium text-emerald-900 dark:text-emerald-200 shadow-2xs">
                          🏨 Ver Reserva
                        </span>
                        <span className="px-2.5 py-1 bg-white dark:bg-background rounded-lg border text-xs font-medium text-emerald-900 dark:text-emerald-200 shadow-2xs">
                          📞 Falar na Administração
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Opção de Anexar Documento PDF no Teste */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Anexar Guia / Manual em PDF
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{testIncludeDocument ? "Sim" : "Não"}</span>
                    <Switch 
                      checked={testIncludeDocument}
                      onCheckedChange={setTestIncludeDocument}
                    />
                  </div>
                </div>

                {testIncludeDocument && (
                  <div className="pt-1">
                    <div className="flex items-center gap-2 p-2 bg-white dark:bg-background rounded-lg border border-blue-200 dark:border-blue-800 text-[11px]">
                      <div className="w-6 h-6 rounded bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600 font-bold text-[9px] shrink-0 border border-red-200">
                        PDF
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-foreground block truncate">
                          {editingDocumentName || config.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf"}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">
                          Será enviado via Z-API como anexo oficial logo após a mensagem de texto.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setTestModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSendTest} 
                disabled={sendingTest}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingTest ? "Enviando..." : "Disparar Agora"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL DE VER PRÉVIA DA FILA
        ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Mensagem Renderizada para {previewModalItem?.guestName}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {previewModalItem?.reservationCode} • WhatsApp: {previewModalItem?.guestPhone}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-[#D9FDD3] dark:bg-[#005C4B] text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed shadow-2xs border">
                {previewModalItem?.renderedMessage}
              </div>

              {previewModalItem?.renderedButtons && previewModalItem.renderedButtons.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Botões que acompanharão:</span>
                  <div className="space-y-1">
                    {previewModalItem.renderedButtons.map((b, idx) => (
                      <div key={idx} className="p-2 rounded-lg border bg-card text-xs flex items-center justify-between">
                        <span className="font-bold text-sky-600">{b.label}</span>
                        <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[180px]">{b.url || b.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(previewModalItem?.hasAttachment || previewModalItem?.documentUrl) && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Documento anexo:</span>
                  <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-red-100 dark:bg-red-950 flex items-center justify-center text-red-600 font-bold text-[9px] shrink-0 border border-red-200">
                      PDF
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-foreground text-xs block truncate">
                        {previewModalItem.documentName || "Manual_do_Hospede_CorpFlats.pdf"}
                      </span>
                      {previewModalItem.documentCaption && (
                        <p className="text-[10px] text-muted-foreground truncate">{previewModalItem.documentCaption}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setPreviewModalOpen(false)}>
                Fechar
              </Button>
              {previewModalItem?.status === "scheduled" && (
                <Button 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs"
                  onClick={() => {
                    if (previewModalItem) handleSendNow(previewModalItem.id, previewModalItem.guestName)
                    setPreviewModalOpen(false)
                  }}
                >
                  <Zap className="w-3.5 h-3.5 fill-white" />
                  Enviar Agora
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ════════════════════════════════════════════════════════════════════
            MODAL DE CRIAÇÃO / EDIÇÃO DE MENSAGEM RÁPIDA (MANUAL)
        ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={qmModalOpen} onOpenChange={setQmModalOpen}>
          <DialogContent className="max-w-xl rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600 fill-emerald-600" />
                {editingQm ? "Editar Mensagem Rápida" : "Nova Mensagem Rápida (Manual)"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configure os textos e atalhos que ficarão disponíveis para envio manual na janelinha flutuante da reserva e no modal de detalhes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8 space-y-1">
                  <Label className="text-[11px] font-bold">Título da Mensagem</Label>
                  <Input 
                    placeholder="Ex: Cobrança / Link Pagamento" 
                    value={qmTitle} 
                    onChange={(e) => setQmTitle(e.target.value)}
                    className="text-xs h-9 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-[11px] font-bold">Rótulo Curto no Botão</Label>
                  <Input 
                    placeholder="Ex: Cobrança" 
                    maxLength={14}
                    value={qmShortLabel} 
                    onChange={(e) => setQmShortLabel(e.target.value)}
                    className="text-xs h-9 rounded-xl font-bold"
                  />
                  <span className="text-[9.5px] text-muted-foreground block">Aparece no card compacto</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5 space-y-1">
                  <Label className="text-[11px] font-bold">Ícone / Emoji</Label>
                  <div className="flex items-center gap-1.5">
                    <Input 
                      placeholder="💳" 
                      value={qmIcon} 
                      onChange={(e) => setQmIcon(e.target.value)}
                      className="text-base h-9 w-12 text-center rounded-xl font-bold shrink-0"
                    />
                    <div className="flex items-center gap-1 overflow-x-auto py-1">
                      {["💳", "📝", "🥐", "📍", "🚪", "⭐", "🔑", "☕", "💰", "📱"].map(em => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setQmIcon(em)}
                          className="h-7 w-7 rounded-lg border bg-muted/40 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-sm flex items-center justify-center transition-all shrink-0"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <Label className="text-[11px] font-bold">Categoria</Label>
                  <Input 
                    placeholder="Financeiro, Recepção..." 
                    value={qmCategory} 
                    onChange={(e) => setQmCategory(e.target.value)}
                    className="text-xs h-9 rounded-xl"
                  />
                </div>

                <div className="sm:col-span-3 flex flex-col justify-end">
                  <div className="flex items-center justify-between p-2 rounded-xl border bg-muted/30 h-9">
                    <span className="text-[10px] font-bold">Ativo</span>
                    <Switch checked={qmEnabled} onCheckedChange={setQmEnabled} />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Descrição do Objetivo (Opcional)</Label>
                <Input 
                  placeholder="Ex: Instruções de chegada, senha do Wi-Fi e localização no Maps" 
                  value={qmDescription} 
                  onChange={(e) => setQmDescription(e.target.value)}
                  className="text-xs h-8 rounded-xl"
                />
              </div>

              {/* Inserção de Tags Dinâmicas */}
              <div className="space-y-1.5 p-3 rounded-2xl border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
                <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Clique para inserir variáveis dinâmicas no texto:
                </span>
                <div className="flex flex-wrap gap-1 pt-1">
                  {[
                    { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
                    { tag: "{{nome_hospede}}", label: "Nome Completo" },
                    { tag: "{{quarto}}", label: "Flat / Quarto" },
                    { tag: "{{numero_reserva}}", label: "Cód. Reserva" },
                    { tag: "{{data_checkin}}", label: "Entrada" },
                    { tag: "{{data_checkout}}", label: "Saída" },
                    { tag: "{{valor_total}}", label: "Valor Total" },
                    { tag: "{{valor_pago}}", label: "Valor Pago" },
                    { tag: "{{quanto_falta}}", label: "Quanto Falta" },
                    { tag: "{{status_confirmacao}}", label: "Status Confirmação" },
                    { tag: "{{chave_pix}}", label: "Chave PIX" },
                    { tag: "{{link_portal_hospede}}", label: "Link Portal" },
                    { tag: "{{link_checkin_digital}}", label: "Ficha Check-in" },
                    { tag: "{{link_cafe_manha}}", label: "Link Café" },
                    { tag: "{{link_checkout}}", label: "Link Saída" },
                    { tag: "{{wifi_rede}}", label: "Wi-Fi Rede" },
                    { tag: "{{wifi_senha}}", label: "Wi-Fi Senha" },
                    { tag: "{{link_maps}}", label: "Google Maps" },
                  ].map(t => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => setQmMessage(prev => prev + t.tag)}
                      className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-emerald-300 text-emerald-800 dark:text-emerald-300 text-[10px] font-mono hover:bg-emerald-100 transition-colors"
                    >
                      +{t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Texto da Mensagem (Suporta *negrito* e _itálico_)</Label>
                <Textarea 
                  rows={5}
                  value={qmMessage}
                  onChange={(e) => setQmMessage(e.target.value)}
                  className="text-xs font-mono leading-relaxed rounded-xl"
                  placeholder="Digite a mensagem..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Rodapé da Mensagem (Opcional)</Label>
                <Input 
                  placeholder="Ex: CorpFlats • Central de Atendimento" 
                  value={qmFooter} 
                  onChange={(e) => setQmFooter(e.target.value)}
                  className="text-xs h-8 rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setQmModalOpen(false)}>
                Cancelar
              </Button>
              <Button 
                size="sm" 
                onClick={handleSaveQmForm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                Salvar Mensagem Rápida
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  )
}
