import { useState, useEffect, useCallback } from "react"
import { format, parseISO, differenceInDays } from "date-fns"
import { useToast } from "@/hooks/use-toast"
import { getCheckinUrl } from "@/lib/checkin-url"

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
  recipientTarget?: "guest" | "requester" | "both"
  message: string
  footer?: string
  buttons?: ButtonAction[]
  hasAttachment?: boolean
  documentUrl?: string
  documentName?: string
  documentCaption?: string
}

export interface ReservationRecipients {
  guest: {
    name: string
    firstName: string
    phone: string
    cleanDigits: string
    email?: string
  }
  requester: {
    name: string
    firstName: string
    phone: string
    cleanDigits: string
    email?: string
    type: "guest" | "other_person" | "company"
    company: string
    hasOwnPhone?: boolean
    hasOwnEmail?: boolean
    hasOwnContact?: boolean
    isDifferentFromGuest: boolean
  }
}

export function isPureBillingQuickMessage(qm?: Partial<WhatsAppQuickMessage> | null): boolean {
  if (!qm) return false
  const id = String(qm.id || "").toLowerCase()
  const cat = String(qm.category || "").toLowerCase()
  return (
    id === "qm_payment_pending" ||
    id === "qm_payment_confirmed" ||
    id === "tpl_pre_reserva" ||
    id === "tpl_payment_pending" ||
    id === "tpl_additional_daily_pending" ||
    cat === "financeiro"
  )
}

export function getReservationRecipients(resItem: any, companies: any[] = []): ReservationRecipients {
  const guestName = (resItem?.guestName || resItem?.guests?.[0]?.name || "Hóspede").trim()
  const guestFirstName = guestName.split(" ")[0] || guestName
  const rawGuestPhone = resItem?.guestPhone || resItem?.guests?.[0]?.phone || ""
  const cleanGuestDigits = String(rawGuestPhone).replace(/\D/g, "")
  const guestEmail = String(resItem?.guestEmail || resItem?.guests?.[0]?.email || "").trim().toLowerCase()

  let requesterName = ""
  let requesterPhone = ""
  let requesterEmail = ""
  let requesterType: "guest" | "other_person" | "company" = resItem?.requesterType || "guest"
  if (requesterType === "guest") {
    if (resItem?.companyId || resItem?.companyName) {
      requesterType = "company"
    } else if (
      resItem?.requesterInfo &&
      (resItem.requesterInfo.name || resItem.requesterInfo.phone || resItem.requesterInfo.email)
    ) {
      requesterType = "other_person"
    }
  }
  let requesterCompany = ""

  if (requesterType === "other_person" && resItem?.requesterInfo) {
    requesterName = (resItem.requesterInfo.name || "").trim()
    requesterPhone = (resItem.requesterInfo.phone || "").trim()
    requesterEmail = String(resItem.requesterInfo.email || "").trim().toLowerCase()
  } else if (requesterType === "company") {
    requesterCompany = resItem?.companyName || ""
    let companyObj = null
    if (resItem.companyId && companies.length > 0) {
      companyObj = companies.find(c => String(c.id) === String(resItem.companyId))
    }
    if (!companyObj && resItem.companyName && companies.length > 0) {
      companyObj = companies.find(c => 
        c.tradeName?.toLowerCase() === resItem.companyName?.toLowerCase() ||
        c.corporateName?.toLowerCase() === resItem.companyName?.toLowerCase()
      )
    }
    if (companyObj) {
      requesterName = (companyObj.contactPerson || companyObj.tradeName || resItem.companyName || "Solicitante Corporativo").trim()
      requesterPhone = (companyObj.phone || "").trim()
      requesterEmail = String(companyObj.email || companyObj.financialEmail || "").trim().toLowerCase()
      requesterCompany = companyObj.tradeName || companyObj.corporateName || requesterCompany
    } else {
      requesterName = resItem.companyName || "Solicitante Corporativo"
    }
  }

  const requesterHasOwnPhone = Boolean(requesterPhone)
  const requesterHasOwnEmail = Boolean(requesterEmail)
  const requesterHasOwnContact = requesterHasOwnPhone || requesterHasOwnEmail

  if (!requesterName) {
    requesterName = guestName
  }
  if (!requesterHasOwnContact) {
    if (!requesterPhone) {
      requesterPhone = rawGuestPhone
    }
    if (!requesterEmail) {
      requesterEmail = guestEmail
    }
  }

  const requesterFirstName = requesterName.split(" ")[0] || requesterName
  const cleanRequesterDigits = String(requesterPhone).replace(/\D/g, "")
  const isDifferentFromGuest = Boolean(
    (cleanRequesterDigits && cleanGuestDigits && cleanRequesterDigits !== cleanGuestDigits) ||
    (requesterEmail && guestEmail && requesterEmail !== guestEmail) ||
    (requesterType !== "guest" && requesterHasOwnContact) ||
    (requesterType !== "guest" && requesterName && requesterName.toLowerCase() !== guestName.toLowerCase())
  )

  return {
    guest: {
      name: guestName,
      firstName: guestFirstName,
      phone: rawGuestPhone,
      cleanDigits: cleanGuestDigits,
      email: guestEmail
    },
    requester: {
      name: requesterName,
      firstName: requesterFirstName,
      phone: requesterPhone,
      cleanDigits: cleanRequesterDigits,
      email: requesterEmail,
      type: requesterType,
      company: requesterCompany,
      hasOwnPhone: requesterHasOwnPhone,
      hasOwnEmail: requesterHasOwnEmail,
      hasOwnContact: requesterHasOwnContact,
      isDifferentFromGuest
    }
  }
}

export const DEFAULT_QUICK_MESSAGES: WhatsAppQuickMessage[] = [
  {
    id: "qm_payment_pending",
    title: "Cobrança / Link Pagamento",
    shortLabel: "Cobrança",
    icon: "💳",
    description: "Link para pagamento via PIX ou Cartão de Crédito.",
    category: "Financeiro",
    recipientTarget: "requester",
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
    recipientTarget: "guest",
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
    recipientTarget: "guest",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! ☕🥐
Para agendar o café da manhã no *Flat {{quarto}}*, você pode montar a sua bandeja diretamente pelo link abaixo:

{{link_cafe_manha}}

_(Lembrando: nosso café da manhã é servido exclusivamente com entrega no seu flat, não servido no restaurante do condomínio)._

Escolha seus itens favoritos e o horário desejado!`,
    footer: "CorpFlats • Café no Flat",
    buttons: [
      { id: "btn_cafe", type: "URL", label: "🥐 Escolher Itens do Café", url: "{{link_cafe_manha}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "qm_access_wifi",
    title: "Acesso & Wi-Fi",
    shortLabel: "Acesso & Wi-Fi",
    icon: "📍",
    description: "Instruções de portaria, localização e senha da rede Wi-Fi.",
    category: "Recepção",
    recipientTarget: "guest",
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
    recipientTarget: "guest",
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
    recipientTarget: "guest",
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
  },
  {
    id: "qm_guest_manual",
    title: "Guia / Manual do Hóspede (PDF)",
    shortLabel: "Guia / Manual",
    icon: "📖",
    description: "Manual com regras do flat, Wi-Fi, lazer, dicas da cidade e anexo PDF.",
    category: "Estadia",
    recipientTarget: "guest",
    enabled: true,
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue o Manual e Guia Completo do Hóspede em PDF para sua estadia! 📖✨",
    message: `Olá, *{{primeiro_nome}}*! 📖✨
Preparamos um *Manual e Guia do Hóspede Completo* com tudo o que você precisa saber sobre o seu *Flat {{quarto}}* e as facilidades do condomínio:

📶 Conexão e Senha do Wi-Fi
🏊‍♂️ Horários da Piscina e Sauna
🚗 Estacionamento e Portaria
🏖️ Dicas de praias e melhores restaurantes da região

Segue o PDF oficial anexo logo abaixo. Você também pode consultar o guia online a qualquer momento:
{{link_guia_hospede}}

Desejamos uma estadia memorável!`,
    footer: "CorpFlats • Guia do Hóspede",
    buttons: [
      { id: "btn_guia", type: "URL", label: "📖 Abrir Guia Digital", url: "{{link_guia_hospede}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Minha Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_adm", type: "CALL", label: "📞 Recepção / Adm", phone: "5522997124021" }
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

export function renderQuickMessage(
  templateText: string, 
  resItem: any, 
  appOrigin?: string,
  targetRecipient: "guest" | "requester" = "guest",
  companies: any[] = []
): string {
  if (!templateText) return ""
  if (!resItem) return templateText

  const origin = appOrigin || (typeof window !== "undefined" ? window.location.origin : "https://corpflats.onrender.com")

  const recipients = getReservationRecipients(resItem, companies)
  const guest = recipients.guest
  const requester = recipients.requester

  const recipientIsRequester = targetRecipient === "requester"
  const hideFinancialForGuest = Boolean(requester.isDifferentFromGuest && !recipientIsRequester)
  const primaryRecipientName = recipientIsRequester ? requester.name : guest.name
  const primaryRecipientFirstName = recipientIsRequester ? requester.firstName : guest.firstName
  const primaryRecipientPhone = recipientIsRequester ? requester.phone : guest.phone

  const guestName = guest.name
  const firstName = primaryRecipientFirstName
  const phone = guest.phone
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
  const paidAmount = Number(resItem.paidAmount ?? (resItem.paymentStatus === "pago" || resItem.paymentStatus === "pago_total" ? totalAmount : 0))
  const pendingAmount = Math.max(0, totalAmount - paidAmount)

  const formattedTotal = totalAmount > 0 
    ? totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "R$ 0,00"
  const formattedPaid = paidAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  const formattedPending = pendingAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  const chanLower = String(resItem.channel || "").toLowerCase()
  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb")
  const isPaid = isOta || resItem.paymentStatus === "pago" || resItem.paymentStatus === "pago_total" || (paidAmount >= totalAmount && totalAmount > 0)
  const paymentStatus = isPaid ? "Confirmado / Pago" : "Aguardando Pagamento"
  const statusConfirmacao = resItem.status === "pre_reserva" ? "Pré-Reserva" : "Confirmada"

  const linkPortal = `${origin}/minha-reserva/${resCode}`
  const linkCheckin = getCheckinUrl(resItem, 1, origin)
  const linkCafe = `${origin}/minha-reserva/${resCode}/cafe`
  const linkCheckout = `${origin}/checkout/${resCode}`
  const linkMaps = "https://share.google/LHu3541d5lhkdvbL2"
  const linkAvaliacao = "https://share.google/LHu3541d5lhkdvbL2"

  const tagMap: Record<string, string> = {
    "{{nome_hospede}}": guestName,
    "{{primeiro_nome}}": firstName,
    "{{telefone_hospede}}": phone,
    "{{nome_solicitante}}": requester.name,
    "{{primeiro_nome_solicitante}}": requester.firstName,
    "{{telefone_solicitante}}": requester.phone,
    "{{empresa_solicitante}}": requester.company,
    "{{nome_destinatario}}": primaryRecipientName,
    "{{primeiro_nome_destinatario}}": primaryRecipientFirstName,
    "{{numero_reserva}}": resCode,
    "{{quarto}}": flatNumber,
    "{{data_checkin}}": checkinBr,
    "{{data_checkout}}": checkoutBr,
    "{{horario_checkin}}": checkinTime,
    "{{horario_checkout}}": checkoutTime,
    "{{num_hospedes}}": String(guestCount),
    "{{num_diarias}}": String(totalNights),
    "{{valor_total}}": hideFinancialForGuest ? "" : formattedTotal,
    "{{valor_pago}}": hideFinancialForGuest ? "" : formattedPaid,
    "{{quanto_falta}}": hideFinancialForGuest ? "" : formattedPending,
    "{{saldo_restante}}": hideFinancialForGuest ? "" : formattedPending,
    "{{status_confirmacao}}": statusConfirmacao,
    "{{status_pagamento}}": hideFinancialForGuest ? "" : paymentStatus,
    "{{chave_pix}}": hideFinancialForGuest ? "" : "47.964.813/0001-65",
    "{{titular_pix}}": hideFinancialForGuest ? "" : "CorpFlats Hospedagem",
    "{{instrucao_saldo}}": hideFinancialForGuest ? "" : (pendingAmount > 0 ? `Saldo restante de ${formattedPending} a acertar no check-in.` : "Reserva quitada."),
    "{{instrucao_pagamento}}": hideFinancialForGuest ? "" : (pendingAmount > 0 ? `Para garantir e confirmar sua acomodação, efetue o pagamento via PIX ou cartão pelo portal do hóspede:\n👉 ${linkPortal}` : "Reserva 100% quitada! Nenhuma pendência financeira."),
    "{{canal_reserva}}": resItem.channel || "Site CorpFlats",
    "{{nome_hotel}}": "CorpFlats",
    "{{endereco_hotel}}": "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    "{{link_maps}}": linkMaps,
    "{{wifi_rede}}": "CorpFlats-Hospedes",
    "{{wifi_senha}}": "corpflats2026",
    "{{telefone_hotel}}": "5522997124021",
    "{{link_checkin_digital}}": linkCheckin,
    "{{link_portal_hospede}}": linkPortal,
    "{{link_pagamento}}": hideFinancialForGuest ? "" : linkPortal,
    "{{link_cafe_manha}}": linkCafe,
    "{{link_checkout}}": linkCheckout,
    "{{link_avaliacao_google}}": linkAvaliacao,
    "{{link_guia_hospede}}": `${origin}/guia-hospede`,
    "{{link_manual_hospede}}": `${origin}/guia-hospede`
  }

  let text = templateText
  if (hideFinancialForGuest) {
    text = text
      .replace(/💰\s*\*Situação Financeira:\*[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/^[ \t]*•[ \t]*\*?(Pagamento|Valor|Valor Total[^\n:]*|Quanto foi Pago|Valor Pago|Saldo a Quitar|Saldo Restante|Quanto Falta[^\n:]*)\*?:[^\n]*\n?/gim, "")
  }
  for (const [tag, val] of Object.entries(tagMap)) {
    text = text.split(tag).join(val)
  }
  if (hideFinancialForGuest) {
    text = text.replace(/^[ \t]*•[^:\n]+:[ \t]*(\*\*[ \t]*)?(\([ \t]*\))?[ \t]*\n?/gm, "")
  }
  return text.replace(/\n{3,}/g, "\n\n").trim()
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
    const lowerBody = full.toLowerCase()
    const isCheckoutOrEndStay = lowerBody.includes("check-out") || 
                                lowerBody.includes("checkout") || 
                                lowerBody.includes("encerramento da sua estadia") || 
                                lowerBody.includes("horário limite de saída")
    const isCancellation = lowerBody.includes("cancelamento") || 
                           lowerBody.includes("cancelada") || 
                           lowerBody.includes("cancelado")
    const isReview = lowerBody.includes("avaliação") || 
                     lowerBody.includes("satisfação")

    let safeButtons = buttons
    if (isCheckoutOrEndStay || isCancellation || isReview) {
      safeButtons = buttons.filter(b => b.id !== "btn_cafe" && (!b.url || (!b.url.includes("link_cafe") && !b.url.includes("/cafe/"))))
    }

    const linkItems = safeButtons
      .filter(b => b.url || b.phone)
      .map(b => {
        const resolvedUrl = b.url ? renderQuickMessage(b.url, resItem, originUrl).trim() : ""
        const resolvedPhone = b.phone ? renderQuickMessage(b.phone, resItem, originUrl).trim() : ""
        if (resolvedUrl) {
          const normUrl = resolvedUrl.replace(/\/+$/, "")
          if (full.includes(resolvedUrl) || (normUrl && full.includes(normUrl))) return ""
          return `👉 *${b.label}:* ${resolvedUrl}`
        }
        if (resolvedPhone) {
          const cleanPhone = resolvedPhone.replace(/\D/g, "")
          if (full.includes(resolvedPhone) || (cleanPhone && full.includes(cleanPhone))) return ""
          return `📞 *${b.label}:* tel:+${cleanPhone}`
        }
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

let sharedQuickMessagesCache: WhatsAppQuickMessage[] | null = null
let sharedQuickMessagesLastFetch = 0
let sharedQuickMessagesInFlight: Promise<WhatsAppQuickMessage[] | null> | null = null
const sharedQuickMessagesListeners = new Set<(msgs: WhatsAppQuickMessage[]) => void>()
const QUICK_MESSAGES_CACHE_TTL_MS = 60000

function normalizeQuickMessagesList(list: any[]): WhatsAppQuickMessage[] {
  return list.map(m => {
    let next = m
    if (m.id === "qm_payment_pending" || m.id === "qm_payment_confirmed") {
      next = { ...next, recipientTarget: "requester" }
    }
    if (next.id === "qm_breakfast" && (!next.buttons || next.buttons.length === 0)) {
      return {
        ...next,
        buttons: [
          { id: "btn_cafe", type: "URL", label: "🥐 Escolher Itens do Café", url: "{{link_cafe_manha}}" },
          { id: "btn_portal", type: "URL", label: "🏨 Ver Reserva", url: "{{link_portal_hospede}}" }
        ]
      }
    }
    return next
  })
}

function updateSharedQuickMessages(updated: WhatsAppQuickMessage[]) {
  sharedQuickMessagesCache = updated
  sharedQuickMessagesLastFetch = Date.now()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {}
  for (const listener of sharedQuickMessagesListeners) {
    try {
      listener(updated)
    } catch {}
  }
}

export function useQuickMessages() {
  const { toast } = useToast()

  const [quickMessages, setQuickMessages] = useState<WhatsAppQuickMessage[]>(() => {
    if (sharedQuickMessagesCache && sharedQuickMessagesCache.length > 0) {
      return sharedQuickMessagesCache
    }
    try {
      const local = localStorage.getItem(STORAGE_KEY)
      if (local) {
        const parsed = JSON.parse(local)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = normalizeQuickMessagesList(parsed)
          sharedQuickMessagesCache = normalized
          return normalized
        }
      }
    } catch {}
    return DEFAULT_QUICK_MESSAGES
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const listener = (msgs: WhatsAppQuickMessage[]) => {
      setQuickMessages(msgs)
    }
    sharedQuickMessagesListeners.add(listener)
    return () => {
      sharedQuickMessagesListeners.delete(listener)
    }
  }, [])

  const fetchQuickMessages = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && sharedQuickMessagesCache && (now - sharedQuickMessagesLastFetch) < QUICK_MESSAGES_CACHE_TTL_MS) {
      setQuickMessages(sharedQuickMessagesCache)
      return
    }

    if (sharedQuickMessagesInFlight) {
      setLoading(true)
      try {
        const result = await sharedQuickMessagesInFlight
        if (result) setQuickMessages(result)
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    sharedQuickMessagesInFlight = (async () => {
      try {
        const res = await fetch("/api/whatsapp/quick-messages")
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            const normalized = normalizeQuickMessagesList(data)
            updateSharedQuickMessages(normalized)
            return normalized
          }
        }
      } catch (e) {
        console.warn("Falha ao buscar quick messages da API, usando cache local:", e)
      } finally {
        sharedQuickMessagesInFlight = null
      }
      return null
    })()

    try {
      const result = await sharedQuickMessagesInFlight
      if (result) setQuickMessages(result)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuickMessages(false)
  }, [fetchQuickMessages])

  const toggleQuickMessage = async (id: string, enabled: boolean) => {
    const updated = quickMessages.map(m => m.id === id ? { ...m, enabled } : m)
    updateSharedQuickMessages(updated)

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

    updateSharedQuickMessages(updated)

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
    updateSharedQuickMessages(updated)

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
          const normalized = normalizeQuickMessagesList(data.quickMessages)
          updateSharedQuickMessages(normalized)
          toast({ title: "✓ Mensagens restauradas!", description: "Modelos originais redefinidos com sucesso." })
          return
        }
      }
    } catch {}

    updateSharedQuickMessages(DEFAULT_QUICK_MESSAGES)
    toast({ title: "✓ Mensagens restauradas", description: "Padrões de fábrica reaplicados." })
  }

  const dispatchQuickMessage = async (
    qm: WhatsAppQuickMessage, 
    resItem: any, 
    appOrigin?: string,
    overrideOrOptions?: "guest" | "requester" | "both" | "custom" | {
      overrideTarget?: "guest" | "requester" | "both" | "custom";
      customPhone?: string;
      customName?: string;
      customMessage?: string;
    }
  ): Promise<{ success: boolean; method: "zapi" | "wa_web"; fallback?: boolean }> => {
    const opts = typeof overrideOrOptions === "string"
      ? { overrideTarget: overrideOrOptions }
      : (overrideOrOptions || {})
    const recipients = getReservationRecipients(resItem)
    const isPureBilling = isPureBillingQuickMessage(qm)
    let targetMode = opts.overrideTarget || qm.recipientTarget || "guest"
    if (recipients.requester.isDifferentFromGuest && isPureBilling && targetMode !== "custom") {
      targetMode = "requester"
    }
    const resCode = resItem.code || resItem.reservationCode || String(resItem.id || "")

    // Fallback phones
    const guestPhone = recipients.guest.cleanDigits.length === 10 || recipients.guest.cleanDigits.length === 11 
      ? `55${recipients.guest.cleanDigits}` 
      : recipients.guest.cleanDigits
    const requesterPhone = recipients.requester.cleanDigits.length === 10 || recipients.requester.cleanDigits.length === 11 
      ? `55${recipients.requester.cleanDigits}` 
      : recipients.requester.cleanDigits

    const cleanCustomPhone = opts.customPhone ? opts.customPhone.replace(/\D/g, "") : ""
    const formattedCustomPhone = cleanCustomPhone.length === 10 || cleanCustomPhone.length === 11
      ? `55${cleanCustomPhone}`
      : cleanCustomPhone

    const allowRequesterFallbackToGuest = !recipients.requester.isDifferentFromGuest || !recipients.requester.hasOwnContact
    const effectiveTargetPhone = formattedCustomPhone
      || (targetMode === "requester" ? (requesterPhone || (allowRequesterFallbackToGuest ? guestPhone : "")) : guestPhone)

    const baseRenderedBody = opts.customMessage?.trim()
      ? opts.customMessage
      : renderQuickMessage(qm.message, resItem, appOrigin, targetMode === "requester" ? "requester" : "guest")
    const fullFallbackText = buildFullWhatsAppTextMessage(baseRenderedBody, qm.footer, qm.buttons, resItem, appOrigin)
    const waWebUrl = effectiveTargetPhone
      ? `https://wa.me/${effectiveTargetPhone}?text=${encodeURIComponent(fullFallbackText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(fullFallbackText)}`

    try {
      const res = await fetch("/api/whatsapp/dispatch-reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: qm.id,
          reservationCode: resCode,
          reservationId: resItem?.id,
          recipientTarget: targetMode,
          reservation: resItem,
          template: qm,
          phone: effectiveTargetPhone,
          customPhone: formattedCustomPhone || undefined,
          customName: opts.customName || undefined,
          customMessage: opts.customMessage || undefined,
          bypassTestMode: true
        })
      })

      const data = await res.json().catch(() => ({}))
      const isSimulated = Boolean(data.simulated || (Array.isArray(data.results) && data.results.length > 0 && data.results.every((r: any) => r.simulated)))

      if (res.ok && data.success && !isSimulated) {
        let recipientSummary = opts.customName || recipients.guest.name
        if (targetMode === "both") {
          if (recipients.requester.isDifferentFromGuest && recipients.requester.phone) {
            recipientSummary = `Hóspede (${recipients.guest.firstName}) e Solicitante (${recipients.requester.firstName})`
          } else {
            recipientSummary = `${recipients.guest.name} (Hóspede/Solicitante)`
          }
        } else if (targetMode === "requester") {
          recipientSummary = `Solicitante ${recipients.requester.name}`
        }

        toast({
          title: "✓ WhatsApp enviado com sucesso!",
          description: `"${qm.title}" entregue via Z-API para ${recipientSummary} (${data.method === "buttons" ? "com botões" : "texto formatado"}).`
        })
        return { success: true, method: "zapi" }
      } else {
        const errorDetail = isSimulated
          ? "Z-API desconectada/em modo simulação"
          : (data.error || (data.results && data.results[0]?.error) || "Z-API indisponível no momento")
        console.warn("[dispatchQuickMessage] Acionando redundância WhatsApp Web:", errorDetail)
        toast({
          title: "↪ Redirecionado para WhatsApp Web (Redundância)",
          description: `${errorDetail}. Abrindo WhatsApp Web automaticamente para concluir o envio.`
        })
        if (typeof window !== "undefined") {
          window.open(waWebUrl, "_blank")
        }
        return { success: true, method: "wa_web", fallback: true }
      }
    } catch (err: any) {
      console.error("[dispatchQuickMessage] Erro na requisição Z-API, acionando redundância WhatsApp Web:", err)
      toast({
        title: "↪ Redirecionado para WhatsApp Web (Redundância)",
        description: "Sem comunicação com a Z-API — abrindo WhatsApp Web automaticamente para concluir o envio."
      })
      if (typeof window !== "undefined") {
        window.open(waWebUrl, "_blank")
      }
      return { success: true, method: "wa_web", fallback: true }
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

export async function sendDirectZapiWithFallback(options: {
  phone?: string | null;
  message: string;
  title?: string;
  footer?: string;
  buttons?: QuickMessageButton[];
  recipientName?: string;
  reservationCode?: string;
  flatNumber?: string;
  triggerEvent?: string;
  toast?: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  label?: string;
}): Promise<{ success: boolean; method: "zapi" | "wa_web"; fallback?: boolean }> {
  const rawDigits = (options.phone || "").replace(/\D/g, "")
  const cleanPhone = rawDigits.length === 10 || rawDigits.length === 11
    ? `55${rawDigits}`
    : rawDigits

  const waWebUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(options.message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(options.message)}`

  if (!cleanPhone) {
    options.toast?.({
      title: "↪ Abrindo WhatsApp Web",
      description: "Destinatário sem telefone cadastrado — escolha o contato no WhatsApp Web."
    })
    if (typeof window !== "undefined") {
      window.open(waWebUrl, "_blank")
    }
    return { success: true, method: "wa_web", fallback: true }
  }

  try {
    const res = await fetch("/api/whatsapp/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: cleanPhone,
        message: options.message,
        title: options.title,
        footer: options.footer,
        buttons: options.buttons,
        recipientName: options.recipientName,
        reservationCode: options.reservationCode,
        flatNumber: options.flatNumber,
        triggerEvent: options.triggerEvent || "manual_button_dispatch",
        bypassTestMode: true
      })
    })
    const data = await res.json().catch(() => ({}))
    const isSimulated = Boolean(data.simulated || data.result?.simulated)
    if (res.ok && data.success && !isSimulated) {
      options.toast?.({
        title: "✓ WhatsApp enviado via Z-API!",
        description: options.label
          ? `${options.label} enviado diretamente para ${options.recipientName || `+${cleanPhone}`}.`
          : `Mensagem entregue diretamente via Z-API para ${options.recipientName || `+${cleanPhone}`}.`
      })
      return { success: true, method: "zapi" }
    } else {
      const reason = isSimulated
        ? "Z-API desconectada/em modo simulação"
        : (data.error || data.result?.error || "Z-API indisponível no momento")
      options.toast?.({
        title: "↪ Redirecionado para WhatsApp Web (Redundância)",
        description: `${reason}. Abrindo WhatsApp Web automaticamente para envio.`
      })
      if (typeof window !== "undefined") {
        window.open(waWebUrl, "_blank")
      }
      return { success: true, method: "wa_web", fallback: true }
    }
  } catch (err: any) {
    options.toast?.({
      title: "↪ Redirecionado para WhatsApp Web (Redundância)",
      description: "Sem comunicação com a Z-API — abrindo WhatsApp Web automaticamente para envio."
    })
    if (typeof window !== "undefined") {
      window.open(waWebUrl, "_blank")
    }
    return { success: true, method: "wa_web", fallback: true }
  }
}

export function buildDirectWaWebUrl(phone?: string | null, message: string = ""): string {
  const rawDigits = (phone || "").replace(/\D/g, "")
  const cleanPhone = rawDigits.length === 10 || rawDigits.length === 11
    ? `55${rawDigits}`
    : rawDigits
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
}

export function buildQuickMessageWaWebUrl(
  qm: WhatsAppQuickMessage,
  resItem: any,
  appOrigin?: string,
  overrideOrOptions?: "guest" | "requester" | "both" | "custom" | {
    overrideTarget?: "guest" | "requester" | "both" | "custom";
    customPhone?: string;
    customName?: string;
    customMessage?: string;
  }
): string {
  const opts = typeof overrideOrOptions === "string"
    ? { overrideTarget: overrideOrOptions }
    : (overrideOrOptions || {})
  const recipients = getReservationRecipients(resItem)
  const isPureBilling = isPureBillingQuickMessage(qm)
  let targetMode = opts.overrideTarget || qm.recipientTarget || "guest"
  if (recipients.requester.isDifferentFromGuest && isPureBilling && targetMode !== "custom") {
    targetMode = "requester"
  }

  const guestPhone = recipients.guest.cleanDigits.length === 10 || recipients.guest.cleanDigits.length === 11
    ? `55${recipients.guest.cleanDigits}`
    : recipients.guest.cleanDigits
  const requesterPhone = recipients.requester.cleanDigits.length === 10 || recipients.requester.cleanDigits.length === 11
    ? `55${recipients.requester.cleanDigits}`
    : recipients.requester.cleanDigits

  const cleanCustomPhone = opts.customPhone ? opts.customPhone.replace(/\D/g, "") : ""
  const formattedCustomPhone = cleanCustomPhone.length === 10 || cleanCustomPhone.length === 11
    ? `55${cleanCustomPhone}`
    : cleanCustomPhone

  const allowRequesterFallbackToGuest = !recipients.requester.isDifferentFromGuest || !recipients.requester.hasOwnContact
  const effectiveTargetPhone = formattedCustomPhone
    || (targetMode === "requester" ? (requesterPhone || (allowRequesterFallbackToGuest ? guestPhone : "")) : guestPhone)

  const baseRenderedBody = opts.customMessage?.trim()
    ? opts.customMessage
    : renderQuickMessage(qm.message, resItem, appOrigin, targetMode === "requester" ? "requester" : "guest")
  const fullFallbackText = buildFullWhatsAppTextMessage(baseRenderedBody, qm.footer, qm.buttons, resItem, appOrigin)

  return effectiveTargetPhone
    ? `https://wa.me/${effectiveTargetPhone}?text=${encodeURIComponent(fullFallbackText)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(fullFallbackText)}`
}

export function bindZapiClickOrHoldWaWeb(options: {
  onClickZapi: (e: any) => void;
  getWaUrl?: () => string | null | undefined;
  onHoldWaWeb?: () => void;
  holdDurationMs?: number;
  stopPropagation?: boolean;
  toast?: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}) {
  const holdMs = options.holdDurationMs ?? 2000

  const resetVisuals = (el: any) => {
    if (!el || !el.style) return
    el.style.transition = ""
    el.style.transform = ""
    el.style.boxShadow = ""
  }

  const clearHoldTimer = (el: any) => {
    if (el && el.__waHoldTimer) {
      clearTimeout(el.__waHoldTimer)
      el.__waHoldTimer = null
    }
    resetVisuals(el)
  }

  return {
    onPointerDown: (e: any) => {
      if (e.button !== undefined && e.button !== 0) return
      if (options.stopPropagation !== false) {
        e.stopPropagation()
      }
      const el = e.currentTarget as any
      if (!el || el.disabled) return

      clearHoldTimer(el)
      el.__waHoldTriggered = false
      el.__waPendingUrl = null

      if (el.style) {
        el.style.transition = `transform ${holdMs}ms linear, box-shadow ${holdMs}ms ease`
        el.style.transform = "scale(0.95)"
        el.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.65)"
      }

      el.__waHoldTimer = setTimeout(() => {
        el.__waHoldTimer = null
        el.__waHoldTriggered = true
        resetVisuals(el)

        if (typeof navigator !== "undefined" && navigator.vibrate) {
          try {
            navigator.vibrate(60)
          } catch {}
        }

        options.toast?.({
          title: "🌐 Abrindo WhatsApp Web (Segurado 2s)",
          description: "Atalho de 2 segundos ativado — redirecionando para o WhatsApp Web."
        })

        if (options.onHoldWaWeb) {
          options.onHoldWaWeb()
          return
        }

        const url = options.getWaUrl?.()
        if (url && typeof window !== "undefined") {
          const win = window.open(url, "_blank")
          if (!win) {
            el.__waPendingUrl = url
          }
        }
      }, holdMs)
    },
    onPointerUp: (e: any) => {
      if (options.stopPropagation !== false) {
        e.stopPropagation()
      }
      const el = e.currentTarget as any
      clearHoldTimer(el)
      if (el && el.__waPendingUrl && typeof window !== "undefined") {
        const url = el.__waPendingUrl
        el.__waPendingUrl = null
        window.open(url, "_blank")
      }
    },
    onPointerLeave: (e: any) => {
      clearHoldTimer(e.currentTarget)
    },
    onPointerCancel: (e: any) => {
      clearHoldTimer(e.currentTarget)
    },
    onContextMenu: (e: any) => {
      const el = e.currentTarget as any
      if (el && (el.__waHoldTimer || el.__waHoldTriggered)) {
        e.preventDefault()
      }
    },
    onClick: (e: any) => {
      if (options.stopPropagation !== false) {
        e.stopPropagation()
      }
      const el = e.currentTarget as any
      clearHoldTimer(el)
      if (el && el.__waHoldTriggered) {
        e.preventDefault()
        el.__waHoldTriggered = false
        if (el.__waPendingUrl && typeof window !== "undefined") {
          const url = el.__waPendingUrl
          el.__waPendingUrl = null
          window.open(url, "_blank")
        }
        return
      }
      options.onClickZapi(e)
    }
  }
}


