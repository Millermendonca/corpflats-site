import { useState, useEffect, useRef } from "react"
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
  RotateCcw
} from "lucide-react"
import { AccessDenied } from "@/components/access-denied"

interface ButtonAction {
  id: string
  type: "URL" | "CALL" | "REPLY"
  label: string
  url?: string
  phone?: string
}

interface WhatsAppTemplate {
  id: string
  triggerEvent: string
  title: string
  description?: string
  enabled: boolean
  triggerTiming: "immediate" | "before_event" | "after_event" | "fixed_time_day_of" | "fixed_time_day_before"
  offsetValue: number
  offsetUnit: "minutes" | "hours" | "days"
  fixedTime?: string
  message: string
  footer?: string
  buttons?: ButtonAction[]
}

interface QueueItem {
  id: string
  reservationId: number
  reservationCode: string
  guestName: string
  guestPhone: string
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
  fallbackToText: boolean
  wifiNetwork: string
  wifiPassword: string
  googleReviewUrl: string
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
    category: "🏢 Propriedade & Wi-Fi",
    tags: [
      { tag: "{{nome_hotel}}", label: "Nome Hotel", example: "CorpFlats" },
      { tag: "{{endereco_hotel}}", label: "Endereço", example: "Rua Conselheiro Otaviano, 209" },
      { tag: "{{link_maps}}", label: "Link GPS Google", example: "https://maps.google.com/..." },
      { tag: "{{wifi_rede}}", label: "Nome Wi-Fi", example: "CorpFlats-Hospedes" },
      { tag: "{{wifi_senha}}", label: "Senha Wi-Fi", example: "corpflats2026" },
      { tag: "{{telefone_hotel}}", label: "WhatsApp Hotel", example: "5522997124021" },
    ]
  },
  {
    category: "🔗 Links Inteligentes (Personalizados)",
    tags: [
      { tag: "{{link_checkin_digital}}", label: "📝 Ficha Check-in Online", example: "https://.../pre-checkin/RES-..." },
      { tag: "{{link_portal_hospede}}", label: "🏨 Portal do Hóspede", example: "https://.../portal-hospede/RES-..." },
      { tag: "{{link_cafe_manha}}", label: "🥐 Link do Café da Manhã", example: "https://.../cafe/RES-..." },
      { tag: "{{link_checkout}}", label: "🚪 Check-out Expresso", example: "https://.../checkout?code=..." },
      { tag: "{{link_avaliacao_google}}", label: "⭐ Avaliação Google Maps", example: "https://g.page/r/.../review" },
    ]
  }
]

export default function WhatsappAutomation() {
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
  const [editingEnabled, setEditingEnabled] = useState<boolean>(true)

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
    fallbackToText: true,
    wifiNetwork: "CorpFlats-Hospedes",
    wifiPassword: "corpflats2026",
    googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
  })
  const [statusInfo, setStatusInfo] = useState<any>(null)
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false)
  const [savingConfig, setSavingConfig] = useState<boolean>(false)

  // State: QR Code Modal
  const [qrModalOpen, setQrModalOpen] = useState<boolean>(false)
  const [qrImageData, setQrImageData] = useState<string | null>(null)
  const [loadingQr, setLoadingQr] = useState<boolean>(false)

  // State: Quick Test Modal
  const [testModalOpen, setTestModalOpen] = useState<boolean>(false)
  const [testPhone, setTestPhone] = useState<string>("")
  const [testMessage, setTestMessage] = useState<string>("")
  const [testReservationId, setTestReservationId] = useState<string>("")
  const [testIncludeButtons, setTestIncludeButtons] = useState<boolean>(true)
  const [sendingTest, setSendingTest] = useState<boolean>(false)

  // State: Reservations list for preview & testing
  const [reservations, setReservations] = useState<any[]>([])
  const [selectedPreviewResCode, setSelectedPreviewResCode] = useState<string>("sample")

  // State: View Message Dialog
  const [previewModalOpen, setPreviewModalOpen] = useState<boolean>(false)
  const [previewModalItem, setPreviewModalItem] = useState<QueueItem | null>(null)

  // Initial Data Fetching
  useEffect(() => {
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
    setEditingEnabled(tpl.enabled !== false)
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
      enabled: editingEnabled
    }

    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTemplate)
      })

      if (res.ok) {
        toast({ title: "Template salvo com sucesso!", description: "As alterações da mensagem e botões já estão ativas." })
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

  // Save Z-API Config
  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      const res = await fetch("/api/whatsapp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      })
      if (res.ok) {
        toast({ title: "Configurações salvas com sucesso!", description: "Credenciais e dados atualizados." })
        checkStatus(true)
      } else {
        toast({ title: "Erro ao salvar", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Erro de rede", description: err.message, variant: "destructive" })
    } finally {
      setSavingConfig(false)
    }
  }

  // Open QR Code Modal
  const handleShowQrCode = async () => {
    setLoadingQr(true)
    setQrModalOpen(true)
    try {
      const res = await fetch("/api/whatsapp/qr-code")
      if (res.ok) {
        const data = await res.json()
        setQrImageData(data.qrImage || null)
      } else {
        toast({ title: "Não foi possível carregar o QR Code", variant: "destructive" })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingQr(false)
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
        reservationId: testReservationId || null
      }

      if (testIncludeButtons && editingButtons.length > 0) {
        payload.buttons = editingButtons
      }

      const res = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (res.ok && data.success) {
        toast({
          title: "✓ Teste enviado com sucesso!",
          description: data.simulated 
            ? "Simulado: Configure suas credenciais da Z-API para envio real ao aparelho."
            : `Entregue via Z-API (${data.method === "buttons" ? "Com Botões" : "Texto"}). Verifique seu celular!`
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
      "{{valor_total}}": (Number(targetRes.totalAmount) || 450).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      "{{status_pagamento}}": targetRes.paymentStatus === "pago" ? "Confirmado / Pago" : "Pendente",
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
      "{{link_checkout}}": `https://corpflats.onrender.com/checkout?code=${code}`,
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
    return <AccessDenied message="Apenas a administração tem acesso à automação de WhatsApp." />
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
                  Automação WhatsApp & Gatilhos (Z-API)
                  <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-xs">
                    Botões Interativos Ativos
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
              onClick={() => setActiveTab("settings")}
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
              onClick={() => {
                setTestMessage(editingMessage)
                setTestModalOpen(true)
              }}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              Disparo de Teste
            </Button>

            <Button 
              variant="default" 
              size="sm" 
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs rounded-xl shadow-xs"
              onClick={() => setActiveTab("rules")}
            >
              <Sliders className="w-3.5 h-3.5" />
              Ver Réguas
            </Button>
          </div>
        </div>

        {/* Tabs Principais */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full md:w-auto rounded-xl p-1 bg-muted/60">
            <TabsTrigger value="rules" className="rounded-lg text-xs font-bold gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Régua de Gatilhos
            </TabsTrigger>
            <TabsTrigger value="editor" className="rounded-lg text-xs font-bold gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-blue-500" />
              Editor & Botões
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
            <TabsTrigger value="settings" className="rounded-lg text-xs font-bold gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-neutral-500" />
              Conexão Z-API
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
                        <Badge 
                          variant="secondary" 
                          className="text-[11px] font-bold py-0.5 px-2 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200"
                        >
                          {timingLabel}
                        </Badge>
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

                      <div className="pt-2 flex items-center justify-between border-t border-border/50">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs font-semibold gap-1 text-primary hover:text-primary hover:bg-primary/10 p-0 h-auto"
                          onClick={() => {
                            selectTemplateForEditing(tpl)
                            setActiveTab("editor")
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
                            setTestMessage(tpl.message)
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold">Personalizar Mensagem & Gatilho</CardTitle>
                        <CardDescription className="text-xs">Selecione qual momento da jornada você deseja configurar.</CardDescription>
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
                            setTestMessage(editingMessage)
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

                      </div>

                    </div>
                  </CardContent>
                </Card>
              </div>

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
                                <Badge className="bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 text-[10px]">
                                  Cancelado
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

          {/* ════════════════════════════════════════════════════════════════════
              ABA 5: CONFIGURAÇÕES DA Z-API & CONEXÃO
          ════════════════════════════════════════════════════════════════════ */}
          <TabsContent value="settings" className="space-y-4">
            <Card className="rounded-2xl border shadow-xs">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Key className="w-4 h-4 text-emerald-600" />
                      Credenciais da Z-API
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Obtenha em seu painel no site da Z-API (developer.z-api.io) para habilitar envio real.
                    </CardDescription>
                  </div>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => checkStatus(true)} 
                    disabled={loadingStatus}
                    className="text-xs h-8 gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                    Testar Conexão
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Switch de ativação geral */}
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/40">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground">Habilitar Motor de Envio WhatsApp</span>
                    <p className="text-[11px] text-muted-foreground">Ative para permitir o envio em tempo real aos hóspedes.</p>
                  </div>
                  <Switch 
                    checked={config.enabled}
                    onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Instance ID (ID da Instância)</Label>
                    <Input 
                      placeholder="Ex: 3B4C5D6E7F8G9H0"
                      value={config.instanceId}
                      onChange={(e) => setConfig({ ...config, instanceId: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Token da Instância</Label>
                    <Input 
                      type="password"
                      placeholder="Ex: 8A7B6C5D4E3F2G1"
                      value={config.token}
                      onChange={(e) => setConfig({ ...config, token: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Client-Token (Token de Segurança da Conta Z-API)</Label>
                    <Input 
                      type="password"
                      placeholder="Opcional se não ativado no painel Z-API"
                      value={config.clientToken}
                      onChange={(e) => setConfig({ ...config, clientToken: e.target.value })}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 flex flex-col justify-center">
                    <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20">
                      <div>
                        <span className="text-xs font-semibold block">Fallback Automático para Texto</span>
                        <span className="text-[10px] text-muted-foreground">Se os botões falharem no aparelho, envia links no corpo.</span>
                      </div>
                      <Switch 
                        checked={config.fallbackToText}
                        onCheckedChange={(c) => setConfig({ ...config, fallbackToText: c })}
                      />
                    </div>
                  </div>
                </div>

                {/* Parâmetros da Propriedade para preenchimento de tags */}
                <div className="p-4 rounded-xl border bg-muted/20 space-y-3 pt-4">
                  <span className="text-xs font-bold text-foreground block">
                    Informações Fixas do Hotel (Puxadas automaticamente pelas tags):
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Nome da Rede Wi-Fi</Label>
                      <Input 
                        value={config.wifiNetwork}
                        onChange={(e) => setConfig({ ...config, wifiNetwork: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Senha do Wi-Fi</Label>
                      <Input 
                        value={config.wifiPassword}
                        onChange={(e) => setConfig({ ...config, wifiPassword: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Link de Avaliação Google Maps</Label>
                      <Input 
                        value={config.googleReviewUrl}
                        onChange={(e) => setConfig({ ...config, googleReviewUrl: e.target.value })}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleShowQrCode}
                    className="text-xs gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    Ler QR Code da Z-API
                  </Button>

                  <Button 
                    onClick={handleSaveConfig}
                    disabled={savingConfig}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {savingConfig ? "Salvando..." : "Salvar Configurações"}
                  </Button>
                </div>
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
                Receba a mensagem com botões interativos diretamente no seu smartphone.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Seu WhatsApp de Destino (com DDD)</Label>
                <Input 
                  placeholder="Ex: 22997124021"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="text-xs"
                />
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
                  rows={6}
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="text-xs leading-relaxed"
                />
              </div>

              {editingButtons.length > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/40">
                  <span className="text-xs font-semibold">Incluir os {editingButtons.length} Botões Interativos</span>
                  <Switch 
                    checked={testIncludeButtons}
                    onCheckedChange={setTestIncludeButtons}
                  />
                </div>
              )}
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
            MODAL DE QR CODE
        ════════════════════════════════════════════════════════════════════ */}
        <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
          <DialogContent className="max-w-sm rounded-2xl text-center">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Escanear QR Code Z-API</DialogTitle>
              <DialogDescription className="text-xs">
                Abra o WhatsApp no celular &gt; Aparelhos conectados &gt; Conectar aparelho.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 flex flex-col items-center justify-center">
              {loadingQr ? (
                <div className="py-8 text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs">Gerando QR Code na Z-API...</span>
                </div>
              ) : qrImageData ? (
                <div className="p-3 bg-white rounded-2xl shadow-md border inline-block">
                  <img src={qrImageData} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                </div>
              ) : (
                <div className="py-8 text-muted-foreground text-xs space-y-2">
                  <p>Não foi possível obter a imagem do QR Code.</p>
                  <p className="text-[11px]">Certifique-se de que a Instância e o Token estão corretos.</p>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-center">
              <Button variant="outline" size="sm" onClick={() => setQrModalOpen(false)}>
                Fechar
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

      </div>
    </Shell>
  )
}
