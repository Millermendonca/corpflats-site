import { useState, useEffect, useCallback } from "react"
import { format, parseISO, differenceInDays } from "date-fns"
import { useToast } from "@/hooks/use-toast"

export interface ButtonAction {
  id: string
  type: "URL" | "CALL" | "REPLY"
  label: string
  url?: string
  phone?: string
}

export interface WhatsAppQuickMessage {
  id: string
  title: string
  shortLabel: string
  icon: string
  description?: string
  category?: string
  enabled: boolean
  message: string
  footer?: string
  buttons?: ButtonAction[]
}

export const DEFAULT_QUICK_MESSAGES: WhatsAppQuickMessage[] = [
  {
    id: "qm_payment_pending",
    title: "Cobrança / Link Pagamento",
    shortLabel: "Cobrança",
    icon: "💳",
    description: "Link para pagamento via PIX ou Cartão de Crédito.",
    category: "Financeiro",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! ⏳
Sua pré-reserva no *{{nome_hotel}}* (*Flat {{quarto}}*) está aguardando pagamento para confirmação definitiva.

📋 *Resumo:*
• Código: *{{numero_reserva}}*
• Período: *{{data_checkin}} a {{data_checkout}}*
• Valor: *{{valor_total}}*

Para garantir sua acomodação via PIX ou Cartão em até 12x, acesse o link seguro:
{{link_portal_hospede}}`,
    footer: "CorpFlats • Pagamento Seguro",
    buttons: [
      { id: "btn_pagar", type: "URL", label: "💳 Pagar e Confirmar", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "qm_summary_checkin",
    title: "Enviar Resumo + Check-in",
    shortLabel: "Check-in",
    icon: "📝",
    description: "Resumo da estadia e link para Pré-Check-in Digital.",
    category: "Recepção",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! 🌟
Aqui está o resumo da sua estadia confirmada no *{{nome_hotel}}*:

🏨 *Flat {{quarto}}*
📅 Entrada: *{{data_checkin}}* a partir das *{{horario_checkin}}*
📅 Saída: *{{data_checkout}}* até às *{{horario_checkout}}*
👥 Hóspedes: *{{num_hospedes}}*

Para agilizar sua entrada na portaria sem filas, preencha o *Pré-Check-in Digital*:
{{link_checkin_digital}}`,
    footer: "CorpFlats • Soho Residence",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "qm_breakfast",
    title: "Link do Café",
    shortLabel: "Link do Café",
    icon: "🥐",
    description: "Cardápio e montagem da bandeja de café no quarto.",
    category: "Serviços",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! ☕🥐
Para agendar o café da manhã no *Flat {{quarto}}*, você pode montar a sua bandeja diretamente pelo link abaixo:

{{link_cafe_manha}}

Escolha seus itens favoritos e o horário desejado!`,
    footer: "CorpFlats • Café Artesanal",
    buttons: [
      { id: "btn_cafe", type: "URL", label: "🥐 Montar Café da Manhã", url: "{{link_cafe_manha}}" }
    ]
  },
  {
    id: "qm_access_wifi",
    title: "Acesso & Wi-Fi",
    shortLabel: "Acesso & Wi-Fi",
    icon: "📍",
    description: "Instruções de portaria, localização e senha da rede Wi-Fi.",
    category: "Recepção",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! 🔑📶
Seguem as instruções de chegada e acesso ao *{{nome_hotel}}*:

📍 *Endereço:* {{endereco_hotel}}
🗺️ *Localização no Maps:* {{link_maps}}
🚪 *Portaria:* 24 horas (basta se identificar com seu nome e Flat {{quarto}})

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

Desejamos uma ótima estadia! Se precisar de algo, estamos à disposição.`,
    footer: "CorpFlats • Hospedagem Inteligente",
    buttons: [
      { id: "btn_maps", type: "URL", label: "📍 Ver no Google Maps", url: "{{link_maps}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Central do Hóspede", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "qm_checkout_reminder",
    title: "Lembrete Check-out",
    shortLabel: "Check-out",
    icon: "🚪",
    description: "Instruções e lembrete do horário limite de saída.",
    category: "Saída",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! ☀️
Lembramos que o check-out do *Flat {{quarto}}* é hoje até às *{{horario_checkout}}*.

Ao sair, por favor desligue luzes e ar-condicionado e entregue o cartão na portaria.
Agradecemos muito por sua hospedagem no *{{nome_hotel}}*! Tenha uma excelente viagem de retorno!`,
    footer: "CorpFlats • Agradecemos sua preferência",
    buttons: [
      { id: "btn_out", type: "URL", label: "🚪 Check-out Expresso", url: "{{link_checkout}}" }
    ]
  },
  {
    id: "qm_review_request",
    title: "Avaliação Google",
    shortLabel: "Avaliação",
    icon: "⭐",
    description: "Pedido de avaliação 5 estrelas no Google Maps.",
    category: "Pós-Estadia",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! ⭐
Esperamos que sua experiência no *{{nome_hotel}}* tenha sido fantástica!

Poderia nos dedicar 30 segundos deixando sua avaliação 5 estrelas no Google?
{{link_avaliacao_google}}

Muito obrigado e até a próxima!`,
    footer: "CorpFlats • Sua opinião vale muito",
    buttons: [
      { id: "btn_rev", type: "URL", label: "⭐ Avaliar no Google", url: "{{link_avaliacao_google}}" }
    ]
  }
]

const STORAGE_KEY = "gfm_whatsapp_quick_messages_v1"

function formatDateSafe(val: any, pattern = "dd/MM/yyyy") {
  if (!val) return ""
  try {
    if (typeof val === "string" && val.includes("T")) {
      return format(parseISO(val), pattern)
    }
    if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return format(parseISO(val), pattern)
    }
    const d = new Date(val)
    if (!isNaN(d.getTime())) return format(d, pattern)
  } catch {}
  return String(val)
}

export function renderQuickMessage(templateText: string, resItem: any, appOrigin?: string): string {
  if (!templateText) return ""
  if (!resItem) return templateText

  const origin = appOrigin || (typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com")

  const guestName = resItem.guestName || resItem.guests?.[0]?.name || "Hóspede"
  const firstName = (guestName || "Hóspede").trim().split(" ")[0]
  const phone = resItem.guestPhone || resItem.guests?.[0]?.phone || ""
  const flatNumber = String(resItem.flatNumber || resItem.flat?.number || "Flat")
  const resCode = String(resItem.code || resItem.reservationCode || `RES-${flatNumber}-${resItem.id || "001"}`)

  const checkinBr = formatDateSafe(resItem.checkinDate, "dd/MM/yyyy")
  const checkoutBr = formatDateSafe(resItem.checkoutDate, "dd/MM/yyyy")
  const checkinTime = resItem.checkinTime || "14:00"
  const checkoutTime = resItem.checkoutTime || "12:00"

  let totalNights = 1
  try {
    if (resItem.checkinDate && resItem.checkoutDate) {
      const d1 = parseISO(String(resItem.checkinDate).substring(0, 10))
      const d2 = parseISO(String(resItem.checkoutDate).substring(0, 10))
      const diff = differenceInDays(d2, d1)
      if (diff > 0) totalNights = diff
    }
  } catch {}

  const guestCount = resItem.guestCount || resItem.adults || (resItem.guests?.length || 1)
  const totalAmount = Number(resItem.totalAmount || resItem.amount || 0)
  const formattedTotal = totalAmount > 0 
    ? totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00"

  const chanLower = String(resItem.channel || "").toLowerCase()
  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb")
  const isPaid = isOta || resItem.paymentStatus === "pago" || resItem.paymentStatus === "pago_total" || (Number(resItem.paidAmount) >= totalAmount && totalAmount > 0)
  const paymentStatus = isPaid ? "Confirmado / Pago" : "Aguardando Pagamento"

  const linkPortal = `${origin}/minha-reserva/${resCode}`
  const linkCheckin = `${origin}/pre-checkin/${resCode}`
  const linkCafe = `${origin}/minha-reserva/${resCode}/cafe`
  const linkCheckout = `${origin}/checkout?code=${resCode}`
  const linkMaps = "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
  const linkAvaliacao = "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"

  const tagMap: Record<string, string> = {
    "{{nome_hospede}}": guestName,
    "{{primeiro_nome}}": firstName,
    "{{telefone_hospede}}": phone,
    "{{numero_reserva}}": resCode,
    "{{quarto}}": flatNumber,
    "{{data_checkin}}": checkinBr,
    "{{data_checkout}}": checkoutBr,
    "{{horario_checkin}}": checkinTime,
    "{{horario_checkout}}": checkoutTime,
    "{{num_hospedes}}": String(guestCount),
    "{{num_diarias}}": String(totalNights),
    "{{valor_total}}": formattedTotal,
    "{{status_pagamento}}": paymentStatus,
    "{{canal_reserva}}": resItem.channel || "Site CorpFlats",
    "{{nome_hotel}}": "CorpFlats",
    "{{endereco_hotel}}": "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    "{{link_maps}}": linkMaps,
    "{{wifi_rede}}": "CorpFlats-Hospedes",
    "{{wifi_senha}}": "corpflats2026",
    "{{telefone_hotel}}": "5522997124021",
    "{{link_checkin_digital}}": linkCheckin,
    "{{link_portal_hospede}}": linkPortal,
    "{{link_pagamento}}": linkPortal,
    "{{link_cafe_manha}}": linkCafe,
    "{{link_checkout}}": linkCheckout,
    "{{link_avaliacao_google}}": linkAvaliacao
  }

  let text = templateText
  for (const [tag, val] of Object.entries(tagMap)) {
    text = text.split(tag).join(val)
  }
  return text
}

export function buildFullWhatsAppTextMessage(
  renderedBody: string, 
  footer?: string, 
  buttons?: ButtonAction[], 
  resItem?: any, 
  originUrl?: string
): string {
  let full = renderedBody.trim()

  if (buttons && buttons.length > 0) {
    const linkItems = buttons
      .filter(b => b.url || b.phone)
      .map(b => {
        const resolvedUrl = b.url ? renderQuickMessage(b.url, resItem, originUrl) : ""
        const resolvedPhone = b.phone ? renderQuickMessage(b.phone, resItem, originUrl) : ""
        if (resolvedUrl) return `👉 *${b.label}:* ${resolvedUrl}`
        if (resolvedPhone) return `📞 *${b.label}:* tel:+${resolvedPhone.replace(/\D/g, "")}`
        return ""
      })
      .filter(Boolean)

    if (linkItems.length > 0) {
      full += "\n\n" + linkItems.join("\n")
    }
  }

  if (footer) {
    full += `\n\n_${footer.trim()}_`
  }

  return full
}

export function useQuickMessages() {
  const { toast } = useToast()
  const [quickMessages, setQuickMessages] = useState<WhatsAppQuickMessage[]>(() => {
    try {
      const local = localStorage.getItem(STORAGE_KEY)
      if (local) {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return DEFAULT_QUICK_MESSAGES
  })
  const [loading, setLoading] = useState(false)

  const fetchQuickMessages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/quick-messages")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setQuickMessages(data)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
          } catch {}
          return
        }
      }
    } catch (e) {
      console.warn("Falha ao buscar quick messages da API, usando cache local:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuickMessages()
  }, [fetchQuickMessages])

  const toggleQuickMessage = async (id: string, enabled: boolean) => {
    const updated = quickMessages.map(m => m.id === id ? { ...m, enabled } : m)
    setQuickMessages(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}

    const target = updated.find(m => m.id === id)
    try {
      if (target) {
        await fetch("/api/whatsapp/quick-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target)
        })
      }
      toast({
        title: enabled ? "✓ Atalho ativado!" : "Atalho desativado",
        description: enabled 
          ? `O botão "${target?.shortLabel || target?.title}" agora aparece na janelinha flutuante da reserva.`
          : `O botão "${target?.shortLabel || target?.title}" foi ocultado da janelinha flutuante.`
      })
    } catch (e: any) {
      toast({ title: "Salvo localmente", description: e.message })
    }
  }

  const saveQuickMessage = async (item: WhatsAppQuickMessage) => {
    const exists = quickMessages.some(m => m.id === item.id)
    const updated = exists 
      ? quickMessages.map(m => m.id === item.id ? item : m)
      : [...quickMessages, item]

    setQuickMessages(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}

    try {
      const res = await fetch("/api/whatsapp/quick-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      })
      if (res.ok) {
        toast({ title: "✓ Mensagem rápida salva!", description: `"${item.title}" atualizada com sucesso.` })
      }
    } catch (e: any) {
      toast({ title: "Salvo localmente", description: "Configuração guardada no navegador.", variant: "default" })
    }
  }

  const deleteQuickMessage = async (id: string) => {
    const target = quickMessages.find(m => m.id === id)
    const updated = quickMessages.filter(m => m.id !== id)
    setQuickMessages(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {}

    try {
      await fetch(`/api/whatsapp/quick-messages/${id}`, { method: "DELETE" })
      toast({ title: "Mensagem removida", description: `"${target?.title || id}" foi excluída.` })
    } catch (e: any) {
      toast({ title: "Removida localmente", description: e.message })
    }
  }

  const resetQuickMessages = async () => {
    try {
      const res = await fetch("/api/whatsapp/reset-quick-messages", { method: "POST" })
      if (res.ok) {
        const data = await res.json()
        if (data.quickMessages) {
          setQuickMessages(data.quickMessages)
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data.quickMessages))
          } catch {}
          toast({ title: "✓ Mensagens restauradas!", description: "Modelos originais redefinidos com sucesso." })
          return
        }
      }
    } catch {}

    setQuickMessages(DEFAULT_QUICK_MESSAGES)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_QUICK_MESSAGES))
    } catch {}
    toast({ title: "✓ Mensagens restauradas", description: "Padrões de fábrica reaplicados." })
  }

  const dispatchQuickMessage = async (
    qm: WhatsAppQuickMessage, 
    resItem: any, 
    appOrigin?: string
  ): Promise<{ success: boolean; method: "zapi" | "wa_web"; fallback?: boolean }> => {
    const rawPhone = resItem.guestPhone || resItem.guests?.[0]?.phone || ""
    const cleanPhone = String(rawPhone).replace(/\D/g, "")
    const finalWaPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone
    const resCode = resItem.code || resItem.reservationCode || String(resItem.id || "")
    const guestName = resItem.guestName || "Hóspede"

    const renderedBody = renderQuickMessage(qm.message, resItem, appOrigin)
    const fullWaText = buildFullWhatsAppTextMessage(renderedBody, qm.footer, qm.buttons, resItem, appOrigin)
    const waWebUrl = finalWaPhone ? `https://wa.me/${finalWaPhone}?text=${encodeURIComponent(fullWaText)}` : null

    try {
      const res = await fetch("/api/whatsapp/dispatch-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: qm.id,
          reservationCode: resCode,
          reservationId: resItem.id
        })
      })

      const data = await res.json()
      if (res.ok && data.success) {
        toast({
          title: "✓ WhatsApp enviado com sucesso!",
          description: `"${qm.title}" entregue para ${guestName} (${data.method === "buttons" ? "com botões" : "texto formatado"}).`
        })
        return { success: true, method: "zapi" }
      } else {
        if (waWebUrl) {
          window.open(waWebUrl, "_blank", "noopener,noreferrer")
          toast({
            title: "Abrindo WhatsApp Web 🚀",
            description: `Z-API indisponível. A mensagem para ${guestName} foi aberta no WhatsApp com o texto preenchido!`,
          })
          return { success: true, method: "wa_web", fallback: true }
        } else {
          toast({
            title: "Falha no envio",
            description: data.error || "Hóspede sem telefone WhatsApp cadastrado.",
            variant: "destructive"
          })
          return { success: false, method: "zapi" }
        }
      }
    } catch (err: any) {
      if (waWebUrl) {
        window.open(waWebUrl, "_blank", "noopener,noreferrer")
        toast({
          title: "Abrindo WhatsApp Web 🚀",
          description: `Erro na central Z-API. Abrindo conversa com ${guestName} com a mensagem preenchida.`,
        })
        return { success: true, method: "wa_web", fallback: true }
      }
      toast({
        title: "Erro de disparo",
        description: err.message,
        variant: "destructive"
      })
      return { success: false, method: "zapi" }
    }
  }

  const activeQuickMessages = quickMessages.filter(m => m.enabled !== false)

  return {
    quickMessages,
    activeQuickMessages,
    loading,
    fetchQuickMessages,
    toggleQuickMessage,
    saveQuickMessage,
    deleteQuickMessage,
    resetQuickMessages,
    dispatchQuickMessage
  }
}
