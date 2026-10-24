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
  FileText,
  Workflow,
  Bot,
  Lightbulb,
  ArrowLeftRight,
  Image as ImageIcon,
  Upload,
  Building
} from "lucide-react"
import { AccessDenied } from "@/components/access-denied"
import { useQuickMessages, WhatsAppQuickMessage, renderQuickMessage } from "@/hooks/use-quick-messages"
import { FaqKnowledgeBase } from "@/components/faq-knowledge-base"
import { BotDemandsBacklog } from "@/components/bot-demands-backlog"
import { useBotDemands } from "@/hooks/use-bot-demands"

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
    id: "b2b", 
    label: "B2B / Agências", 
    icon: "🟣", 
    description: "Reservas corporativas B2B Reservas / Agências de Viagens",
    badgeClass: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200"
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
  recipientTarget?: "guest" | "requester" | "both"
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
  sendEmail?: boolean
  includeCompanions?: boolean
  emailSubject?: string
}

type RecipientType = "guest" | "requester" | `guest_${number}`

// Mesma regra do backend: eventos financeiros não vão para acompanhantes por padrão
const COMPANION_EXCLUDED_EVENTS = ["pre_reservation_created", "payment_pending", "additional_daily_pending", "payment_confirmed"]
const defaultIncludeCompanions = (tpl: { triggerEvent?: string; includeCompanions?: boolean }) =>
  typeof tpl.includeCompanions === "boolean" ? tpl.includeCompanions : !COMPANION_EXCLUDED_EVENTS.includes(tpl.triggerEvent || "")

const recipientTypeLabel = (type?: string) => {
  if (type === "requester") return "Solicitante"
  const m = /^guest_(\d+)$/.exec(type || "")
  if (m) return `${m[1]}º Hóspede`
  return "Hóspede"
}

interface QueueItem {
  id: string
  reservationId: number
  reservationCode: string
  guestName: string
  guestPhone: string
  guestEmail?: string
  recipientType?: RecipientType
  recipientName?: string
  recipientTarget?: "guest" | "requester" | "both"
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
  emailStatus?: string
  whatsappStatus?: string
  renderedMessage: string
  renderedButtons?: ButtonAction[]
  documentUrl?: string
  documentName?: string
  documentCaption?: string
  hasAttachment?: boolean
  createdAt?: string
}

interface HistoryItem {
  id: string
  reservationCode?: string
  guestName: string
  guestPhone: string
  recipientType?: RecipientType
  recipientName?: string
  triggerEvent: string
  message: string
  buttons?: ButtonAction[]
  documentUrl?: string
  documentName?: string
  documentCaption?: string
  hasAttachment?: boolean
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
  reviewPreviewTitle?: string
  reviewPreviewDescription?: string
  reviewPreviewImage?: string
  breakfastPreviewImage?: string
  flatPreviewImage?: string
  guestGuidePdfUrl?: string
  guestGuidePdfName?: string
  testModeOnly?: boolean
  testAllowedPhones?: string
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
      { tag: "{{status_cafe}}", label: "Café da Manhã", example: "Incluso" },
      { tag: "{{aviso_cafe_exclusivo_flat}}", label: "Aviso Café no Flat (Condicional)", example: "☕ *Sobre o seu Café da Manhã:* informamos que em nossas hospedagens o café da manhã é servido *exclusivamente no flat* (no conforto da sua acomodação)." },
      { tag: "{{valor_total}}", label: "Valor Total", example: "R$ 450,00" },
      { tag: "{{status_pagamento}}", label: "Status Pagto.", example: "Confirmado / Pago" },
      { tag: "{{canal_reserva}}", label: "Canal de Venda", example: "Site Oficial" },
      { tag: "{{nome_agencia}}", label: "Nome da Agência B2B", example: "Copastur Viagens" },
      { tag: "{{numero_reserva_b2b}}", label: "Nº Reserva B2B", example: "25057926" },
      { tag: "{{link_credenciamento_agencia}}", label: "Link Credenciamento Agência B2B", example: "https://corpflats.com.br/credenciamento/B2B-25057926" },
    ]
  },
  {
    category: "🔄 Alterações na Reserva",
    tags: [
      { tag: "{{resumo_alteracoes}}", label: "Itens Alterados (De ➔ Para)", example: "• Quarto: Flat 101 ➔ Flat 104\n• Check-in: 20/09 ➔ 22/09" },
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
    category: "👥 Solicitante & Destinatário",
    tags: [
      { tag: "{{nome_solicitante}}", label: "Nome Solicitante", example: "Maria Secretária / Petrobras" },
      { tag: "{{primeiro_nome_solicitante}}", label: "1º Nome Solicitante", example: "Maria" },
      { tag: "{{telefone_solicitante}}", label: "WhatsApp Solicitante", example: "(22) 99112-3344" },
      { tag: "{{empresa_solicitante}}", label: "Empresa Solicitante", example: "Petrobras S.A." },
      { tag: "{{nome_destinatario}}", label: "Nome Destinatário", example: "Carlos Silva" },
    ]
  },
  {
    category: "🏢 Propriedade & Wi-Fi",
    tags: [
      { tag: "{{nome_hotel}}", label: "Nome Hotel", example: "CorpFlats" },
      { tag: "{{endereco_hotel}}", label: "Endereço", example: "Rua Conselheiro Otaviano, 209" },
      { tag: "{{link_maps}}", label: "Link GPS Google", example: "https://share.google/LHu3541d5lhkdvbL2" },
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
      { tag: "{{link_avaliacao_google}}", label: "⭐ Avaliação Google Maps", example: "https://search.google.com/local/writereview?placeid=ChIJV6u4FRTVvQARAKQO7n-p-BA" },
      { tag: "{{link_guia_hospede}}", label: "📖 Manual do Hóspede (PDF)", example: "https://.../Manual_do_Hospede.pdf" },
      { tag: "{{aviso_acompanhante_pendente_pos_checkin}}", label: "👥 Link 2º Hóspede Pendente (Pós Check-in)", example: "👥 Acompanhante Pendente (2º Hóspede): envie o link..." },
    ]
  }
]

interface BotActionsSettings {
  apiActionsEnabled: boolean
  allowedActions: {
    checkAvailability: boolean
    calculateQuote: boolean
    generatePayment: boolean
    createPreReservation: boolean
    commitReservation: boolean
    reallocateReservationFlat: boolean
  }
  preReservationHoldMinutes: number
  handoverMessage: string
  updatedAt?: string
}

type BotActionKey = keyof BotActionsSettings["allowedActions"]

interface BotActionMeta {
  key: BotActionKey
  title: string
  endpoint: string
  method: "GET" | "POST"
  description: string
  iconName: string
  badgeText: string
  colorClass: string
}

const BOT_ACTIONS_METADATA: BotActionMeta[] = [
  {
    key: "checkAvailability",
    title: "Consultar Disponibilidade",
    endpoint: "/api/bot-actions/availability",
    method: "GET",
    description: "Consulta flats livres no período informado (check-in/check-out) e capacidade de hóspedes diretamente no PMS.",
    iconName: "Calendar",
    badgeText: "PMS Query",
    colorClass: "blue"
  },
  {
    key: "calculateQuote",
    title: "Calcular Orçamento & Tarifas",
    endpoint: "/api/bot-actions/quote",
    method: "POST",
    description: "Simula cotação detalhada com diárias do Motor Tarifário Inteligente (custos fixos/variáveis SEBRAE + markups por canal).",
    iconName: "Sliders",
    badgeText: "Tariff Engine",
    colorClass: "emerald"
  },
  {
    key: "generatePayment",
    title: "Gerar Pagamento PIX",
    endpoint: "/api/bot-actions/payment-link",
    method: "POST",
    description: "Emite payload BACEN BR Code copia-e-cola e QR Code base64 em tempo real para liquidação instantânea.",
    iconName: "QrCode",
    badgeText: "PIX BACEN",
    colorClass: "purple"
  },
  {
    key: "createPreReservation",
    title: "Criar Pré-Reserva (Hold Provisório)",
    endpoint: "/api/bot-actions/pre-reserve",
    method: "POST",
    description: "Bloqueia temporariamente o flat no calendário pelo tempo configurado (ex: 30 min) para garantir o quarto durante o PIX.",
    iconName: "Clock",
    badgeText: "Hold PMS",
    colorClass: "amber"
  },
  {
    key: "commitReservation",
    title: "Efetivar Reserva Confirmada",
    endpoint: "/api/bot-actions/commit-reservation",
    method: "POST",
    description: "Converte a pré-reserva em reserva confirmada definitiva no PMS, gerando código e travando permanentemente o calendário.",
    iconName: "CheckCheck",
    badgeText: "PMS Lock",
    colorClass: "emerald"
  },
  {
    key: "reallocateReservationFlat",
    title: "Remanejamento / Troca de Flat",
    endpoint: "/api/bot-actions/reallocate-flat",
    method: "POST",
    description: "Permite à Sofia trocar ou remanejar o flat de um hóspede (inclusive deslocando reserva futura não-fixa), respeitando quartos bloqueados/preferenciais.",
    iconName: "ArrowLeftRight",
    badgeText: "PMS Reallocation",
    colorClass: "amber"
  }
]

export default function WhatsappAutomation() {
  const [, setLocation] = useLocation()
  const { data: user, isLoading: loadingUser } = useGetMe()
  const { toast } = useToast()

  // Tab control - Unificado para 5 abas principais com sub-navegação na Sofia AI
  const [activeTab, setActiveTab] = useState<string>("ai_hub")
  const [aiSubTab, setAiSubTab] = useState<"training" | "behavior" | "permissions" | "simulator">("training")

  // State: Templates
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [savedTemplateMessages, setSavedTemplateMessages] = useState<Record<string, string>>({})
  const [savingCardId, setSavingCardId] = useState<string | null>(null)
  const [qmInlineDrafts, setQmInlineDrafts] = useState<Record<string, string>>({})
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
  const [editingRecipientTarget, setEditingRecipientTarget] = useState<"guest" | "requester" | "both">("guest")
  const [editingIncludeCompanions, setEditingIncludeCompanions] = useState<boolean>(true)
  const [editingSendEmail, setEditingSendEmail] = useState<boolean>(true)
  const [editingEmailSubject, setEditingEmailSubject] = useState<string>("")
  const [editingEnabled, setEditingEnabled] = useState<boolean>(true)
  const [editingHasAttachment, setEditingHasAttachment] = useState<boolean>(false)
  const [editingDocumentUrl, setEditingDocumentUrl] = useState<string>("")
  const [editingDocumentName, setEditingDocumentName] = useState<string>("Manual_do_Hospede_CorpFlats.pdf")
  const [editingDocumentCaption, setEditingDocumentCaption] = useState<string>("")
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

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
    testModeOnly: true,
    testAllowedPhones: "22998505276",
    wifiNetwork: "CorpFlats-Hospedes",
    wifiPassword: "corpflats2026",
    googleReviewUrl: "https://search.google.com/local/writereview?placeid=ChIJV6u4FRTVvQARAKQO7n-p-BA",
    reviewPreviewTitle: "⭐ Avaliar CorpFlats • Soho Residence (5 Estrelas)",
    reviewPreviewDescription: "Toque aqui para avaliar no Google",
    reviewPreviewImage: "https://corpflats.com.br/flat-preview.jpg",
    breakfastPreviewImage: "https://corpflats.com.br/breakfast-preview.jpg",
    flatPreviewImage: "https://corpflats.com.br/flat-preview.jpg"
  })
  const [uploadingPreviewSlot, setUploadingPreviewSlot] = useState<"review" | "breakfast" | "flat" | null>(null)
  const [savingPreviewTexts, setSavingPreviewTexts] = useState<boolean>(false)

  const handleUploadPreviewImage = async (slot: "review" | "breakfast" | "flat", file: File) => {
    if (!file) return
    setUploadingPreviewSlot(slot)
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const rawDataUrl = reader.result as string
          const img = new Image()
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas")
              const maxW = 1200
              const maxH = 800
              let w = img.width
              let h = img.height
              if (w > maxW) {
                h = Math.round((h * maxW) / w)
                w = maxW
              }
              if (h > maxH) {
                w = Math.round((w * maxH) / h)
                h = maxH
              }
              canvas.width = w
              canvas.height = h
              const ctx = canvas.getContext("2d")
              if (ctx) {
                ctx.fillStyle = "#ffffff"
                ctx.fillRect(0, 0, w, h)
                ctx.drawImage(img, 0, 0, w, h)
                resolve(canvas.toDataURL("image/jpeg", 0.85))
              } else {
                resolve(rawDataUrl)
              }
            } catch {
              resolve(rawDataUrl)
            }
          }
          img.onerror = () => resolve(rawDataUrl)
          img.src = rawDataUrl
        }
        reader.onerror = () => reject(new Error("Falha ao ler arquivo"))
        reader.readAsDataURL(file)
      })

      const res = await fetch("/api/whatsapp/upload-preview-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, dataUrl })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const propName = slot === "review" ? "reviewPreviewImage" : slot === "breakfast" ? "breakfastPreviewImage" : "flatPreviewImage"
        setConfig(prev => ({ ...prev, [propName]: data.imageUrl }))
        toast({
          title: "🖼️ Foto de Pré-Visualização Atualizada!",
          description: "A nova imagem já foi salva e será usada nos próximos links enviados no WhatsApp."
        })
      } else {
        toast({
          title: "Erro ao enviar foto",
          description: data.error || "Não foi possível processar a imagem.",
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({
        title: "Erro no upload",
        description: err.message,
        variant: "destructive"
      })
    } finally {
      setUploadingPreviewSlot(null)
    }
  }

  const handleSavePreviewConfig = async () => {
    setSavingPreviewTexts(true)
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewPreviewTitle: config.reviewPreviewTitle,
          reviewPreviewDescription: config.reviewPreviewDescription,
          reviewPreviewImage: config.reviewPreviewImage,
          breakfastPreviewImage: config.breakfastPreviewImage,
          flatPreviewImage: config.flatPreviewImage
        })
      })
      if (res.ok) {
        toast({
          title: "✓ Pré-visualização salva!",
          description: "Fotos e textos do card de pré-visualização no WhatsApp atualizados."
        })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setSavingPreviewTexts(false)
    }
  }
  const [statusInfo, setStatusInfo] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false)
  const [purgingRealGuests, setPurgingRealGuests] = useState<boolean>(false)
  const [togglingTestMode, setTogglingTestMode] = useState<boolean>(false)

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

  // Oportunidades de Automação & Demandas Sem Acesso
  const { stats: botDemandsStats } = useBotDemands()
  const pendingDemandsCount = botDemandsStats?.openDemands ?? 0

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
  const [qmRecipientTarget, setQmRecipientTarget] = useState<"guest" | "requester" | "both">("guest")
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
    setQmRecipientTarget("guest")
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
    setQmRecipientTarget(qm.recipientTarget || "guest")
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
      recipientTarget: qmRecipientTarget,
      message: qmMessage.trim(),
      footer: qmFooter.trim(),
      buttons: editingQm?.buttons || []
    }

    await saveQuickMessage(newItem)
    setQmModalOpen(false)
  }

  // ─── Agente de IA para WhatsApp State & Handlers ─────────────────────────
  const [aiConfig, setAiConfig] = useState<any>({
    enabled: true,
    testMode: true,
    preferredModel: "gemini-2.5-pro",
    mode: "autonomous",
    agentName: "Sofia",
    agentRole: "Concierge Virtual CorpFlats",
    responseDelaySeconds: 3,
    offHoursStart: "18:00",
    offHoursEnd: "08:00",
    handoverKeywords: [],
    systemPrompt: "",
    knowledgeBase: {}
  })
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; model: string }>({ configured: false, model: "gemini-2.5-pro" })
  const [aiTestModeOnly, setAiTestModeOnly] = useState(true)
  const [aiTestAllowedPhones, setAiTestAllowedPhones] = useState("22998505276")
  const [loadingAiConfig, setLoadingAiConfig] = useState(false)
  const [savingAiConfig, setSavingAiConfig] = useState(false)
  const [simMessage, setSimMessage] = useState("Olá, qual a senha do wifi?")
  const [simPhone, setSimPhone] = useState("22998505276")
  const [simulatingAi, setSimulatingAi] = useState(false)
  const [simResult, setSimResult] = useState<any>(null)

  // ─── Central dos 7 Canais Independentes Z-API ────────────────────────────
  const [zapiChannels, setZapiChannels] = useState<Record<string, any>>({
    guest_schedule: {
      id: "guest_schedule",
      name: "📅 Régua de Envios de Hóspedes",
      description: "Disparos programados de reservas: confirmação, pré-check-in, boas-vindas, check-out e avaliação.",
      enabled: true,
      testMode: true,
      redirectToWhitelistOnTest: false,
      whitelist: ["22998505276", "21997142513"],
      blacklist: []
    },
    ai_agent: {
      id: "ai_agent",
      name: "🤖 Agente IA Sofia & Assistente Fiscal",
      description: "Respostas autônomas da Sofia, orçamentos, disponibilidade, pré-reserva e fluxo fiscal PJ/PF.",
      enabled: true,
      testMode: true,
      redirectToWhitelistOnTest: false,
      whitelist: ["22998505276"],
      blacklist: []
    },
    maids: {
      id: "maids",
      name: "🧹 Camareiras — Limpeza & Extrato",
      description: "Escala diária às 18:00, notificações de check-out liberado, conclusão de faxina e extrato quinzenal.",
      enabled: true,
      testMode: false,
      redirectToWhitelistOnTest: true,
      whitelist: ["22998505276"],
      blacklist: []
    },
    service_providers: {
      id: "service_providers",
      name: "🔧 Prestadores de Serviço (OS)",
      description: "Abertura, encaminhamento, aprovação e acompanhamento de Ordens de Serviço de manutenção.",
      enabled: true,
      testMode: false,
      redirectToWhitelistOnTest: true,
      whitelist: ["22998505276"],
      blacklist: []
    },
    reception: {
      id: "reception",
      name: "🏢 Recepção, Portaria & Administração",
      description: "Avisos de chegada de hóspede, liberação de placa na garagem, novas reservas e alertas operacionais.",
      enabled: true,
      testMode: false,
      redirectToWhitelistOnTest: true,
      whitelist: ["22998505276"],
      blacklist: []
    },
    stay_operations: {
      id: "stay_operations",
      name: "☕ Operações de Estadia (Café & Achados)",
      description: "Comunicações de pedidos de bandeja de café da manhã e avisos de Achados e Perdidos.",
      enabled: true,
      testMode: false,
      redirectToWhitelistOnTest: true,
      whitelist: ["22998505276"],
      blacklist: []
    },
    transactional_chat: {
      id: "transactional_chat",
      name: "🔐 Chat Ao Vivo & OTP Check-in",
      description: "Mensagens enviadas manualmente pelo operador no Chat Web e código OTP de segurança no Pré-Check-in.",
      enabled: true,
      testMode: false,
      redirectToWhitelistOnTest: false,
      whitelist: ["22998505276"],
      blacklist: []
    }
  })
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null)
  const [channelPhoneInputs, setChannelPhoneInputs] = useState<Record<string, { whitelist: string; blacklist: string }>>({})

  // Developer Guidelines & WhatsApp Business AI 4-Category States
  const [developerGuidelines, setDeveloperGuidelines] = useState<any[]>([])
  const [loadingGuidelines, setLoadingGuidelines] = useState<boolean>(false)
  const [addGuidelineModalOpen, setAddGuidelineModalOpen] = useState<boolean>(false)
  const [editingGuidelineId, setEditingGuidelineId] = useState<string | null>(null)
  const [newGuidelineRule, setNewGuidelineRule] = useState<string>("")
  const [newGuidelineCategory, setNewGuidelineCategory] = useState<"always_do" | "never_do" | "persona_treatment" | "factual" | "tone">("always_do")
  const [newGuidelineSample, setNewGuidelineSample] = useState<string>("")
  const [savingGuideline, setSavingGuideline] = useState<boolean>(false)
  const [guidelineFilterCategory, setGuidelineFilterCategory] = useState<string>("all")

  // Estado das Chaves de Ação do Bot (Bot Actions API)
  const [botActionsSettings, setBotActionsSettings] = useState<BotActionsSettings>({
    apiActionsEnabled: true,
    allowedActions: {
      checkAvailability: true,
      calculateQuote: true,
      generatePayment: true,
      createPreReservation: true,
      commitReservation: true,
      reallocateReservationFlat: true
    },
    preReservationHoldMinutes: 30,
    handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
  })
  const [loadingBotActions, setLoadingBotActions] = useState<boolean>(false)
  const [savingBotActions, setSavingBotActions] = useState<boolean>(false)
  const [showAdvancedActions, setShowAdvancedActions] = useState<boolean>(false)

  const fetchZapiChannels = async () => {
    try {
      setLoadingChannels(true)
      const res = await fetch("/api/whatsapp/channels")
      if (res.ok) {
        const data = await res.json()
        if (data.channels) {
          setZapiChannels(prev => ({ ...prev, ...data.channels }))
          if (data.channels.ai_agent) {
            setAiTestModeOnly(Boolean(data.channels.ai_agent.testMode))
            if (Array.isArray(data.channels.ai_agent.whitelist)) {
              setAiTestAllowedPhones(data.channels.ai_agent.whitelist.join(", "))
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("Erro ao buscar canais Z-API:", err.message)
    } finally {
      setLoadingChannels(false)
    }
  }

  const handleUpdateZapiChannel = async (channelId: string, patch: Record<string, any>) => {
    setSavingChannelId(channelId)
    const prevChannel = zapiChannels[channelId] || {}
    setZapiChannels(prev => ({
      ...prev,
      [channelId]: {
        ...prev[channelId],
        ...patch
      }
    }))
    try {
      const res = await fetch(`/api/whatsapp/channels/${channelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      })
      if (res.ok) {
        const data = await res.json()
        if (data.allChannels) {
          setZapiChannels(prev => ({ ...prev, ...data.allChannels }))
        } else if (data.channel) {
          setZapiChannels(prev => ({ ...prev, [channelId]: data.channel }))
        }
        if (channelId === "guest_schedule") {
          fetchConfig()
        }
        if (channelId === "ai_agent") {
          fetchAiConfig()
        }
        const chName = zapiChannels[channelId]?.name || channelId
        toast({
          title: `Canal Atualizado! ✨`,
          description: `${chName} salvo com sucesso de forma independente.`
        })
      } else {
        setZapiChannels(prev => ({ ...prev, [channelId]: prevChannel }))
        toast({ title: "Erro ao atualizar canal", variant: "destructive" })
      }
    } catch (err: any) {
      setZapiChannels(prev => ({ ...prev, [channelId]: prevChannel }))
      toast({ title: "Falha de conexão", description: err.message, variant: "destructive" })
    } finally {
      setSavingChannelId(null)
    }
  }

  const handleAddChannelPhone = async (channelId: string, listType: "whitelist" | "blacklist") => {
    const rawVal = channelPhoneInputs[channelId]?.[listType] || ""
    const digits = rawVal.replace(/\D/g, "")
    if (digits.length < 8) {
      toast({ title: "Número inválido", description: "Informe um telefone com DDD (mínimo 8 dígitos).", variant: "destructive" })
      return
    }
    const currentList: string[] = Array.isArray(zapiChannels[channelId]?.[listType])
      ? zapiChannels[channelId][listType]
      : []
    if (currentList.includes(digits)) {
      toast({ title: "Número já cadastrado nesta lista" })
      return
    }
    const nextList = [...currentList, digits]
    setChannelPhoneInputs(prev => ({
      ...prev,
      [channelId]: {
        whitelist: prev[channelId]?.whitelist || "",
        blacklist: prev[channelId]?.blacklist || "",
        [listType]: ""
      }
    }))
    await handleUpdateZapiChannel(channelId, { [listType]: nextList })
  }

  const handleRemoveChannelPhone = async (channelId: string, listType: "whitelist" | "blacklist", phoneToRemove: string) => {
    const currentList: string[] = Array.isArray(zapiChannels[channelId]?.[listType])
      ? zapiChannels[channelId][listType]
      : []
    const nextList = currentList.filter(p => p !== phoneToRemove)
    await handleUpdateZapiChannel(channelId, { [listType]: nextList })
  }

  const fetchBotActionsSettings = async () => {
    try {
      setLoadingBotActions(true)
      const res = await fetch("/api/bot-actions/settings")
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setBotActionsSettings(data.settings)
        }
      }
    } catch (err: any) {
      console.warn("Erro ao buscar configurações de bot-actions:", err.message)
    } finally {
      setLoadingBotActions(false)
    }
  }

  const handleToggleMasterBotActions = async (enabled: boolean) => {
    const previous = botActionsSettings.apiActionsEnabled
    setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: enabled }))
    try {
      const res = await fetch("/api/bot-actions/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiActionsEnabled: enabled })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setBotActionsSettings(data.settings)
        }
        toast({
          title: enabled ? "⚡ Ações Autônomas Ativadas!" : "🛡️ Modo Respondedor Puro Ativado",
          description: enabled
            ? "A Sofia agora tem permissão para acionar ferramentas no PMS, tarifário e PIX."
            : "Sofia agora opera exclusivamente como tiradora de dúvidas. Chamadas da API de ações responderão 403 ACTION_DISABLED."
        })
      } else {
        setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: previous }))
        toast({ title: "Erro ao alternar chave mestra", variant: "destructive" })
      }
    } catch (err: any) {
      setBotActionsSettings(prev => ({ ...prev, apiActionsEnabled: previous }))
      toast({ title: "Falha na comunicação com o servidor", description: err.message, variant: "destructive" })
    }
  }

  const handleToggleGranularAction = async (actionKey: BotActionKey, enabled: boolean) => {
    const previous = botActionsSettings.allowedActions?.[actionKey] ?? true
    setBotActionsSettings(prev => ({
      ...prev,
      allowedActions: {
        ...prev.allowedActions,
        [actionKey]: enabled
      }
    }))
    try {
      const res = await fetch("/api/bot-actions/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowedActions: {
            [actionKey]: enabled
          }
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setBotActionsSettings(data.settings)
        }
        const meta = BOT_ACTIONS_METADATA.find(m => m.key === actionKey)
        toast({
          title: enabled ? "Ação Habilitada" : "Ação Desabilitada",
          description: `${meta?.title || actionKey}: ${enabled ? "Autorizado para IA." : "Pausado (transbordo amigável ativado)."}`
        })
      } else {
        setBotActionsSettings(prev => ({
          ...prev,
          allowedActions: {
            ...prev.allowedActions,
            [actionKey]: previous
          }
        }))
        toast({ title: "Erro ao atualizar permissão", variant: "destructive" })
      }
    } catch (err: any) {
      setBotActionsSettings(prev => ({
        ...prev,
        allowedActions: {
          ...prev.allowedActions,
          [actionKey]: previous
        }
      }))
      toast({ title: "Falha de conexão", description: err.message, variant: "destructive" })
    }
  }

  const handleSaveBotActionsParams = async () => {
    try {
      setSavingBotActions(true)
      const res = await fetch("/api/bot-actions/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preReservationHoldMinutes: Number(botActionsSettings.preReservationHoldMinutes) || 30,
          handoverMessage: botActionsSettings.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.settings) {
          setBotActionsSettings(data.settings)
        }
        toast({
          title: "Parâmetros Salvos! ✨",
          description: "Tempo de retenção e mensagem de transbordo atualizados com sucesso."
        })
      } else {
        toast({ title: "Erro ao salvar parâmetros", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Falha ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setSavingBotActions(false)
    }
  }

  const getBotOperationalMode = () => {
    if (!statusInfo?.connected || !aiConfig.enabled) {
      return {
        type: "disabled",
        label: "Bot Desativado",
        badgeClass: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800",
        dotClass: "bg-rose-500",
        description: !statusInfo?.connected
          ? "Instância Z-API desconectada no WhatsApp. Mensagens recebidas não são entregues à Sofia."
          : "O motor da IA Sofia está desligado nas opções. Respostas automáticas pausadas.",
        iconBg: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400"
      }
    }

    if (!botActionsSettings.apiActionsEnabled) {
      return {
        type: "responder",
        label: "Modo Respondedor Ativo",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
        dotClass: "bg-amber-500 animate-pulse",
        description: "A Sofia atua como Concierge Conversacional e FAQ (Gemini puro). Responde dúvidas sobre regras, Wi-Fi e comodidades, mas está proibida de acessar o PMS e gerar cobranças.",
        iconBg: "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
      }
    }

    const activeCount = Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length
    return {
      type: "autonomous",
      label: "Modo Autônomo com Ações",
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
      dotClass: "bg-emerald-500 animate-ping",
      description: `A Sofia opera com autonomia executiva via Function Calling. ${activeCount} de 5 ações permitidas no PMS e financeiro (disponibilidade, tarifas, pré-reserva, PIX e confirmação).`,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
    }
  }

  const fetchAiConfig = async () => {
    try {
      setLoadingAiConfig(true)
      const res = await fetch("/api/whatsapp/ai-config")
      if (res.ok) {
        const data = await res.json()
        if (data.aiConfig) {
          setAiConfig((prev: any) => ({
            ...prev,
            ...data.aiConfig,
            preferredModel: data.aiConfig.preferredModel || data.geminiModel || "gemini-2.5-pro"
          }))
          if (Array.isArray(data.aiConfig.developerGuidelines)) {
            setDeveloperGuidelines(data.aiConfig.developerGuidelines)
          }
        }
        setGeminiStatus({
          configured: Boolean(data.geminiConfigured),
          model: data.aiConfig?.preferredModel || data.geminiModel || "gemini-2.5-pro"
        })
        const aiCh = data.aiChannel
        if (aiCh) {
          setAiTestModeOnly(Boolean(aiCh.testMode))
          setAiTestAllowedPhones(Array.isArray(aiCh.whitelist) ? aiCh.whitelist.join(", ") : (data.testAllowedPhones || "22998505276"))
          setZapiChannels(prev => ({ ...prev, ai_agent: aiCh }))
        } else {
          setAiTestModeOnly(data.aiConfig?.testMode ?? data.testModeOnly ?? true)
          setAiTestAllowedPhones(data.testAllowedPhones || "22998505276")
        }
      }
    } catch (e: any) {
      console.warn("Erro ao carregar configurações da IA:", e.message)
    } finally {
      setLoadingAiConfig(false)
    }
  }

  const fetchDeveloperGuidelines = async () => {
    try {
      setLoadingGuidelines(true)
      const res = await fetch("/api/whatsapp/ai-guidelines")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.guidelines)) {
          setDeveloperGuidelines(data.guidelines)
        }
      }
    } catch (e: any) {
      console.warn("Erro ao carregar diretrizes aprendidas:", e.message)
    } finally {
      setLoadingGuidelines(false)
    }
  }

  const handleOpenAddGuidelineModal = (defaultCat: "always_do" | "never_do" | "persona_treatment" | "factual" = "always_do") => {
    setEditingGuidelineId(null)
    setNewGuidelineRule("")
    setNewGuidelineCategory(defaultCat)
    setNewGuidelineSample("")
    setAddGuidelineModalOpen(true)
  }

  const handleOpenEditGuidelineModal = (guide: any) => {
    setEditingGuidelineId(guide.id)
    setNewGuidelineRule(guide.rule || guide.text || "")
    const cat = guide.category === "tone" ? "persona_treatment" : (guide.category || "factual")
    setNewGuidelineCategory(cat)
    setNewGuidelineSample(guide.sample || guide.sampleResponse || "")
    setAddGuidelineModalOpen(true)
  }

  const handleSaveNewGuideline = async () => {
    if (!newGuidelineRule.trim()) {
      toast({ title: "Informe o texto da diretriz", variant: "destructive" })
      return
    }

    try {
      setSavingGuideline(true)
      const isEditing = Boolean(editingGuidelineId)
      const url = isEditing
        ? `/api/whatsapp/ai-guidelines/${editingGuidelineId}`
        : "/api/whatsapp/ai-guidelines"
      const method = isEditing ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule: newGuidelineRule.trim(),
          text: newGuidelineRule.trim(),
          correctionText: newGuidelineRule.trim(),
          category: newGuidelineCategory,
          sample: newGuidelineSample.trim() || undefined,
          enabled: true,
          active: true,
          source: "manual"
        })
      })

      if (res.ok) {
        toast({
          title: isEditing ? "Diretriz Atualizada com Sucesso! ✏️✨" : "Diretriz Adicionada com Sucesso! 🧠✨",
          description: "A regra está ativa no prompt dinâmico da Sofia."
        })
        setAddGuidelineModalOpen(false)
        setEditingGuidelineId(null)
        fetchDeveloperGuidelines()
        fetchAiConfig()
      } else {
        const err = await res.json()
        toast({ title: "Erro ao salvar diretriz", description: err.error || "Falha na requisição", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setSavingGuideline(false)
    }
  }

  const handleToggleGuidelineActive = async (guide: any, newEnabled: boolean) => {
    const id = guide.id
    if (!id) return
    setDeveloperGuidelines(prev =>
      prev.map(g => g.id === id ? { ...g, enabled: newEnabled, active: newEnabled } : g)
    )
    try {
      const res = await fetch(`/api/whatsapp/ai-guidelines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled, active: newEnabled })
      })
      if (res.ok) {
        toast({
          title: newEnabled ? "Diretriz Ativada ✅" : "Diretriz Pausada ⏸️",
          description: newEnabled
            ? "A Sofia voltará a aplicar esta regra nas conversas."
            : "A regra foi desativada temporariamente sem ser excluída."
        })
        fetchDeveloperGuidelines()
      }
    } catch (err: any) {
      toast({ title: "Erro ao alternar diretriz", description: err.message, variant: "destructive" })
    }
  }

  const handleQuickAddFormalVocative = async () => {
    try {
      setSavingGuideline(true)
      const res = await fetch("/api/whatsapp/ai-guidelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule: "Sempre chamar os hóspedes pelo nome precedido de Sr. ou Sra. (ex: Sr. Miller, Sra. Ana) em todas as interações.",
          text: "Sempre chamar os hóspedes pelo nome precedido de Sr. ou Sra. (ex: Sr. Miller, Sra. Ana) em todas as interações.",
          category: "persona_treatment",
          sample: "Olá! Qual o horário de check-in?",
          enabled: true,
          active: true,
          source: "manual"
        })
      })
      if (res.ok) {
        toast({
          title: "🎩 Tratamento Formal (Sr. / Sra.) Ativado!",
          description: "A Sofia agora tratará os hóspedes como Sr. / Sra. em todas as respostas."
        })
        fetchDeveloperGuidelines()
        fetchAiConfig()
      }
    } catch (err: any) {
      toast({ title: "Erro ao ativar regra", description: err.message, variant: "destructive" })
    } finally {
      setSavingGuideline(false)
    }
  }

  const handleDeleteGuideline = async (id: string) => {
    try {
      const res = await fetch(`/api/whatsapp/ai-guidelines/${id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        toast({
          title: "Diretriz Excluída",
          description: "A diretriz foi removida da base da Sofia."
        })
        setDeveloperGuidelines(prev => prev.filter(g => (g.id || g) !== id))
        fetchDeveloperGuidelines()
        fetchAiConfig()
      } else {
        const err = await res.json()
        toast({ title: "Erro ao excluir", description: err.error || "Falha na requisição", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" })
    }
  }

  const handleTestGuidelineInSimulator = (guide: any) => {
    const textToTest = guide.sample || guide.rule || guide.text || ""
    setSimMessage(textToTest)
    setAiSubTab("simulator")
    toast({
      title: "Diretriz Carregada no Simulador! 🎯",
      description: `Pergunta preenchida para teste: "${textToTest.slice(0, 60)}${textToTest.length > 60 ? '...' : ''}"`
    })
  }

  const handleSaveAiConfig = async () => {
    try {
      setSavingAiConfig(true)
      const payload = {
        ...aiConfig,
        testMode: aiTestModeOnly,
        testModeOnly: aiTestModeOnly,
        testAllowedPhones: aiTestAllowedPhones
      }
      const res = await fetch("/api/whatsapp/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        toast({
          title: "Configurações da IA Salvas! 🤖✨",
          description: `Modelo ${aiConfig.preferredModel || "gemini-2.5-pro"} e canal da IA atualizados com sucesso.`
        })
        fetchAiConfig()
        fetchZapiChannels()
        fetchDeveloperGuidelines()
      } else {
        const err = await res.json()
        toast({ title: "Erro ao salvar", description: err.error || "Falha na requisição", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setSavingAiConfig(false)
    }
  }

  const handleSimulateAi = async () => {
    if (!simMessage.trim()) return
    try {
      setSimulatingAi(true)
      setSimResult(null)
      const res = await fetch("/api/whatsapp/ai-simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: simMessage, phone: simPhone })
      })
      const data = await res.json()
      if (data.success) {
        setSimResult(data)
      } else {
        toast({ title: "Erro na simulação", description: data.error || "Falha ao gerar resposta", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro na simulação", description: err.message, variant: "destructive" })
    } finally {
      setSimulatingAi(false)
    }
  }

  // Initial Data Fetching
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get("tab")
      if (tabParam) {
        if (tabParam === "faq" || tabParam === "training" || tabParam === "demands_backlog") {
          setActiveTab("ai_hub")
          setAiSubTab("training")
        } else if (tabParam === "ai_agent" || tabParam === "behavior") {
          setActiveTab("ai_hub")
          setAiSubTab("behavior")
        } else if (tabParam === "permissions" || tabParam === "actions" || tabParam === "bot_actions") {
          setActiveTab("ai_hub")
          setAiSubTab("permissions")
        } else if (tabParam === "simulator") {
          setActiveTab("ai_hub")
          setAiSubTab("simulator")
        } else if (tabParam === "channels" || tabParam === "whitelist") {
          setActiveTab("channels")
        } else {
          setActiveTab(tabParam)
        }
      }
    }
    fetchTemplates()
    fetchQueue()
    fetchConfig()
    fetchZapiChannels()
    fetchReservations()
    checkStatus()
    fetchAiConfig()
    fetchDeveloperGuidelines()
    fetchBotActionsSettings()
  }, [])

  // Auto-refresh guidelines & channels when switching tabs
  useEffect(() => {
    if (activeTab === "ai_hub" || activeTab === "ai_agent") {
      fetchAiConfig()
      fetchDeveloperGuidelines()
      fetchZapiChannels()
    } else if (activeTab === "channels") {
      fetchZapiChannels()
    }
  }, [activeTab])

  const fetchTemplates = async () => {
    try {
      const res = await fetch("/api/whatsapp/templates")
      if (res.ok) {
        const data: WhatsAppTemplate[] = await res.json()
        setTemplates(data)
        const map: Record<string, string> = {}
        data.forEach(t => {
          map[t.id] = t.message || ""
        })
        setSavedTemplateMessages(map)
        if (data.length > 0 && !selectedTemplateId) {
          selectTemplateForEditing(data[0])
        } else if (selectedTemplateId) {
          const updatedSelected = data.find(t => t.id === selectedTemplateId)
          if (updatedSelected) selectTemplateForEditing(updatedSelected)
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
    setEditingRecipientTarget(tpl.recipientTarget || "guest")
    setEditingIncludeCompanions(defaultIncludeCompanions(tpl))
    setEditingSendEmail(tpl.sendEmail !== false)
    setEditingEmailSubject(tpl.emailSubject || "")
    setEditingEnabled(tpl.enabled !== false)
    setEditingHasAttachment(Boolean(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && tpl.documentUrl)))
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

  // Inline edit message directly inside the trigger card
  const handleInlineTemplateMessageChange = (tplId: string, newMessage: string) => {
    setTemplates(prev => prev.map(t => t.id === tplId ? { ...t, message: newMessage } : t))
    if (currentTemplate?.id === tplId) {
      setEditingMessage(newMessage)
      setCurrentTemplate(prev => prev ? { ...prev, message: newMessage } : prev)
    }
  }

  // Save template message directly from the trigger card
  const handleSaveCardTemplate = async (tpl: WhatsAppTemplate) => {
    setSavingCardId(tpl.id)
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tpl)
      })
      if (res.ok) {
        setSavedTemplateMessages(prev => ({ ...prev, [tpl.id]: tpl.message }))
        if (currentTemplate?.id === tpl.id) {
          setCurrentTemplate(tpl)
          setEditingMessage(tpl.message)
        }
        toast({
          title: "✓ Mensagem salva com sucesso!",
          description: `O texto da regra "${tpl.title}" foi atualizado.`
        })
      } else {
        toast({ title: "Erro ao salvar mensagem", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    } finally {
      setSavingCardId(null)
    }
  }

  // Revert inline edits on a trigger card
  const handleRevertCardTemplate = (tplId: string) => {
    const originalMsg = savedTemplateMessages[tplId]
    if (originalMsg === undefined) return
    setTemplates(prev => prev.map(t => t.id === tplId ? { ...t, message: originalMsg } : t))
    if (currentTemplate?.id === tplId) {
      setEditingMessage(originalMsg)
      setCurrentTemplate(prev => prev ? { ...prev, message: originalMsg } : prev)
    }
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
      recipientTarget: editingRecipientTarget,
      includeCompanions: editingIncludeCompanions,
      sendEmail: editingSendEmail,
      emailSubject: editingEmailSubject.trim(),
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
        setSavedTemplateMessages(prev => ({ ...prev, [updatedTemplate.id]: updatedTemplate.message }))
        setCurrentTemplate(updatedTemplate)
      } else {
        toast({ title: "Erro ao salvar template", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" })
    }
  }

  // Toggle Master Engine (Motor Geral de Envio)
  const handleToggleMasterEngine = async (newEnabled: boolean) => {
    setConfig(prev => ({ ...prev, enabled: newEnabled }))
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled })
      })
      if (res.ok) {
        toast({
          title: newEnabled ? "⚡ Motor de WhatsApp Ativado!" : "⏸️ Motor de WhatsApp Pausado",
          description: newEnabled 
            ? "O sistema agora disparará mensagens da régua automaticamente para os hóspedes."
            : "Os envios automáticos da régua estão pausados. Disparos manuais continuam disponíveis."
        })
      }
    } catch (e: any) {
      toast({ title: "Erro ao atualizar motor", description: e.message, variant: "destructive" })
    }
  }

  const handleToggleTestMode = async (enabled: boolean) => {
    setTogglingTestMode(true)
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testModeOnly: enabled })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setConfig(prev => ({ ...prev, testModeOnly: enabled }))
        toast({
          title: enabled ? "🛡️ Modo Teste Ativado (Sandbox)" : "⚠️ Modo Produção Ativado",
          description: enabled 
            ? "Hóspedes reais estão protegidos e não receberão mensagens. Apenas telefones autorizados receberão envios."
            : "Atenção: O sistema está em Modo Produção. Mensagens serão entregues aos hóspedes reais das reservas.",
          variant: enabled ? "default" : "destructive"
        })
        fetchQueue()
      } else {
        toast({ title: "Erro ao alternar modo de teste", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de conexão", description: err.message, variant: "destructive" })
    } finally {
      setTogglingTestMode(false)
    }
  }

  const handlePurgeRealGuests = async () => {
    if (!confirm("Deseja cancelar todos os agendamentos pendentes de hóspedes reais na fila? O seu número de teste continuará funcionando normalmente.")) {
      return
    }
    setPurgingRealGuests(true)
    try {
      const res = await fetch("/api/whatsapp/queue/cancel-real-guests", { method: "POST" })
      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "Fila limpa com segurança!",
          description: `${data.cancelledCount} agendamento(s) de hóspedes reais cancelados com sucesso.`
        })
        fetchQueue()
      } else {
        toast({ title: "Erro ao limpar fila", description: data.error || "Não foi possível cancelar os itens.", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" })
    } finally {
      setPurgingRealGuests(false)
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

        // Se o usuário ativou o gatilho mas o motor geral estiver desligado, ativa o motor geral automaticamente!
        if (newEnabled && !config.enabled) {
          handleToggleMasterEngine(true)
        }
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

      const isGoogleRevTest = /writereview\?placeid=|g\.page\/r\/|link_avaliacao_google/i.test(String(payload.message || ""))
      if (isGoogleRevTest) {
        payload.sendMode = "text"
        payload.footer = ""
        payload.buttons = []
      } else if (testSendMode === "buttons") {
        if (testIncludeButtons && editingButtons.length > 0) {
          payload.buttons = editingButtons
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
    const mapsUrl = "https://share.google/LHu3541d5lhkdvbL2"

    const totalAmount = Number(targetRes.totalAmount) || 450
    const isPaidInFull = targetRes.paymentStatus === "pago" || targetRes.paymentStatus === "pago_total" || (Number(targetRes.paidAmount) >= totalAmount && totalAmount > 0)
    const paidAmount = Number(targetRes.paidAmount ?? (isPaidInFull ? totalAmount : 0))
    const pendingAmount = isPaidInFull ? 0 : Math.max(0, totalAmount - paidAmount)
    const fmtTotal = totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const fmtPaid = paidAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const fmtPending = pendingAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    const isPreReserva = targetRes.status === "pre_reserva"

    const map: Record<string, string> = {
      "{{nome_hospede}}": targetRes.guestName || "Hóspede",
      "{{primeiro_nome}}": firstName,
            "{{telefone_hospede}}": targetRes.guestPhone || "(22) 99887-7665",
      "{{nome_solicitante}}": targetRes.requesterInfo?.name || targetRes.companyName || targetRes.guestName || "Maria (Solicitante)",
      "{{primeiro_nome_solicitante}}": (targetRes.requesterInfo?.name || targetRes.guestName || "Maria").split(" ")[0],
      "{{telefone_solicitante}}": targetRes.requesterInfo?.phone || targetRes.guestPhone || "(22) 99112-3344",
      "{{empresa_solicitante}}": targetRes.companyName || "Empresa Parceira",
      "{{nome_destinatario}}": targetRes.guestName || "Carlos Silva",
      "{{primeiro_nome_destinatario}}": firstName,
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
      "{{status_pagamento}}": isPaidInFull ? "Confirmado / Pago" : (paidAmount > 0 ? "Sinal Pago" : "Pendente"),
      "{{chave_pix}}": "47.964.813/0001-65",
      "{{titular_pix}}": "CorpFlats Hospedagem",
      "{{instrucao_saldo}}": pendingAmount > 0 ? `ℹ️ *Aviso de Pagamento:* Resta o saldo de ${fmtPending} a acertar no check-in.` : "",
      "{{instrucao_pagamento}}": `Para garantir e confirmar sua acomodação, efetue o pagamento via PIX ou cartão pelo portal do hóspede:\n👉 https://corpflats.com.br/minha-reserva/${code}`,
      "{{canal_reserva}}": targetRes.channel || "Site CorpFlats",
      "{{nome_hotel}}": "CorpFlats - Soho Residence",
      "{{endereco_hotel}}": "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
      "{{link_maps}}": mapsUrl,
      "{{wifi_rede}}": config.wifiNetwork || "CorpFlats-Hospedes",
      "{{wifi_senha}}": config.wifiPassword || "corpflats2026",
      "{{telefone_hotel}}": "5522997124021",
      "{{link_checkin_digital}}": `https://corpflats.com.br/pre-checkin/${code}`,
      "{{link_portal_hospede}}": `https://corpflats.com.br/portal-hospede/${code}`,
      "{{link_credenciamento_agencia}}": `https://corpflats.com.br/credenciamento/${code}`,
      "{{nome_agencia}}": targetRes.agencyTradeName || targetRes.agencyName || "Copastur Viagens",
      "{{numero_reserva_b2b}}": targetRes.b2bReservationNumber || targetRes.externalReservationNumber || code,
      "{{link_cafe_manha}}": `https://corpflats.com.br/cafe/${code}`,
      "{{link_checkout}}": `https://corpflats.com.br/checkout/${code}`,
      "{{link_avaliacao_google}}": config.googleReviewUrl || "https://search.google.com/local/writereview?placeid=ChIJV6u4FRTVvQARAKQO7n-p-BA",
      "{{status_cafe}}": (targetRes.includeBreakfast || targetRes.ratePlan === "with_breakfast") ? "Incluso" : "Não incluso",
      "{{aviso_cafe_exclusivo_flat}}": (targetRes.includeBreakfast || targetRes.ratePlan === "with_breakfast") ? "☕ *Sobre o seu Café da Manhã:* informamos que em nossas hospedagens o café da manhã é servido *exclusivamente no flat* (entregue diretamente na sua acomodação no horário agendado por você)." : "",
      "{{resumo_alteracoes}}": "• *Acomodação / Quarto:* Flat 101 ➔ *Flat 113*\n• *Data de Entrada (Check-in):* 03/09/2026 ➔ *05/09/2026*\n• *Valor Total:* R$ 450,00 ➔ *R$ 600,00*"
    }

    let rendered = text
    for (const [tag, val] of Object.entries(map)) {
      rendered = rendered.split(tag).join(val)
    }
    rendered = rendered.replace(/\n{3,}/g, "\n\n").trim()
    return rendered
  }

  // Format WhatsApp markdown (*bold*, _italic_) into styled HTML safely
  const formatWhatsappMarkdown = (txt: string) => {
    const rendered = renderPreviewText(txt)
    return rendered
      .split("\n")
      .map((line, lineIdx) => {
        // Simple bold + URL parser
        const parts = line.split(/(\*[^*]+\*|https?:\/\/[^\s]+)/g)
        return (
          <span key={lineIdx} className="block leading-relaxed min-h-[1.2em]">
            {parts.map((p, pIdx) => {
              if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
                return <strong key={pIdx} className="font-bold text-neutral-900 dark:text-neutral-50">{p.slice(1, -1)}</strong>
              }
              if (/^https?:\/\//i.test(p)) {
                return <a key={pIdx} href={p} target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline break-all">{p}</a>
              }
              return <span key={pIdx}>{p}</span>
            })}
          </span>
        )
      })
  }

  if (!loadingUser && user?.role !== "admin" && user?.role !== "dev") {
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
            {/* Master Engine Switch */}
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs transition-colors ${
                config.enabled 
                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                  : "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${config.enabled ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              <span className="text-xs font-bold">
                Motor: {config.enabled ? "ATIVADO" : "PAUSADO"}
              </span>
              <Switch 
                checked={config.enabled}
                onCheckedChange={handleToggleMasterEngine}
                className="scale-75 data-[state=checked]:bg-emerald-600"
              />
            </div>

            {/* Test Mode / Sandbox Switch */}
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-xs transition-colors ${
                config.testModeOnly !== false 
                  ? "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300"
                  : "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300"
              }`}
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${config.testModeOnly !== false ? "text-blue-600" : "text-red-600"}`} />
              <span className="text-xs font-bold">
                {config.testModeOnly !== false ? "Modo Teste: ATIVO" : "Produção: HÓSPEDES"}
              </span>
              <Switch 
                checked={config.testModeOnly !== false}
                onCheckedChange={handleToggleTestMode}
                disabled={togglingTestMode}
                className="scale-75 data-[state=checked]:bg-blue-600"
              />
            </div>

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
              className="gap-1.5 text-xs rounded-xl bg-amber-500/10 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 font-semibold shadow-xs"
              onClick={() => setLocation("/jornada-reservas")}
            >
              <Workflow className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Mapa da Jornada (Fluxograma)
            </Button>

            <Button 
              size="sm" 
              className="gap-1.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
              onClick={() => setLocation("/whatsapp-chat")}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              WhatsApp Web (Chat Ao Vivo)
            </Button>

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

        {/* Banner de Alerta quando Motor Geral estiver Desativado */}
        {!config.enabled && (
          <div className="p-4 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  O Motor de Envio Automático de WhatsApp está PAUSADO
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Mesmo que os gatilhos abaixo estejam ativados, as mensagens automáticas não serão enviadas até que o motor geral seja ligado.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleToggleMasterEngine(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shrink-0 shadow-xs"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              Ativar Motor de Envio Agora
            </Button>
          </div>
        )}

        {/* Banner do Modo de Teste / Sandbox */}
        {config.testModeOnly !== false ? (
          <div className="p-4 rounded-2xl border border-blue-300 dark:border-blue-800 bg-blue-50/90 dark:bg-blue-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-blue-950 dark:text-blue-100">
                    Modo de Teste / Sandbox Ativo — Hóspedes Reais Protegidos
                  </h4>
                  <Badge className="bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100 text-[10px] font-bold">
                    Whitelist Ativa
                  </Badge>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  Nenhuma mensagem será enviada para hóspedes reais. Apenas o seu telefone (<strong>{config.testAllowedPhones || "22998505276"}</strong>) receberá disparos de teste e simulações.
                  <span className="block mt-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    🧹 As automações de Camareiras & Governança (resumos diários às 18:00, alertas e quinzena) continuam operando normalmente.
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <Button
                size="sm"
                variant="outline"
                onClick={handlePurgeRealGuests}
                disabled={purgingRealGuests}
                className="bg-white dark:bg-zinc-900 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 text-xs font-semibold gap-1.5 shadow-xs hover:bg-blue-100"
              >
                {purgingRealGuests ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-500" />}
                Limpar Fila de Hóspedes Reais
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-red-950 dark:text-red-100">
                  ⚠️ ATENÇÃO: MODO PRODUÇÃO ATIVADO
                </h4>
                <p className="text-xs text-red-800 dark:text-red-300">
                  O sistema enviará mensagens reais aos números de telefone dos hóspedes de acordo com as réguas programadas.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleToggleTestMode(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5 shrink-0 shadow-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Ativar Modo de Teste Seguro
            </Button>
          </div>
        )}

        {/* Barra Resumo de Status dos 7 Canais Independentes Z-API */}
        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-card/90 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-black tracking-tight text-foreground">
                Governança Independente por Canal Z-API (7 Canais Isolados)
              </span>
              <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-700 dark:text-indigo-300">
                Isolamento de Modo Teste & Whitelist
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveTab("channels")}
              className="h-7 text-[11px] font-bold rounded-xl gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:border-indigo-800"
            >
              <Sliders className="w-3 h-3" />
              Gerenciar os 7 Canais, Whitelist & Blacklist
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              { id: "guest_schedule", short: "📅 Régua Hóspedes" },
              { id: "ai_agent", short: "🤖 IA Sofia & Fiscal" },
              { id: "maids", short: "🧹 Camareiras" },
              { id: "service_providers", short: "🔧 Prestadores (OS)" },
              { id: "reception", short: "🏢 Recepção" },
              { id: "stay_operations", short: "☕ Café & Achados" },
              { id: "transactional_chat", short: "🔐 Chat & OTP" }
            ].map(item => {
              const ch = zapiChannels[item.id] || {}
              const isEnabled = ch.enabled !== false
              const isTest = Boolean(ch.testMode)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab("channels")}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer hover:shadow-xs ${
                    !isEnabled
                      ? "bg-slate-100/80 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800 opacity-75"
                      : isTest
                      ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800"
                      : "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800"
                  }`}
                >
                  <div className="text-[11px] font-bold truncate text-foreground">{item.short}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      !isEnabled ? "bg-slate-400" : isTest ? "bg-blue-600 animate-pulse" : "bg-emerald-600"
                    }`} />
                    <span className={`text-[10px] font-bold ${
                      !isEnabled
                        ? "text-slate-600 dark:text-slate-400"
                        : isTest
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-emerald-700 dark:text-emerald-300"
                    }`}>
                      {!isEnabled ? "Pausado" : isTest ? "Modo Teste" : "Produção"}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tabs Principais Unificadas (6 Abas Limpas) */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full md:w-auto rounded-xl p-1 bg-muted/60">
            <TabsTrigger value="ai_hub" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <Bot className="w-3.5 h-3.5 text-blue-500" />
              <span>🤖 Agente Sofia (IA)</span>
              {pendingDemandsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-amber-600 text-white font-black" title="Demandas/Perguntas pendentes">
                  {pendingDemandsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="channels" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <Sliders className="w-3.5 h-3.5 text-indigo-500" />
              <span>🎛️ Canais & Whitelist</span>
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-indigo-600 text-white font-black">
                7
              </span>
            </TabsTrigger>
            <TabsTrigger value="rules" className="rounded-lg text-xs font-bold gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              ⚡ Régua Automática
            </TabsTrigger>
            <TabsTrigger value="quick_messages" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
              💬 Mensagens Rápidas
              <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-600 text-white font-black">
                {quickMessages.filter(m => m.enabled !== false).length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="rounded-lg text-xs font-bold gap-1.5 relative">
              <Clock className="w-3.5 h-3.5 text-purple-500" />
              🕒 Fila de Envios
              {queue.filter(q => q.status === "scheduled").length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] rounded-full bg-purple-600 text-white font-black">
                  {queue.filter(q => q.status === "scheduled").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-lg text-xs font-bold gap-1.5">
              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              ✅ Histórico
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════════
              ABA NOVA: CENTRAL DE GOVERNANÇA DOS 7 CANAIS, WHITELIST & BLACKLIST
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="channels" className="space-y-6 animate-in fade-in-50 duration-200">
            <Card className="border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 via-background to-background shadow-xs">
              <CardHeader className="pb-3 border-b">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base sm:text-lg font-black flex items-center gap-2 text-indigo-950 dark:text-indigo-100">
                      <ShieldCheck className="w-5 h-5 text-indigo-600" />
                      Central de Governança dos 7 Canais Independentes Z-API
                    </CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Cada canal possui seu próprio interruptor <strong>Ativo/Pausado</strong>, seu próprio <strong>Modo Teste vs. Produção</strong>, sua <strong>Whitelist</strong> e sua <strong>Blacklist</strong>. Colocar a <em>Régua de Hóspedes</em> ou a <em>IA Sofia</em> em Modo Teste <strong>não bloqueia</strong> os envios de <em>Camareiras</em> ou <em>Prestadores de Serviço</em>.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchZapiChannels}
                    disabled={loadingChannels}
                    className="h-8 text-xs font-bold gap-1.5 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingChannels ? "animate-spin" : ""}`} />
                    Atualizar Canais
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {[
                    {
                      id: "guest_schedule",
                      title: "1. 📅 Régua de Envios de Hóspedes",
                      subtitle: "Disparos programados de reservas (confirmação, pré-check-in, boas-vindas, check-out e avaliação).",
                      dispatches: [
                        "Confirmação de Reserva & PIX",
                        "Lembrete de Pré-Check-in Digital",
                        "Instruções de Chegada & Senha da Porta",
                        "Lembrete de Check-out (12:00h)",
                        "Agradecimento Pós-Check-out"
                      ]
                    },
                    {
                      id: "ai_agent",
                      title: "2. 🤖 Agente IA Sofia & Assistente Fiscal",
                      subtitle: "Respostas autônomas da Sofia no WhatsApp, cotações, disponibilidade, pré-reserva e fluxo fiscal PJ/PF.",
                      dispatches: [
                        "Atendimento Conversacional IA Sofia",
                        "Cotações, Disponibilidade e Pré-Reservas",
                        "Fluxo Fiscal Automático (CNPJ/CPF p/ NFS-e)",
                        "Modo Treinador / Desenvolvedor (22998505276)",
                        "Retificações de Mensagens via Chat Web"
                      ]
                    },
                    {
                      id: "maids",
                      title: "3. 🧹 Camareiras — Limpeza & Extrato",
                      subtitle: "Comunicações operacionais exclusivas da equipe de governança e camareiras.",
                      dispatches: [
                        "Resumo Diário de Escala às 18:00h",
                        "Aviso Imediato de Check-out Concluído (Quarto Liberado)",
                        "Confirmação de Conclusão de Faxina",
                        "Fechamento e Extrato Quinzenal de Limpezas",
                        "Alertas de Atraso de Higienização"
                      ]
                    },
                    {
                      id: "service_providers",
                      title: "4. 🔧 Prestadores de Serviço (OS)",
                      subtitle: "Acionamento de técnicos e prestadores externos para manutenção preventiva e corretiva.",
                      dispatches: [
                        "Abertura e Encaminhamento de Ordem de Serviço (OS)",
                        "Aprovação de Orçamento de Manutenção",
                        "Notificação de Urgência / Interdição de Flat"
                      ]
                    },
                    {
                      id: "reception",
                      title: "5. 🏢 Recepção, Portaria & Administração",
                      subtitle: "Avisos internos para a portaria 24h do condomínio Soho e equipe administrativa.",
                      dispatches: [
                        "Ficha de Pré-Check-in e Liberação na Portaria",
                        "Autorização de Placa de Veículo na Garagem",
                        "Avisos de Nova Reserva / Early Check-in",
                        "Alertas Operacionais da Administração"
                      ]
                    },
                    {
                      id: "stay_operations",
                      title: "6. ☕ Operações de Estadia (Café & Achados)",
                      subtitle: "Comunicações transacionais de serviços durante ou logo após a estadia.",
                      dispatches: [
                        "Confirmação e Cardápio de Bandeja de Café da Manhã",
                        "Avisos de Entrega de Café no Quarto",
                        "Notificações de Achados e Perdidos (Itens Esquecidos)"
                      ]
                    },
                    {
                      id: "transactional_chat",
                      title: "7. 🔐 Chat Ao Vivo & OTP Check-in",
                      subtitle: "Mensagens digitadas manualmente por operadores humanos e códigos de verificação imediata.",
                      dispatches: [
                        "Mensagens Manuais do Operador no Chat Web",
                        "Código OTP de Segurança no Pré-Check-in Digital",
                        "Disparos Manuais Diretos de Reserva"
                      ]
                    }
                  ].map((meta) => {
                    const ch = zapiChannels[meta.id] || {
                      id: meta.id,
                      name: meta.title,
                      enabled: true,
                      testMode: false,
                      redirectToWhitelistOnTest: false,
                      whitelist: ["22998505276"],
                      blacklist: []
                    }
                    const isEnabled = ch.enabled !== false
                    const isTest = Boolean(ch.testMode)
                    const isRedirect = Boolean(ch.redirectToWhitelistOnTest)
                    const whitelist: string[] = Array.isArray(ch.whitelist) ? ch.whitelist : []
                    const blacklist: string[] = Array.isArray(ch.blacklist) ? ch.blacklist : []
                    const inputState = channelPhoneInputs[meta.id] || { whitelist: "", blacklist: "" }

                    return (
                      <Card
                        key={meta.id}
                        className={`border-2 transition-all rounded-2xl overflow-hidden ${
                          !isEnabled
                            ? "border-slate-300 dark:border-slate-800 bg-muted/30 opacity-85"
                            : isTest
                            ? "border-blue-300 dark:border-blue-800 bg-blue-50/20 dark:bg-blue-950/10"
                            : "border-emerald-300 dark:border-emerald-800 bg-emerald-50/15 dark:bg-emerald-950/10"
                        }`}
                      >
                        <CardHeader className="p-4 pb-3 border-b bg-card/80">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <CardTitle className="text-sm font-black text-foreground">
                                  {meta.title}
                                </CardTitle>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-bold ${
                                    !isEnabled
                                      ? "bg-slate-200 text-slate-700 border-slate-300"
                                      : isTest
                                      ? "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200"
                                      : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200"
                                  }`}
                                >
                                  {!isEnabled ? "⏸️ Canal Pausado" : isTest ? "🧪 Modo Teste (Whitelist)" : "🟢 Modo Produção"}
                                </Badge>
                              </div>
                              <CardDescription className="text-[11px] leading-snug">
                                {meta.subtitle}
                              </CardDescription>
                            </div>
                            {savingChannelId === meta.id && (
                              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                            )}
                          </div>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4 text-xs">
                          {/* 3 Controles Independentes do Canal */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {/* Switch 1: Canal Ativo */}
                            <div className="p-2.5 rounded-xl border bg-background flex items-center justify-between gap-2">
                              <div>
                                <div className="font-bold text-[11px]">Status do Canal</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {isEnabled ? "Ativo para envios" : "Pausado (Bloqueado)"}
                                </div>
                              </div>
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(val) => handleUpdateZapiChannel(meta.id, { enabled: val })}
                                className="data-[state=checked]:bg-emerald-600 scale-90"
                              />
                            </div>

                            {/* Switch 2: Modo Teste vs Produção */}
                            <div className="p-2.5 rounded-xl border bg-background flex items-center justify-between gap-2">
                              <div>
                                <div className="font-bold text-[11px]">Modo Teste</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {isTest ? "Restrito à Whitelist" : "Produção (Liberado)"}
                                </div>
                              </div>
                              <Switch
                                checked={isTest}
                                onCheckedChange={(val) => handleUpdateZapiChannel(meta.id, { testMode: val })}
                                className="data-[state=checked]:bg-blue-600 scale-90"
                              />
                            </div>

                            {/* Switch 3: Redirecionar p/ Whitelist no Teste */}
                            <div className="p-2.5 rounded-xl border bg-background flex items-center justify-between gap-2">
                              <div>
                                <div className="font-bold text-[11px]" title="Quando em Modo Teste, redireciona a mensagem para o 1º número da Whitelist com cabeçalho de auditoria em vez de enviar ao destinatário real.">
                                  Redirecionar Teste
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {isRedirect ? "Desvia p/ Whitelist" : "Bloqueia fora da lista"}
                                </div>
                              </div>
                              <Switch
                                checked={isRedirect}
                                onCheckedChange={(val) => handleUpdateZapiChannel(meta.id, { redirectToWhitelistOnTest: val })}
                                className="data-[state=checked]:bg-indigo-600 scale-90"
                              />
                            </div>
                          </div>

                          {/* Explicação Dinâmica do Comportamento Atual */}
                          <div className="p-2.5 rounded-xl bg-muted/50 border text-[11px] text-muted-foreground leading-relaxed">
                            {!isEnabled ? (
                              <span>⏸️ <strong>Canal Pausado:</strong> Nenhum disparo deste grupo será enviado pelo WhatsApp.</span>
                            ) : isTest ? (
                              isRedirect ? (
                                <span>🧪 <strong>Modo Teste com Redirecionamento Ativo:</strong> Disparos para números fora da Whitelist <strong>não vão para o destinatário real</strong>; são redirecionados para <strong>{whitelist[0] || "22998505276"}</strong> com o cabeçalho <code>[MODO TESTE • Canal: {meta.title}]</code>.</span>
                              ) : (
                                <span>🛡️ <strong>Modo Teste Estrito (Sandbox):</strong> Apenas os números cadastrados na Whitelist abaixo recebem mensagens deste canal. Os demais são bloqueados com segurança.</span>
                              )
                            ) : (
                              <span>🟢 <strong>Modo Produção Ativo:</strong> Todos os destinatários reais deste canal recebem mensagens normalmente (exceto números na Blacklist).</span>
                            )}
                          </div>

                          {/* Comunicações Mapeadas neste Canal */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              Comunicações Mapeadas neste Canal:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {meta.dispatches.map((d, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] font-medium py-0 px-2">
                                  {d}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {/* Whitelist & Blacklist Editor */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            {/* Whitelist */}
                            <div className="p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/30 dark:bg-blue-950/20 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-blue-900 dark:text-blue-200">
                                  ✅ Whitelist ({whitelist.length})
                                </span>
                                <span className="text-[9px] text-blue-700/80 dark:text-blue-300/80">Autorizados no Teste</span>
                              </div>
                              <div className="flex flex-wrap gap-1 min-h-[24px]">
                                {whitelist.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground italic">Nenhum número na Whitelist</span>
                                ) : (
                                  whitelist.map(phone => (
                                    <Badge
                                      key={phone}
                                      variant="outline"
                                      className="bg-white dark:bg-slate-900 border-blue-300 text-blue-900 dark:text-blue-200 text-[10px] font-mono gap-1 pr-1"
                                    >
                                      {phone}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveChannelPhone(meta.id, "whitelist", phone)}
                                        className="hover:text-rose-600 font-bold px-0.5 cursor-pointer"
                                        title="Remover da Whitelist"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Input
                                  value={inputState.whitelist}
                                  onChange={e => setChannelPhoneInputs(prev => ({
                                    ...prev,
                                    [meta.id]: { ...inputState, whitelist: e.target.value }
                                  }))}
                                  placeholder="Ex: 22998505276"
                                  className="h-7 text-[11px] font-mono bg-white dark:bg-slate-900"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => handleAddChannelPhone(meta.id, "whitelist")}
                                  className="h-7 px-2 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                                >
                                  + Adicionar
                                </Button>
                              </div>
                            </div>

                            {/* Blacklist */}
                            <div className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-rose-900 dark:text-rose-200">
                                  🚫 Blacklist ({blacklist.length})
                                </span>
                                <span className="text-[9px] text-rose-700/80 dark:text-rose-300/80">Sempre Bloqueados</span>
                              </div>
                              <div className="flex flex-wrap gap-1 min-h-[24px]">
                                {blacklist.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground italic">Nenhum número bloqueado</span>
                                ) : (
                                  blacklist.map(phone => (
                                    <Badge
                                      key={phone}
                                      variant="outline"
                                      className="bg-white dark:bg-slate-900 border-rose-300 text-rose-900 dark:text-rose-200 text-[10px] font-mono gap-1 pr-1"
                                    >
                                      {phone}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveChannelPhone(meta.id, "blacklist", phone)}
                                        className="hover:text-rose-600 font-bold px-0.5 cursor-pointer"
                                        title="Remover da Blacklist"
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Input
                                  value={inputState.blacklist}
                                  onChange={e => setChannelPhoneInputs(prev => ({
                                    ...prev,
                                    [meta.id]: { ...inputState, blacklist: e.target.value }
                                  }))}
                                  placeholder="Bloquear nº..."
                                  className="h-7 text-[11px] font-mono bg-white dark:bg-slate-900"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleAddChannelPhone(meta.id, "blacklist")}
                                  className="h-7 px-2 text-[10px] font-bold shrink-0"
                                >
                                  + Bloquear
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              ABA 0: HUB CENTRAL UNIFICADO DO AGENTE SOFIA (IA)
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="ai_hub" className="space-y-6">
            {/* Top Status & Overview Banner (4 Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                      <Bot className="w-4 h-4 text-blue-600" />
                      1. Motor IA Sofia
                    </span>
                    <Badge variant={aiConfig.enabled ? "default" : "secondary"} className={aiConfig.enabled ? "bg-emerald-600 text-white" : ""}>
                      {aiConfig.enabled ? "Ativo" : "Pausado"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {aiConfig.agentName || "Sofia"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Canal #2 • Independente da Régua
                  </p>
                </CardContent>
              </Card>

              <Card className="border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-950/20 shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      Modelo LLM Principal
                    </span>
                    <Badge variant="outline" className={geminiStatus.configured ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60" : "border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60"}>
                      {geminiStatus.configured ? "Google Gemini" : "Heurístico Local"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {aiConfig.preferredModel || geminiStatus.model || "gemini-2.5-pro"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Raciocínio avançado + Fallback automático
                  </p>
                </CardContent>
              </Card>

              <Card className="border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 shadow-xs">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      2. Ambiente da IA
                    </span>
                    <Badge variant={aiTestModeOnly ? "outline" : "default"} className={aiTestModeOnly ? "border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 font-bold" : "bg-emerald-600 text-white font-bold"}>
                      {aiTestModeOnly ? "Modo Teste (IA)" : "Produção (IA)"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {aiTestModeOnly ? "Apenas Whitelist da IA" : "Todos os Contatos"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" title={aiTestAllowedPhones}>
                    {aiTestModeOnly ? (aiTestAllowedPhones || "22998505276") : "Hóspedes e leads reais liberados"}
                  </p>
                </CardContent>
              </Card>

              {/* Card 4: Indicador Tri-modal de Status Operacional */}
              {(() => {
                const mode = getBotOperationalMode()
                const activeCount = Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length
                return (
                  <Card className="border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-emerald-600" />
                          Modo Operacional
                        </span>
                        <Badge variant="outline" className={`font-bold text-[10px] ${mode.badgeClass}`}>
                          {mode.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${mode.dotClass}`} />
                        <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {mode.label}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {mode.type === "autonomous"
                          ? `${activeCount} de 5 ações ativas no PMS`
                          : mode.type === "responder"
                          ? "FAQ puro • Sem acesso ao PMS"
                          : "Instância offline ou pausada"}
                      </p>
                    </CardContent>
                  </Card>
                )
              })()}
            </div>

            {/* ════════════════════════════════════════════════════════════════════
                SUB-NAVEGAÇÃO DO HUB SOFIA (Pills Compactas & Intuitivas)
            ════════════════════════════════════════════════════════════════════ */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 bg-slate-100/90 dark:bg-slate-900/90 rounded-2xl border shadow-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant={aiSubTab === "training" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAiSubTab("training")}
                  className={`text-xs font-bold rounded-xl gap-2 transition-all ${
                    aiSubTab === "training" 
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  📚 Base & Treinamento
                  {pendingDemandsCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 text-[9px] rounded-full bg-amber-500 text-white font-black">
                      {pendingDemandsCount}
                    </span>
                  )}
                </Button>

                <Button
                  type="button"
                  variant={aiSubTab === "behavior" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAiSubTab("behavior")}
                  className={`text-xs font-bold rounded-xl gap-2 transition-all ${
                    aiSubTab === "behavior" 
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  ⚙️ Comportamento, Modelo & Diretrizes
                  {developerGuidelines.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 text-[9px] rounded-full bg-purple-500 text-white font-black">
                      {developerGuidelines.length}
                    </span>
                  )}
                </Button>

                <Button
                  type="button"
                  variant={aiSubTab === "permissions" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAiSubTab("permissions")}
                  className={`text-xs font-bold rounded-xl gap-2 transition-all ${
                    aiSubTab === "permissions" 
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  🔑 Ações no Sistema (PMS)
                  <span className={`ml-0.5 px-1.5 py-0.2 text-[9px] rounded-full font-black ${
                    botActionsSettings.apiActionsEnabled ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                  }`}>
                    {botActionsSettings.apiActionsEnabled ? `${Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length}/${BOT_ACTIONS_METADATA.length}` : "OFF"}
                  </span>
                </Button>

                <Button
                  type="button"
                  variant={aiSubTab === "simulator" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAiSubTab("simulator")}
                  className={`text-xs font-bold rounded-xl gap-2 transition-all ${
                    aiSubTab === "simulator" 
                      ? "bg-violet-600 hover:bg-violet-700 text-white shadow-xs" 
                      : "text-slate-600 dark:text-slate-400 hover:text-foreground"
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  🧪 Simulador ao Vivo
                </Button>
              </div>

              <div className="hidden md:flex items-center gap-2 pr-2 text-[11px] text-muted-foreground font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Sofia IA • Atendimento Inteligente</span>
              </div>
            </div>

            {/* SUB-ABA 1: BASE DE CONHECIMENTO & TREINAMENTO (FAQ + DEMANDAS) */}
            {aiSubTab === "training" && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <FaqKnowledgeBase />

                <div className="pt-2">
                  <BotDemandsBacklog onNavigateToAiAgent={() => {
                    setActiveTab("ai_hub")
                    setAiSubTab("behavior")
                  }} />
                </div>
              </div>
            )}

            {/* SUB-ABA 3: MATRIZ DE AÇÕES & PERMISSÕES NO SISTEMA (PMS) */}
            {aiSubTab === "permissions" && (
              <div className="space-y-6 animate-in fade-in-50 duration-200">
                <Card className={`border-2 transition-all shadow-md rounded-2xl overflow-hidden ${
              botActionsSettings.apiActionsEnabled
                ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-background to-background dark:border-emerald-500/30"
                : "border-amber-500/40 bg-gradient-to-br from-amber-500/5 via-background to-background dark:border-amber-500/30"
            }`}>
              {/* Header do Card com Interruptor Mestre */}
              <CardHeader className="p-5 sm:p-6 border-b bg-card/60 backdrop-blur-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className={`p-2 rounded-xl ${
                        botActionsSettings.apiActionsEnabled 
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" 
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}>
                        <Zap className={`w-5 h-5 ${botActionsSettings.apiActionsEnabled ? "animate-pulse" : ""}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base sm:text-lg font-black tracking-tight">
                            Chave Mestra Global de Ações do Sistema
                          </CardTitle>
                          <Badge variant="outline" className={`font-bold text-[10px] uppercase tracking-wider ${
                            botActionsSettings.apiActionsEnabled
                              ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60"
                              : "border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60"
                          }`}>
                            {botActionsSettings.apiActionsEnabled ? "API Actions ON" : "API Actions OFF"}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground mt-0.5">
                          Controla se o Agente de IA (Sofia) pode acionar o Function Calling para executar reservas, orçamentos e PIX no sistema.
                        </CardDescription>
                      </div>
                    </div>
                  </div>

                  {/* Switch Mestre com Destaque Visual */}
                  <div className="flex items-center gap-3 self-end lg:self-center bg-background/80 dark:bg-slate-900/80 p-2.5 px-4 rounded-xl border shadow-xs">
                    <div className="text-right">
                      <Label htmlFor="master-api-actions-switch" className="text-xs font-black cursor-pointer block">
                        {botActionsSettings.apiActionsEnabled ? "Ações Autônomas Ativas" : "Modo Respondedor Puro"}
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        {botActionsSettings.apiActionsEnabled 
                          ? "Gemini com Function Calling habilitado" 
                          : "Bloqueia /api/bot-actions com 403"}
                      </span>
                    </div>
                    <Switch
                      id="master-api-actions-switch"
                      checked={botActionsSettings.apiActionsEnabled}
                      onCheckedChange={handleToggleMasterBotActions}
                      className="data-[state=checked]:bg-emerald-600 scale-110"
                    />
                  </div>
                </div>

                {/* Banner Explicativo do Modo Tri-modal Atual */}
                {(() => {
                  const mode = getBotOperationalMode()
                  return (
                    <div className={`mt-4 p-3 rounded-xl border flex items-start gap-3 transition-colors ${
                      mode.type === "autonomous"
                        ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-100"
                        : mode.type === "responder"
                        ? "bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-900 dark:text-amber-100"
                        : "bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50 text-rose-900 dark:text-rose-100"
                    }`}>
                      <div className={`p-1.5 rounded-lg shrink-0 ${mode.iconBg}`}>
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${mode.dotClass}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black">{mode.label}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${mode.badgeClass}`}>{mode.label}</Badge>
                        </div>
                        <p className="text-[11px] leading-relaxed opacity-90 mt-0.5">{mode.description}</p>
                      </div>
                    </div>
                  )
                })()}
              </CardHeader>

              {/* Corpo do Card: Matriz dos 5 Interruptores Granulares */}
              <CardContent className="p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-500" />
                      Matriz de Permissões Granulares ({BOT_ACTIONS_METADATA.length} Ações Executivas)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Ative ou silencie ações individuais de acordo com o nível de autonomia desejado.
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {Object.values(botActionsSettings.allowedActions || {}).filter(Boolean).length} de {BOT_ACTIONS_METADATA.length} Habilitadas
                  </Badge>
                </div>

                {/* Alerta de Chave Mestra Desativada */}
                {!botActionsSettings.apiActionsEnabled && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 flex items-center gap-2.5 text-amber-800 dark:text-amber-200 text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Chave Mestra Desativada:</strong> Os interruptores individuais abaixo estão suspensos. A Sofia não executará nenhuma ação até que o interruptor mestre seja religado.
                    </span>
                  </div>
                )}

                {/* Grid dos Cards Granulares */}
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 transition-opacity ${
                  !botActionsSettings.apiActionsEnabled ? "opacity-60 pointer-events-none" : ""
                }`}>
                  {BOT_ACTIONS_METADATA.map((action) => {
                    const isAllowed = botActionsSettings.allowedActions?.[action.key] !== false
                    return (
                      <div
                        key={action.key}
                        className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                          isAllowed
                            ? "bg-card border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-400"
                            : "bg-muted/40 border-dashed border-slate-300 dark:border-slate-800 opacity-75"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg text-xs font-bold ${
                                isAllowed ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-muted text-muted-foreground"
                              }`}>
                                {action.key === "checkAvailability" && <Calendar className="w-4 h-4" />}
                                {action.key === "calculateQuote" && <Sliders className="w-4 h-4" />}
                                {action.key === "generatePayment" && <QrCode className="w-4 h-4" />}
                                {action.key === "createPreReservation" && <Clock className="w-4 h-4" />}
                                {action.key === "commitReservation" && <CheckCheck className="w-4 h-4" />}
                                {action.key === "reallocateReservationFlat" && <ArrowLeftRight className="w-4 h-4" />}
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-foreground leading-snug">{action.title}</h5>
                                <span className="text-[10px] font-mono text-muted-foreground">{action.endpoint}</span>
                              </div>
                            </div>
                            <Switch
                              id={`action-toggle-${action.key}`}
                              checked={isAllowed}
                              disabled={!botActionsSettings.apiActionsEnabled}
                              onCheckedChange={(checked) => handleToggleGranularAction(action.key, checked)}
                              className="data-[state=checked]:bg-blue-600 scale-90"
                            />
                          </div>

                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {action.description}
                          </p>
                        </div>

                        <div className="pt-3 mt-2 border-t flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-muted-foreground">{action.badgeText}</span>
                          <Badge variant={isAllowed ? "default" : "secondary"} className={`text-[9px] px-1.5 py-0 ${
                            isAllowed ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            {isAllowed ? "Autorizado" : "Pausado (403)"}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Parâmetros Avançados (Hold & Mensagem de Transbordo) */}
                <div className="pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedActions(!showAdvancedActions)}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    {showAdvancedActions ? "Ocultar Parâmetros Avançados de Retenção & Transbordo" : "Configurar Tempo de Hold e Mensagem de Transbordo..."}
                  </button>

                  {showAdvancedActions && (
                    <div className="mt-3 p-4 rounded-xl bg-muted/40 border space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="pre-reservation-hold" className="text-xs font-semibold">
                            Tempo de Hold da Pré-Reserva (minutos)
                          </Label>
                          <Input
                            id="pre-reservation-hold"
                            type="number"
                            min="5"
                            max="120"
                            value={botActionsSettings.preReservationHoldMinutes || 30}
                            onChange={(e) => setBotActionsSettings(prev => ({ ...prev, preReservationHoldMinutes: Number(e.target.value) || 30 }))}
                            className="h-9 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Tempo de bloqueio provisório no PMS até expiração se o PIX não for liquidado.
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="handover-message-input" className="text-xs font-semibold">
                            Mensagem Padrão de Transbordo (Ação Pausada)
                          </Label>
                          <Input
                            id="handover-message-input"
                            value={botActionsSettings.handoverMessage || ""}
                            onChange={(e) => setBotActionsSettings(prev => ({ ...prev, handoverMessage: e.target.value }))}
                            placeholder="Ex: Esta ação do sistema está pausada ou requer atendimento humano."
                            className="h-9 text-xs"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Resposta cordial orientada pela Sofia caso o hóspede solicite uma ação desativada.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveBotActionsParams}
                          disabled={savingBotActions}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1.5"
                        >
                          {savingBotActions ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Salvar Parâmetros Avançados
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* SUB-ABA 2: COMPORTAMENTO, MODELO LLM & DIRETRIZES WHATSAPP BUSINESS AI */}
        {aiSubTab === "behavior" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div className="space-y-6">
              <Card className="border shadow-xs">
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base font-bold flex items-center gap-2">
                          <Bot className="w-4 h-4 text-blue-600" />
                          Modo de Atuação, Motor LLM & Controle de Canal da IA
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Configure os 2 interruptores independentes da Sofia (Canal #2) e escolha o modelo Gemini de raciocínio.
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2 bg-blue-50/80 dark:bg-blue-950/40 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800">
                        <Label htmlFor="ai-master-toggle" className="text-xs font-black text-blue-900 dark:text-blue-200 cursor-pointer">
                          Botão 1 • Motor IA Sofia: {aiConfig.enabled ? "ATIVADO" : "PAUSADO"}
                        </Label>
                        <Switch
                          id="ai-master-toggle"
                          checked={aiConfig.enabled}
                          onCheckedChange={checked => setAiConfig((prev: any) => ({ ...prev, enabled: checked }))}
                        />
                      </div>
                    </div>

                    {/* Banner Explicativo da Independência dos 2 Botões da IA */}
                    <div className="mt-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-950 dark:text-indigo-200 leading-relaxed">
                      💡 <strong>Como funcionam os 2 botões da IA Sofia (Canal #2 Independente):</strong>
                      <ul className="list-disc pl-4 mt-1 space-y-0.5">
                        <li><strong>Botão 1 (Motor IA Sofia):</strong> Liga ou pausa exclusivamente as respostas conversacionais da Sofia.</li>
                        <li><strong>Botão 2 (Modo de Teste da IA):</strong> Controla se a Sofia responde apenas à Whitelist da IA (<code>{aiTestAllowedPhones || "22998505276"}</code>) ou a todos os hóspedes em Produção — <strong>100% independente</strong> do Modo Teste da <em>📅 Régua de Envios de Hóspedes</em> e das <em>🧹 Camareiras</em>.</li>
                      </ul>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-2">
                    {/* Seletor de Modelo de IA (R3: Upgrade para Gemini 2.5 Pro / Gemini 4 Argon) */}
                    <div className="p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-black text-purple-950 dark:text-purple-200 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-purple-600" />
                          Motor de Inteligência Artificial (Modelo Principal Gemini)
                        </Label>
                        <Badge variant="outline" className="text-[10px] font-bold border-purple-400 text-purple-800 dark:text-purple-200">
                          Fallback Automático Ativo
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {[
                          {
                            id: "gemini-2.5-pro",
                            title: "Gemini 2.5 Pro",
                            badge: "Recomendado • Padrão",
                            desc: "Máxima inteligência contextual, interpretação de reservas e zero alucinação."
                          },
                          {
                            id: "gemini-4-argon",
                            title: "Gemini 4 Argon",
                            badge: "Experimental • Ultra",
                            desc: "Raciocínio de última geração com fallback transparente para Gemini 2.5 Pro."
                          },
                          {
                            id: "gemini-2.5-flash",
                            title: "Gemini 2.5 Flash",
                            badge: "Rápido • Econômico",
                            desc: "Respostas de baixa latência para triagem rápida."
                          }
                        ].map(m => {
                          const selected = (aiConfig.preferredModel || "gemini-2.5-pro") === m.id
                          return (
                            <div
                              key={m.id}
                              onClick={() => setAiConfig((prev: any) => ({ ...prev, preferredModel: m.id }))}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                selected
                                  ? "border-purple-600 bg-purple-100/70 dark:bg-purple-950/60 ring-1 ring-purple-600 shadow-xs"
                                  : "border-slate-200 dark:border-slate-800 bg-background hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-xs font-black text-foreground">{m.title}</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-purple-400 text-purple-700 dark:text-purple-300">
                                  {m.badge}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-snug">{m.desc}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Modo de Operação */}
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Modo de Operação</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div
                          onClick={() => setAiConfig((prev: any) => ({ ...prev, mode: "autonomous" }))}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            aiConfig.mode === "autonomous"
                              ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-blue-500 shadow-xs"
                              : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Autônomo</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-400 text-blue-700 dark:text-blue-300">Recomendado</Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Responde sozinho e pausa se o atendente intervir ou o hóspede pedir.
                          </p>
                        </div>

                        <div
                          onClick={() => setAiConfig((prev: any) => ({ ...prev, mode: "copilot" }))}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            aiConfig.mode === "copilot"
                              ? "border-purple-500 bg-purple-50/60 dark:bg-purple-950/40 ring-1 ring-purple-500 shadow-xs"
                              : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Copiloto</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Nunca envia mensagens sozinho. Gera sugestões com 1 clique no chat para aprovação.
                          </p>
                        </div>

                        <div
                          onClick={() => setAiConfig((prev: any) => ({ ...prev, mode: "off_hours" }))}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            aiConfig.mode === "off_hours"
                              ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 ring-1 ring-amber-500 shadow-xs"
                              : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Fora do Expediente</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Autônomo à noite e finais de semana; atua como copiloto durante o dia.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Delay & Botão 2: Modo de Teste Independente da IA */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="response-delay" className="text-xs font-semibold">
                          Delay de Resposta Humanizado (segundos)
                        </Label>
                        <Input
                          id="response-delay"
                          type="number"
                          min="1"
                          max="15"
                          value={aiConfig.responseDelaySeconds || 3}
                          onChange={e => setAiConfig((prev: any) => ({ ...prev, responseDelaySeconds: Number(e.target.value) || 3 }))}
                          className="h-9 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">Simula digitação natural para evitar respostas mecânicas.</p>
                      </div>

                      <div className="space-y-1.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="test-mode-toggle" className="text-xs font-black text-amber-950 dark:text-amber-200">
                            Botão 2 • Modo de Teste da IA (Whitelist Canal #2)
                          </Label>
                          <Switch
                            id="test-mode-toggle"
                            checked={aiTestModeOnly}
                            onCheckedChange={setAiTestModeOnly}
                          />
                        </div>
                        <Input
                          placeholder="Ex: 22998505276"
                          value={aiTestAllowedPhones}
                          onChange={e => setAiTestAllowedPhones(e.target.value)}
                          className="h-8 text-xs font-mono bg-white dark:bg-slate-900"
                          disabled={!aiTestModeOnly}
                        />
                        <p className="text-[10px] text-amber-900/80 dark:text-amber-300/80">
                          {aiTestModeOnly
                            ? "🧪 Ativo: Sofia responde apenas aos números acima (não afeta Camareiras nem Régua)."
                            : "🟢 Desligado: Sofia em Modo Produção respondendo a todos os hóspedes."}
                        </p>
                      </div>
                    </div>

                    {/* Identidade do Agente */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Nome do Agente</Label>
                        <Input
                          value={aiConfig.agentName || ""}
                          onChange={e => setAiConfig((prev: any) => ({ ...prev, agentName: e.target.value }))}
                          placeholder="Ex: Sofia"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Cargo / Papel</Label>
                        <Input
                          value={aiConfig.agentRole || ""}
                          onChange={e => setAiConfig((prev: any) => ({ ...prev, agentRole: e.target.value }))}
                          placeholder="Ex: Concierge Virtual CorpFlats"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    {/* Prompt do Sistema */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                          Instruções do Sistema (Prompt Base da Sofia)
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAiConfig((prev: any) => ({ ...prev, systemPrompt: "Você é a Sofia, concierge virtual inteligente e acolhedora dos flats de alto padrão da CorpFlats em Campos dos Goytacazes/RJ.\nSeu objetivo é encantar os hóspedes, responder dúvidas com precisão e fornecer assistência ágil e atenciosa.\n\nDIRETRIZES DE ATENDIMENTO:\n1. Responda em português brasileiro de forma acolhedora, prestativa e concisa.\n2. Use emojis amigáveis com moderação (🏨, ✨, 🔑, ☕, 🚗, 🕒, 📍).\n3. Seja sempre fidedigna às informações oficiais. NUNCA invente números de apartamentos ou códigos.\n4. Se o hóspede pedir humano, transfira amigavelmente para a recepção." }))}
                          className="h-6 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Restaurar Padrão
                        </Button>
                      </div>
                      <Textarea
                        rows={6}
                        value={aiConfig.systemPrompt || ""}
                        onChange={e => setAiConfig((prev: any) => ({ ...prev, systemPrompt: e.target.value }))}
                        className="text-xs font-mono leading-relaxed"
                        placeholder="Instruções para o modelo sobre tom, regras e como agir..."
                      />
                    </div>

                    {/* Botão de Salvar Configurações do Agente */}
                    <div className="pt-2">
                      <Button
                        type="button"
                        onClick={handleSaveAiConfig}
                        disabled={savingAiConfig}
                        className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2"
                      >
                        {savingAiConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Salvar Configurações do Agente & Modelo
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Card: Central de Diretrizes Estilo WhatsApp Business AI (4 Categorias + CRUD Completo) */}
                <Card className="border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/30 dark:from-slate-900 dark:to-purple-950/20 shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base font-black flex items-center gap-2 text-purple-950 dark:text-purple-200">
                            <Sparkles className="w-4 h-4 text-purple-600" />
                            Central de Diretrizes da IA (Estilo WhatsApp Business AI)
                          </CardTitle>
                          <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-950 border-purple-200 text-[10px] font-bold">
                            {developerGuidelines.filter((g: any) => g.enabled !== false && g.active !== false).length} Ativas de {developerGuidelines.length}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs text-purple-900/70 dark:text-purple-300/70">
                          Gerencie o que a Sofia <strong>SEMPRE deve fazer</strong>, <strong>NUNCA deve fazer</strong>, <strong>Tom & Tratamento (ex: Sr. / Sra.)</strong> e <strong>Fatos Operacionais</strong>. Você pode criar, editar, pausar ou excluir qualquer regra a qualquer momento.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleQuickAddFormalVocative}
                          disabled={savingGuideline}
                          className="h-8 text-xs font-bold border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100 gap-1.5 cursor-pointer"
                          title="Adiciona ou ativa a diretriz para chamar hóspedes pelo nome precedido de Sr. ou Sra."
                        >
                          🎩 + Regra "Sr. / Sra."
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenAddGuidelineModal("always_do")}
                          className="h-8 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Nova Diretriz
                        </Button>
                      </div>
                    </div>

                    {/* Filtros por Categoria Estilo WhatsApp Business AI */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-3">
                      {[
                        { id: "all", label: `Todas (${developerGuidelines.length})` },
                        { id: "always_do", label: "✅ O que SEMPRE fazer" },
                        { id: "never_do", label: "🚫 O que NUNCA fazer" },
                        { id: "persona_treatment", label: "🎩 Tom & Tratamento (Sr./Sra.)" },
                        { id: "factual", label: "📌 Fatos & Regras" }
                      ].map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setGuidelineFilterCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                            guidelineFilterCategory === cat.id
                              ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                              : "bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300"
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-1">
                    {loadingGuidelines ? (
                      <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Carregando diretrizes da IA...
                      </div>
                    ) : developerGuidelines.length === 0 ? (
                      <div className="p-4 text-center rounded-xl border border-dashed border-purple-200 dark:border-purple-800 text-xs text-muted-foreground space-y-1">
                        <p className="font-semibold text-purple-800 dark:text-purple-300">Nenhuma diretriz cadastrada</p>
                        <p className="text-[11px]">
                          Clique em <strong>+ Nova Diretriz</strong> ou em <strong>🎩 + Regra "Sr. / Sra."</strong> acima para orientar o comportamento da Sofia.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {developerGuidelines
                          .filter((g: any) => {
                            if (guidelineFilterCategory === "all") return true
                            const normCat = g.category === "tone" ? "persona_treatment" : (g.category || "factual")
                            return normCat === guidelineFilterCategory
                          })
                          .map((guide: any, idx: number) => {
                            const guideId = guide.id || String(idx)
                            const ruleText = guide.rule || guide.text || ""
                            const isGuideActive = guide.enabled !== false && guide.active !== false
                            const normCat = guide.category === "tone" ? "persona_treatment" : (guide.category || "factual")
                            const catBadge =
                              normCat === "always_do"
                                ? { label: "✅ Sempre Fazer", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
                                : normCat === "never_do"
                                ? { label: "🚫 Nunca Fazer", cls: "bg-rose-100 text-rose-800 border-rose-200" }
                                : normCat === "persona_treatment"
                                ? { label: "🎩 Tom & Tratamento", cls: "bg-amber-100 text-amber-900 border-amber-200" }
                                : { label: "📌 Fato / Regra", cls: "bg-blue-100 text-blue-800 border-blue-200" }

                            const sourceLabel =
                              guide.source === "whatsapp_developer"
                                ? "📱 WhatsApp Dev"
                                : (guide.source === "web_chat_operator" || guide.source === "web_chat_rectification")
                                ? "🖥️ Chat Web"
                                : "⚙️ Painel Admin"

                            return (
                              <div
                                key={guideId}
                                className={`p-3 rounded-xl border flex items-start justify-between gap-3 shadow-2xs transition-all ${
                                  isGuideActive
                                    ? "bg-white/95 dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-700/80 hover:border-purple-400"
                                    : "bg-slate-100/60 dark:bg-slate-900/40 border-dashed border-slate-300 opacity-65"
                                }`}
                              >
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Badge className={`${catBadge.cls} text-[9px] font-bold`}>
                                      {catBadge.label}
                                    </Badge>
                                    <Badge variant="outline" className="text-[9px] text-slate-500">
                                      {sourceLabel}
                                    </Badge>
                                    {!isGuideActive && (
                                      <Badge variant="secondary" className="text-[9px]">
                                        Pausada
                                      </Badge>
                                    )}
                                    {guide.createdAt && (
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(guide.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed">
                                    {ruleText}
                                  </p>
                                  {guide.sample && (
                                    <p className="text-[11px] text-slate-500 italic">
                                      Amostra: "{guide.sample}"
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Switch
                                    checked={isGuideActive}
                                    onCheckedChange={(val) => handleToggleGuidelineActive(guide, val)}
                                    className="scale-75 data-[state=checked]:bg-emerald-600"
                                    title={isGuideActive ? "Pausar Diretriz" : "Ativar Diretriz"}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEditGuidelineModal(guide)}
                                    className="h-7 w-7 p-0 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 cursor-pointer"
                                    title="Editar Diretriz"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleTestGuidelineInSimulator(guide)}
                                    className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 cursor-pointer"
                                    title="Testar no Simulador"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteGuideline(guideId)}
                                    className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"
                                    title="Excluir Diretriz"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

        {/* SUB-ABA 4: SIMULADOR AO VIVO */}
        {aiSubTab === "simulator" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <Card className="border border-blue-200 dark:border-blue-900/60 shadow-xs max-w-4xl mx-auto">
              <CardHeader className="bg-gradient-to-tr from-blue-50/80 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 border-b pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-blue-900 dark:text-blue-100">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Simulador do Agente de IA
                </CardTitle>
                <CardDescription className="text-xs text-blue-700/80 dark:text-blue-300/80">
                  Teste perguntas e veja em tempo real como o agente responderá aos hóspedes antes de ativar em produção.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Botões Rápidos de Perguntas Típicas */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-500">Perguntas Rápidas de Teste:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Qual a senha do wifi?",
                      "Meu quarto já está pronto?",
                      "Quero falar com uma pessoa",
                      "Tem café da manhã?",
                      "Qual o horário de check-out?",
                      "Qual o endereço?",
                      "Tem vaga de garagem?"
                    ].map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSimMessage(q)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Telefone de Teste (simular contexto de reserva)</Label>
                    <Input
                      value={simPhone}
                      onChange={e => setSimPhone(e.target.value)}
                      placeholder="Ex: 22998505276 (ou deixe outro número para testar lead)"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Mensagem do Hóspede</Label>
                    <Input
                      value={simMessage}
                      onChange={e => setSimMessage(e.target.value)}
                      placeholder="Digite o que o hóspede falaria no WhatsApp..."
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleSimulateAi}
                  disabled={simulatingAi || !simMessage.trim()}
                  className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2"
                >
                  {simulatingAi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Testar Resposta da IA
                </Button>

                {/* Exibição do Resultado da Simulação */}
                {simResult && (
                  <div className="space-y-3 pt-3 border-t mt-3">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                        <Bot className="w-3.5 h-3.5" />
                        Resposta Gerada pela Sofia:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {simResult.shouldHandover && (
                          <Badge variant="destructive" className="text-[10px] py-0">
                            🚨 Transbordo Detectado
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] py-0">
                          {simResult.source === "gemini" ? `Gemini (${simResult.modelUsed})` : "Heurístico Local"}
                        </Badge>
                      </div>
                    </div>

                    {/* Balão estilo WhatsApp */}
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-slate-800 dark:text-slate-100 text-xs leading-relaxed whitespace-pre-wrap shadow-2xs font-sans">
                      {simResult.replyText}
                    </div>

                    {/* Detalhes do Contexto Detectado */}
                    {simResult.guestContext && (
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border text-[11px] space-y-1.5">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block">Contexto Identificado pelo Sistema:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-muted-foreground">
                          <div>Hóspede: <strong className="text-foreground">{simResult.guestContext.guestName || "Lead / Sem Reserva"}</strong></div>
                          <div>Status: <strong className="text-foreground">{simResult.guestContext.stayStatus}</strong></div>
                          {simResult.guestContext.flatNumber && (
                            <div>Flat: <strong className="text-foreground">{simResult.guestContext.flatNumber}</strong></div>
                          )}
                          {simResult.guestContext.cleaningStatus && (
                            <div>Limpeza: <strong className="text-foreground">{simResult.guestContext.cleaningStatus}</strong></div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </TabsContent>

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
                const isCardModified = savedTemplateMessages[tpl.id] !== undefined && savedTemplateMessages[tpl.id] !== tpl.message
                const messageLineCount = Math.max(8, (tpl.message || "").split("\n").length + 1)

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
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] font-bold py-0.5 px-1.5 ${
                              tpl.recipientTarget === "both"
                                ? "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300"
                                : tpl.recipientTarget === "requester"
                                ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300"
                                : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300"
                            }`}
                          >
                            {tpl.recipientTarget === "both" ? "✨ Ambos" : tpl.recipientTarget === "requester" ? "👥 Solicitante" : "👤 Hóspede"}
                          </Badge>
                          {tpl.recipientTarget !== "requester" && defaultIncludeCompanions(tpl) && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold py-0.5 px-1.5 bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300"
                              title="Também enviado ao 2º/3º hóspede da reserva"
                            >
                              👥 +Acomp.
                            </Badge>
                          )}
                          {tpl.sendEmail !== false && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold py-0.5 px-1.5 bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300"
                              title="Também enviado por e-mail"
                            >
                              ✉️ E-mail
                            </Badge>
                          )}
                          {(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && Boolean(tpl.documentUrl))) && (
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
                      <CardDescription className="text-xs leading-relaxed">
                        {tpl.description || "Gatilho de notificação automática via WhatsApp."}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label
                            htmlFor={`tpl-msg-${tpl.id}`}
                            className="text-[11px] font-bold text-foreground flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3 text-emerald-600" />
                            Mensagem do WhatsApp (Clique para editar):
                          </Label>
                          {isCardModified && (
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1.5 bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 font-bold"
                            >
                              Alterado • Não salvo
                            </Badge>
                          )}
                        </div>
                        <Textarea
                          id={`tpl-msg-${tpl.id}`}
                          value={tpl.message}
                          onChange={(e) => handleInlineTemplateMessageChange(tpl.id, e.target.value)}
                          rows={messageLineCount}
                          placeholder="Digite o texto da mensagem..."
                          className="w-full p-3 rounded-xl bg-muted/40 focus:bg-background text-xs text-foreground font-mono leading-relaxed border border-border focus-visible:ring-2 focus-visible:ring-emerald-500 resize-y whitespace-pre-wrap"
                        />
                        {isCardModified && (
                          <div className="flex items-center justify-end gap-1.5 pt-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRevertCardTemplate(tpl.id)}
                            >
                              Descartar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={savingCardId === tpl.id}
                              className="h-7 text-[11px] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-xs"
                              onClick={() => handleSaveCardTemplate(tpl)}
                            >
                              {savingCardId === tpl.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Salvar Mensagem
                            </Button>
                          </div>
                        )}
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
                      {(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && Boolean(tpl.documentUrl))) && (
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
                          {tpl.channels && tpl.channels.length > 0 ? (
                            tpl.channels.map((c) => (
                              <Badge key={c} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                {c}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">Todos os canais</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t flex items-center justify-between gap-1.5 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] px-2 gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            selectTemplateForEditing(tpl)
                            setActiveTab("editor")
                            setTimeout(() => {
                              if (editorRef.current) {
                                editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
                              } else {
                                window.scrollTo({ top: 0, behavior: "smooth" })
                              }
                            }, 60)
                          }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Editar Mensagem & Botões
                        </Button>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant={isCardModified ? "default" : "outline"}
                            size="sm"
                            disabled={savingCardId === tpl.id}
                            className={`h-7 text-[11px] px-2.5 gap-1 ${
                              isCardModified
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                                : "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                            }`}
                            onClick={() => handleSaveCardTemplate(tpl)}
                          >
                            {savingCardId === tpl.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Salvar
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] px-2"
                            onClick={() => {
                              selectTemplateForEditing(tpl)
                              setTestMessage(renderPreviewText(tpl.message))
                              setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                              setTestIncludeDocument(Boolean(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && tpl.documentUrl)))
                              setTestModalOpen(true)
                            }}
                          >
                            <Send className="w-3 h-3 text-emerald-600 mr-1" />
                            Testar
                          </Button>
                        </div>
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
            <div ref={editorRef} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
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

                    {/* DESTINATÁRIO DA MENSAGEM: HÓSPEDE, SOLICITANTE OU AMBOS */}
                    <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                            Destinatário da Mensagem (Para quem enviar?)
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Escolha se o WhatsApp deve ser disparado para o hóspede, para o solicitante da reserva ou para ambos.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingRecipientTarget("guest")}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                            editingRecipientTarget === "guest"
                              ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200 shadow-xs ring-1 ring-emerald-500/20"
                              : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                            editingRecipientTarget === "guest" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            👤
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-foreground">Só o Hóspede</div>
                            <div className="text-[10px] text-muted-foreground leading-tight truncate">Quem fica no flat</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingRecipientTarget("requester")}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                            editingRecipientTarget === "requester"
                              ? "border-sky-500 bg-sky-50/80 dark:bg-sky-950/40 text-sky-950 dark:text-sky-200 shadow-xs ring-1 ring-sky-500/20"
                              : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                            editingRecipientTarget === "requester" ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            👥
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-foreground">Só o Solicitante</div>
                            <div className="text-[10px] text-muted-foreground leading-tight truncate">Empresa ou secretária</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingRecipientTarget("both")}
                          className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                            editingRecipientTarget === "both"
                              ? "border-purple-500 bg-purple-50/80 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 shadow-xs ring-1 ring-purple-500/20"
                              : "border-border bg-card hover:bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                            editingRecipientTarget === "both" ? "bg-purple-600 text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            ✨
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-foreground">Ambos (Hóspede + Solicitante)</div>
                            <div className="text-[10px] text-muted-foreground leading-tight truncate">Dispara para os 2 contatos</div>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* ACOMPANHANTES (2º/3º HÓSPEDE) E ESPELHO POR E-MAIL */}
                    <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                            🧑‍🤝‍🧑 Incluir acompanhantes (2º/3º hóspede)
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            {editingRecipientTarget === "requester"
                              ? "Indisponível quando a mensagem vai só para o solicitante."
                              : "Os hóspedes adicionais cadastrados na reserva (com WhatsApp e/ou e-mail) também recebem esta mensagem, com o nome e link de check-in de cada um."}
                          </p>
                        </div>
                        <Switch
                          checked={editingRecipientTarget !== "requester" && editingIncludeCompanions}
                          disabled={editingRecipientTarget === "requester"}
                          onCheckedChange={(v) => setEditingIncludeCompanions(Boolean(v))}
                        />
                      </div>

                      <div className="border-t border-slate-200 dark:border-slate-800" />

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                            ✉️ Também enviar por e-mail
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Envia o mesmo texto por e-mail para cada destinatário que tenha e-mail cadastrado (botões viram links). Obedece ao "Motor de e-mails automáticos" das configurações de e-mail.
                          </p>
                        </div>
                        <Switch
                          checked={editingSendEmail}
                          onCheckedChange={(v) => setEditingSendEmail(Boolean(v))}
                        />
                      </div>

                      {editingSendEmail && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-muted-foreground">
                            Assunto do e-mail (opcional — aceita as mesmas tags, ex.: {"{{numero_reserva}}"})
                          </label>
                          <Input
                            value={editingEmailSubject}
                            onChange={(e) => setEditingEmailSubject(e.target.value)}
                            placeholder="Padrão: CorpFlats • <tipo da mensagem> • Reserva <código>"
                            className="h-8 text-xs"
                          />
                        </div>
                      )}
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
                        rows={Math.max(12, (editingMessage || "").split("\n").length + 2)}
                        value={editingMessage}
                        onChange={(e) => {
                          setEditingMessage(e.target.value)
                          if (selectedTemplateId) {
                            setTemplates(prev => prev.map(t => t.id === selectedTemplateId ? { ...t, message: e.target.value } : t))
                          }
                        }}
                        placeholder="Digite sua mensagem aqui e clique nas tags acima..."
                        className="text-xs leading-relaxed font-sans font-medium resize-y min-h-[240px]"
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
                      <div className="bg-[#EFEAE2] dark:bg-[#0B141A] min-h-[380px] p-3 rounded-b-2xl flex flex-col space-y-2 text-neutral-800 dark:text-neutral-200 font-sans">
                        
                        {/* Data Pill */}
                        <div className="text-center my-1 mt-auto">
                          <span className="bg-white/80 dark:bg-neutral-800/80 text-[10px] font-semibold text-neutral-600 dark:text-neutral-400 px-2 py-0.5 rounded-md shadow-2xs">
                            HOJE
                          </span>
                        </div>

                        {/* Balão de Mensagem Estilo WhatsApp */}
                        <div className="relative self-end max-w-[92%] bg-[#D9FDD3] dark:bg-[#005C4B] rounded-2xl rounded-tr-xs shadow-xs p-2.5 pb-1 text-xs border border-emerald-300/30">
                          
                          {/* Card de Pré-Visualização de Link (Link Preview WhatsApp) */}
                          {/writereview\?placeid=|link_avaliacao_google|g\.page\/r\//i.test(editingMessage || "") && (
                            <div className="mb-2 rounded-xl overflow-hidden bg-black/5 dark:bg-white/10 border border-emerald-500/20">
                              <img
                                src={config.reviewPreviewImage || "/flat-preview.jpg"}
                                alt="CorpFlats Preview"
                                className="w-full h-28 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/flat-preview.jpg" }}
                              />
                              <div className="p-2 space-y-0.5">
                                <p className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                                  {config.reviewPreviewTitle || "⭐ Avaliar CorpFlats • Soho Residence (5 Estrelas)"}
                                </p>
                                <p className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2">
                                  {config.reviewPreviewDescription || "Toque aqui para avaliar no Google"}
                                </p>
                                <p className="text-[9px] text-neutral-500 dark:text-neutral-400 truncate pt-0.5">
                                  search.google.com
                                </p>
                              </div>
                            </div>
                          )}
                          {!/writereview\?placeid=|link_avaliacao_google|g\.page\/r\//i.test(editingMessage || "") && /link_cafe_manha|\/cafe\//i.test(editingMessage || "") && (
                            <div className="mb-2 rounded-xl overflow-hidden bg-black/5 dark:bg-white/10 border border-emerald-500/20">
                              <img
                                src={config.breakfastPreviewImage || "/breakfast-preview.jpg"}
                                alt="Café da Manhã Preview"
                                className="w-full h-28 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/breakfast-preview.jpg" }}
                              />
                              <div className="p-2 space-y-0.5">
                                <p className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                                  ☕ Café da Manhã no Flat • CorpFlats
                                </p>
                                <p className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2">
                                  Escolha seus itens favoritos e o horário de entrega na porta do seu flat!
                                </p>
                                <p className="text-[9px] text-neutral-500 dark:text-neutral-400 truncate pt-0.5">
                                  corpflats.com.br
                                </p>
                              </div>
                            </div>
                          )}
                          {!/writereview\?placeid=|link_avaliacao_google|g\.page\/r\/|link_cafe_manha|\/cafe\//i.test(editingMessage || "") && /link_precheckin|link_portal_reserva|link_checkout|\/pre-checkin\/|\/minha-reserva\/|\/checkout\//i.test(editingMessage || "") && (
                            <div className="mb-2 rounded-xl overflow-hidden bg-black/5 dark:bg-white/10 border border-emerald-500/20">
                              <img
                                src={config.flatPreviewImage || "/flat-preview.jpg"}
                                alt="Flat Preview"
                                className="w-full h-28 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = "/flat-preview.jpg" }}
                              />
                              <div className="p-2 space-y-0.5">
                                <p className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100 leading-snug">
                                  🏨 Portal da Reserva • CorpFlats Soho Residence
                                </p>
                                <p className="text-[10px] text-neutral-600 dark:text-neutral-300 leading-tight line-clamp-2">
                                  Acesse as informações do seu flat, Wi-Fi, senhas e serviços exclusivos.
                                </p>
                                <p className="text-[9px] text-neutral-500 dark:text-neutral-400 truncate pt-0.5">
                                  corpflats.com.br
                                </p>
                              </div>
                            </div>
                          )}

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

                      {/* Painel Rápido para Trocar Fotos e Textos de Pré-Visualização dos Links */}
                      <div className="mt-4 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                            <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                            Fotos & Frase de Pré-Visualização (Link Preview)
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {/* Avaliação Google */}
                          <div className="p-2 rounded-xl border bg-background space-y-1.5 text-center">
                            <span className="text-[10px] font-bold block truncate">⭐ Avaliação</span>
                            <img
                              src={config.reviewPreviewImage || "/flat-preview.jpg"}
                              alt="Avaliação"
                              className="w-full h-14 object-cover rounded-lg border"
                              onError={(e) => { (e.target as HTMLImageElement).src = "/flat-preview.jpg" }}
                            />
                            <label className="cursor-pointer block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleUploadPreviewImage("review", f)
                                  e.target.value = ""
                                }}
                              />
                              <span className="w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 px-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                <Upload className="w-2.5 h-2.5" />
                                {uploadingPreviewSlot === "review" ? "..." : "Trocar"}
                              </span>
                            </label>
                          </div>

                          {/* Café da Manhã */}
                          <div className="p-2 rounded-xl border bg-background space-y-1.5 text-center">
                            <span className="text-[10px] font-bold block truncate">☕ Café</span>
                            <img
                              src={config.breakfastPreviewImage || "/breakfast-preview.jpg"}
                              alt="Café"
                              className="w-full h-14 object-cover rounded-lg border"
                              onError={(e) => { (e.target as HTMLImageElement).src = "/breakfast-preview.jpg" }}
                            />
                            <label className="cursor-pointer block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleUploadPreviewImage("breakfast", f)
                                  e.target.value = ""
                                }}
                              />
                              <span className="w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 px-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                <Upload className="w-2.5 h-2.5" />
                                {uploadingPreviewSlot === "breakfast" ? "..." : "Trocar"}
                              </span>
                            </label>
                          </div>

                          {/* Flat / Check-in */}
                          <div className="p-2 rounded-xl border bg-background space-y-1.5 text-center">
                            <span className="text-[10px] font-bold block truncate">🏨 Flat / Links</span>
                            <img
                              src={config.flatPreviewImage || "/flat-preview.jpg"}
                              alt="Flat"
                              className="w-full h-14 object-cover rounded-lg border"
                              onError={(e) => { (e.target as HTMLImageElement).src = "/flat-preview.jpg" }}
                            />
                            <label className="cursor-pointer block">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) handleUploadPreviewImage("flat", f)
                                  e.target.value = ""
                                }}
                              />
                              <span className="w-full inline-flex items-center justify-center gap-1 text-[10px] font-semibold py-1 px-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                <Upload className="w-2.5 h-2.5" />
                                {uploadingPreviewSlot === "flat" ? "..." : "Trocar"}
                              </span>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-semibold">Título do Card (Avaliação Google):</Label>
                            <Input
                              value={config.reviewPreviewTitle || ""}
                              onChange={(e) => setConfig({ ...config, reviewPreviewTitle: e.target.value })}
                              placeholder="⭐ Avaliar CorpFlats • Soho Residence (5 Estrelas)"
                              className="text-[11px] h-7.5 rounded-lg bg-background"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-semibold">Frase abaixo do título (Avaliação Google):</Label>
                            <Input
                              value={config.reviewPreviewDescription || ""}
                              onChange={(e) => setConfig({ ...config, reviewPreviewDescription: e.target.value })}
                              placeholder="Toque aqui para avaliar no Google"
                              className="text-[11px] h-7.5 rounded-lg bg-background"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSavePreviewConfig}
                            disabled={savingPreviewTexts}
                            className="w-full h-7.5 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {savingPreviewTexts ? "Salvando..." : "Salvar Textos do Card"}
                          </Button>
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              </div>

            </div>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════════
              FALLBACK RETROATIVO: BASE & DEMANDAS ANTIGAS
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="faq" className="space-y-6">
            <FaqKnowledgeBase />
          </TabsContent>

          <TabsContent value="demands_backlog" className="space-y-6">
            <BotDemandsBacklog onNavigateToAiAgent={() => {
              setActiveTab("ai_hub")
              setAiSubTab("behavior")
            }} />
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
                              <Badge 
                                variant="outline" 
                                className={`text-[9.5px] font-bold py-0 px-1.5 ${
                                  qm.recipientTarget === "both"
                                    ? "bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300"
                                    : qm.recipientTarget === "requester"
                                    ? "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300"
                                    : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/50 dark:text-slate-300"
                                }`}
                              >
                                {qm.recipientTarget === "both" ? "✨ Ambos" : qm.recipientTarget === "requester" ? "👥 Solicitante" : "👤 Hóspede"}
                              </Badge>
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

                        {/* Editor Direto de Mensagem Rápida (Sem corte de texto) */}
                        {(() => {
                          const draftVal = qmInlineDrafts[qm.id] !== undefined ? qmInlineDrafts[qm.id] : qm.message
                          const isQmModified = qmInlineDrafts[qm.id] !== undefined && qmInlineDrafts[qm.id] !== qm.message
                          return (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                                  <Edit3 className="w-3 h-3 text-emerald-600" />
                                  Mensagem Rápida (Editável Direto no Card):
                                </span>
                                {isQmModified && (
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setQmInlineDrafts(prev => {
                                          const next = { ...prev }
                                          delete next[qm.id]
                                          return next
                                        })
                                      }}
                                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                    >
                                      Descartar
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={async () => {
                                        await saveQuickMessage({ ...qm, message: draftVal })
                                        setQmInlineDrafts(prev => {
                                          const next = { ...prev }
                                          delete next[qm.id]
                                          return next
                                        })
                                        toast({
                                          title: "Mensagem rápida salva!",
                                          description: `O texto de "${qm.title}" foi atualizado.`
                                        })
                                      }}
                                      className="h-6 px-2.5 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-2xs"
                                    >
                                      <Check className="w-3 h-3" />
                                      Salvar Mensagem
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <Textarea
                                value={draftVal}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setQmInlineDrafts(prev => ({ ...prev, [qm.id]: val }))
                                }}
                                rows={Math.max(8, (draftVal || "").split("\n").length + 1)}
                                className={`w-full rounded-2xl text-xs font-mono leading-relaxed resize-y min-h-[160px] transition-colors ${
                                  isQmModified
                                    ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-600 text-foreground ring-1 ring-emerald-500/30"
                                    : "bg-[#E7FFDB]/70 dark:bg-[#005C4B]/30 border-emerald-200 dark:border-emerald-800/80 text-neutral-900 dark:text-neutral-100 focus:bg-background"
                                }`}
                                placeholder="Digite o texto da mensagem rápida..."
                              />

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
                          )
                        })()}
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
                              <div className="text-[11px] leading-relaxed text-slate-200 font-normal whitespace-pre-wrap max-h-48 overflow-y-auto pr-1">
                                {renderPreviewText(qmInlineDrafts[qm.id] !== undefined ? qmInlineDrafts[qm.id] : qm.message)}
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
                              const currentMsg = qmInlineDrafts[qm.id] !== undefined ? qmInlineDrafts[qm.id] : qm.message
                              setTestMessage(renderPreviewText(currentMsg))
                              setTestSendMode((config.deliveryMode || "text_links") === "buttons" ? "buttons" : "text")
                              setTestModalOpen(true)
                            }}
                          >
                            <Send className="w-3 h-3 text-emerald-600" />
                            Testar Disparo
                          </Button>

                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-7 text-[11px] gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            onClick={async () => {
                              const draftVal = qmInlineDrafts[qm.id] !== undefined ? qmInlineDrafts[qm.id] : qm.message
                              await saveQuickMessage({ ...qm, message: draftVal })
                              setQmInlineDrafts(prev => {
                                const next = { ...prev }
                                delete next[qm.id]
                                return next
                              })
                              toast({
                                title: "Mensagem rápida salva!",
                                description: `O texto de "${qm.title}" foi atualizado.`
                              })
                            }}
                          >
                            <Check className="w-3 h-3" />
                            Salvar
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-[11px] gap-1 rounded-xl"
                            onClick={() => handleOpenEditQm({
                              ...qm,
                              message: qmInlineDrafts[qm.id] !== undefined ? qmInlineDrafts[qm.id] : qm.message
                            })}
                          >
                            <Edit3 className="w-3 h-3 text-sky-600" />
                            Opções
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
                      onClick={handlePurgeRealGuests}
                      disabled={purgingRealGuests}
                      className="text-xs h-8 gap-1 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300 hover:bg-blue-50"
                      title="Cancela todos os disparos agendados para hóspedes reais, mantendo apenas seu telefone de teste."
                    >
                      {purgingRealGuests ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
                      Limpar Hóspedes Reais
                    </Button>
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

                              {/* Destinatário (Hóspede, Acompanhante ou Solicitante) */}
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                                item.recipientType === "requester"
                                  ? "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200"
                                  : item.recipientType && item.recipientType.startsWith("guest_")
                                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200"
                                    : "bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200"
                              }`}>
                                {item.recipientType === "requester"
                                  ? `👥 Solicitante: ${item.recipientName || item.guestName}`
                                  : item.recipientType && item.recipientType.startsWith("guest_")
                                    ? `🧑‍🤝‍🧑 ${recipientTypeLabel(item.recipientType)}: ${item.recipientName || item.guestName}`
                                    : `👤 Hóspede: ${item.guestName}`}
                              </span>

                              {item.guestEmail && (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200"
                                  title={item.guestEmail}
                                >
                                  ✉️ E-mail{item.emailStatus ? ` (${item.emailStatus === "sent" ? "enviado" : item.emailStatus === "skipped" ? "não enviado" : item.emailStatus})` : ""}
                                </span>
                              )}

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
                          <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{hist.message}</p>
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
                    className="text-[10px] h-6 px-2 py-0 border-blue-300 text-blue-700 bg-blue-50/50 hover:bg-blue-100"
                    onClick={() => setTestPhone("22998505276")}
                  >
                    Meu WhatsApp (22 99850-5276)
                  </Button>
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
                  rows={Math.max(8, (testMessage || "").split("\n").length + 1)}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="text-xs leading-relaxed font-mono text-[11px] resize-y"
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

              {/* Destinatário da Mensagem Rápida */}
              <div className="space-y-1.5 p-3 rounded-2xl border bg-slate-50/80 dark:bg-slate-900/50">
                <Label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  Destinatário (Para quem enviar ao clicar no atalho?)
                </Label>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setQmRecipientTarget("guest")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-0.5 ${
                      qmRecipientTarget === "guest"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 shadow-xs"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>👤 Só o Hóspede</span>
                    <span className="text-[9.5px] font-normal text-muted-foreground">Quem fica no flat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQmRecipientTarget("requester")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-0.5 ${
                      qmRecipientTarget === "requester"
                        ? "border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200 shadow-xs"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>👥 Só o Solicitante</span>
                    <span className="text-[9.5px] font-normal text-muted-foreground">Empresa/Secretária</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQmRecipientTarget("both")}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-0.5 ${
                      qmRecipientTarget === "both"
                        ? "border-purple-500 bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-200 shadow-xs"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>✨ Ambos (Os 2)</span>
                    <span className="text-[9.5px] font-normal text-muted-foreground">Hóspede + Solicitante</span>
                  </button>
                </div>
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
                    { tag: "{{nome_hospede}}", label: "Nome Hóspede" },
                    { tag: "{{nome_solicitante}}", label: "Nome Solicitante" },
                    { tag: "{{empresa_solicitante}}", label: "Empresa" },
                    { tag: "{{quarto}}", label: "Flat / Quarto" },
                    { tag: "{{numero_reserva}}", label: "Cód. Reserva" },
                    { tag: "{{data_checkin}}", label: "Entrada" },
                    { tag: "{{data_checkout}}", label: "Saída" },
                    { tag: "{{status_cafe}}", label: "Café da Manhã" },
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
                  rows={Math.max(10, (qmMessage || "").split("\n").length + 2)}
                  value={qmMessage}
                  onChange={(e) => setQmMessage(e.target.value)}
                  className="text-xs font-mono leading-relaxed rounded-xl resize-y min-h-[180px]"
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

        {/* MODAL: NOVA / EDITAR DIRETRIZ ESTILO WHATSAPP BUSINESS AI */}
        <Dialog open={addGuidelineModalOpen} onOpenChange={setAddGuidelineModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-black text-purple-950 dark:text-purple-200">
                <Sparkles className="w-5 h-5 text-purple-600" />
                {editingGuidelineId ? "Editar Diretriz da Sofia" : "Nova Diretriz para a Sofia (WhatsApp Business AI)"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Escolha a categoria estruturada e defina como a Sofia deve agir, tratar o hóspede ou qual regra operacional deve seguir.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {/* 4 Categorias Estruturadas */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Categoria da Diretriz:</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: "always_do",
                      icon: "✅",
                      label: "O que SEMPRE deve fazer",
                      activeCls: "bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-emerald-200"
                    },
                    {
                      id: "never_do",
                      icon: "🚫",
                      label: "O que NUNCA deve fazer",
                      activeCls: "bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-950/50 dark:border-rose-500 dark:text-rose-200"
                    },
                    {
                      id: "persona_treatment",
                      icon: "🎩",
                      label: "Tom & Tratamento (Sr. / Sra.)",
                      activeCls: "bg-amber-50 border-amber-500 text-amber-900 dark:bg-amber-950/50 dark:border-amber-500 dark:text-amber-200"
                    },
                    {
                      id: "factual",
                      icon: "📌",
                      label: "Fato / Regra de Negócio",
                      activeCls: "bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-950/50 dark:border-blue-500 dark:text-blue-200"
                    }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewGuidelineCategory(cat.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer text-left ${
                        newGuidelineCategory === cat.id
                          ? `${cat.activeCls} shadow-2xs ring-1 ring-current`
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Texto da Regra */}
              <div className="space-y-1">
                <Label className="text-xs font-bold">Instrução / Regra para a IA:</Label>
                <Textarea
                  rows={3}
                  value={newGuidelineRule}
                  onChange={e => setNewGuidelineRule(e.target.value)}
                  placeholder={
                    newGuidelineCategory === "always_do"
                      ? "Ex: Sempre perguntar a quantidade de hóspedes e o período desejado ao fazer uma cotação."
                      : newGuidelineCategory === "never_do"
                      ? "Ex: Nunca oferecer serviço de carregador de malas ou buffet presencial de café."
                      : newGuidelineCategory === "persona_treatment"
                      ? "Ex: Sempre chamar os hóspedes pelo nome precedido de Sr. ou Sra. (ex: Sr. Miller, Sra. Ana)."
                      : "Ex: O flat 905 possui cafeteira Nespresso e vista panorâmica."
                  }
                  className="text-xs"
                />
              </div>

              {/* Amostra / Pergunta de Teste */}
              <div className="space-y-1">
                <Label className="text-xs font-bold">Pergunta de Teste / Exemplo para o Simulador (Opcional):</Label>
                <Input
                  value={newGuidelineSample}
                  onChange={e => setNewGuidelineSample(e.target.value)}
                  placeholder="Ex: Olá, qual o horário de check-in?"
                  className="text-xs h-8 rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground">
                  Permite testar o comportamento desta regra com 1 clique no Simulador.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddGuidelineModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveNewGuideline}
                disabled={savingGuideline || !newGuidelineRule.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold gap-1 shadow-xs cursor-pointer"
              >
                {savingGuideline ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {editingGuidelineId ? "Salvar Alterações" : "Criar Diretriz"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Shell>
  )
}
