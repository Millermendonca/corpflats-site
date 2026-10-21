/**
 * CorpFlats / Guest Flow Manager - Z-API WhatsApp Automation Engine
 * 
 * Recursos:
 * - Conexão Z-API (Status, QR Code, Envio de Mensagens de Ação com Botões)
 * - Fallback inteligente para texto formatado com links se botões falharem
 * - Motor de resolução de tags dinâmicas no cursor (Hóspede, Reserva, Hotel, Links)
 * - Régua de gatilhos automáticos (Nova Reserva, Lembrete Pré-Checkin, Dia do Checkin,
 *   Boas-vindas, Café da Manhã, Check-out, Avaliação Google, Cancelamento)
 * - Fila de disparos com agendamento por offset de tempo e antecipação manual ("Enviar Agora")
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getSmtpConfig, createTransporter, sendEmailAsync, renderWhatsAppMirrorEmail } from "./mail-service.mjs";
import {
  getWhatsAppAiConfig,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  DEFAULT_AI_CONFIG,
  autoCreatePendingFaq,
  isPotentialGuestQuestion,
  inferFaqCategory,
  extractFaqKeywords,
  isQuestionMappedInFaq,
  findExistingPendingFaq,
  classifyUnmetDemand,
  detectAndRecordUnmetDemand,
  UNMET_DEMAND_CATEGORIES,
  applyToneCalibration,
  saveDeveloperGuideline,
  handleGetReservationDetails,
  handleGetFlatStatus,
  handleGetPricingInfo,
  handleRecordUnmetDemand,
  handleInformCheckout,
  analyzeGuestQuery,
  analyzeGuestIntentSemantic,
  formatCheckoutCommunicationResponse,
  validateAndRefineResponse,
  prepareAgenticPreAnalysis,
  isReservationCheckoutCompleted,
  getRecentAutomatedTriggers,
  buildGuestContext,
  generateFaqResponseSuggestions,
  generateIntelligentFaqDraft,
  distillGuidelineFromOperatorResponse,
  getGreetingSalutation,
  handleWhatsAppFiscalFlow,
  isFiscalIntentMessage,
  findContactAndReservation,
  extractCnpj,
  extractCpf,
  generateSofiaRealtimeAssistance,
  selectFairShareFlat,
  extractActivePreReservationData,
  isOperatorConductingConversation,
  evaluateAndNotifyActivePreReservation,
  createStandardPmsPreReservation,
  handleManagerPreReservationReply,
  parseManagerPreReservationCommand,
  formatActivePreReservationManagerSummary
} from "./whatsapp-ai-service.mjs";

export {
  autoCreatePendingFaq,
  isPotentialGuestQuestion,
  inferFaqCategory,
  extractFaqKeywords,
  isQuestionMappedInFaq,
  findExistingPendingFaq,
  classifyUnmetDemand,
  detectAndRecordUnmetDemand,
  UNMET_DEMAND_CATEGORIES,
  applyToneCalibration,
  saveDeveloperGuideline,
  handleGetReservationDetails,
  handleGetFlatStatus,
  handleGetPricingInfo,
  handleRecordUnmetDemand,
  handleInformCheckout,
  analyzeGuestQuery,
  analyzeGuestIntentSemantic,
  formatCheckoutCommunicationResponse,
  validateAndRefineResponse,
  prepareAgenticPreAnalysis,
  isReservationCheckoutCompleted,
  getRecentAutomatedTriggers,
  buildGuestContext,
  generateFaqResponseSuggestions,
  generateIntelligentFaqDraft,
  distillGuidelineFromOperatorResponse,
  getGreetingSalutation,
  handleWhatsAppFiscalFlow,
  isFiscalIntentMessage,
  findContactAndReservation,
  extractCnpj,
  extractCpf,
  selectFairShareFlat,
  extractActivePreReservationData,
  isOperatorConductingConversation,
  evaluateAndNotifyActivePreReservation,
  createStandardPmsPreReservation,
  handleManagerPreReservationReply,
  parseManagerPreReservationCommand,
  formatActivePreReservationManagerSummary
};
import {
  getCheckinUrlSync as getSerproCheckinUrlSync,
  getCheckinUrl as getSerproCheckinUrl
} from "./fnrh-serpro-service.mjs";

/**
 * Resolução dinâmica e unificada de URL de check-in conforme o provedor ativo (proprio ou gov_fnrh).
 */
export function getCheckinUrlSync(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrlSync === "function") {
    return globalThis.getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrlSync === "function") {
    return getSerproCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
  }
  const activeDb = dbInstance || (typeof globalThis.db !== "undefined" ? globalThis.db : null);
  const activeSettings = activeDb?.settings || activeDb || {};
  const currentProvider = activeSettings.checkinProvider || "proprio";
  const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/$/, "");
  const safeGuestIndex = Number(guestIndex) || 1;
  const resCode = reservation?.code || reservation?.id || "";
  const isResign = Boolean(reservation?.needsReSignature);
  const resignParam = isResign
    ? (safeGuestIndex > 1 ? `?guest=${safeGuestIndex}&resign=1` : "?resign=1")
    : `?guest=${safeGuestIndex}`;
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}${resignParam}`;

  if (currentProvider === "gov_fnrh" && !isResign && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

export async function getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null) {
  if (typeof globalThis.getCheckinUrl === "function") {
    return globalThis.getCheckinUrl(reservation, guestIndex, baseUrl, dbInstance);
  }
  if (typeof getSerproCheckinUrl === "function") {
    return getSerproCheckinUrl(reservation, guestIndex, baseUrl, dbInstance);
  }
  return getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "uploads");
const DOCUMENTS_DIR = path.join(UPLOADS_DIR, "documents");
if (!fs.existsSync(DOCUMENTS_DIR)) {
  try { fs.mkdirSync(DOCUMENTS_DIR, { recursive: true }); } catch {}
}

// ── Canais de Reserva Suportados no Sistema ─────────────────────────────────
export const AVAILABLE_CHANNELS = [
  { id: "site", label: "Site Oficial", description: "Reservas diretas pelo site CorpFlats" },
  { id: "whatsapp", label: "WhatsApp", description: "Reservas negociadas diretamente via WhatsApp" },
  { id: "booking", label: "Booking.com", description: "Reservas importadas da Booking.com" },
  { id: "airbnb", label: "Airbnb", description: "Reservas importadas do Airbnb" },
  { id: "outros", label: "Balcão / Outros", description: "Balcão, presencial ou outros canais" },
];

export const ALL_CHANNEL_IDS = ["site", "whatsapp", "booking", "airbnb", "outros"];

/**
 * Normaliza qualquer string de canal vinda da reserva para os identificadores canônicos
 */
export function normalizeReservationChannel(rawChannel) {
  const c = String(rawChannel || "").toLowerCase().trim();
  if (c.includes("booking")) return "booking";
  if (c.includes("airbnb")) return "airbnb";
  if (c.includes("whats") || c.includes("direta") || c.includes("wpp")) return "whatsapp";
  if (c.includes("site")) return "site";
  if (c.includes("balcao") || c.includes("balcão") || c.includes("presencial") || c.includes("decolar") || c.includes("expedia")) return "outros";
  return c || "site";
}

/**
 * Verifica se um template automático está autorizado para o canal da reserva
 */
export function isTemplateAllowedForChannel(template, rawChannel) {
  if (!template || !template.channels || !Array.isArray(template.channels) || template.channels.length === 0 || template.channels.includes("all")) {
    return true;
  }
  const norm = normalizeReservationChannel(rawChannel);
  const rawLower = String(rawChannel || "").toLowerCase().trim();
  return template.channels.some(c => {
    const cLower = String(c || "").toLowerCase().trim();
    return cLower === "all" || cLower === norm || cLower === rawLower || (cLower === "outros" && norm === "outros");
  });
}

/**
 * Sanitiza notas do card de governança para remover mensagens redundantes de check-out,
 * mantendo apenas instruções operacionais autênticas (ex.: camas, berço, avisos especiais).
 */
export function sanitizeCardNote(note) {
  if (!note || typeof note !== "string") return null;
  let cleaned = note
    .replace(/(?:•\s*)?Check-out\s+confirmado[^\n•]*/gi, "")
    .replace(/(?:•\s*)?Check-out\s+expresso[^\n•]*/gi, "")
    .replace(/(?:•\s*)?Confirmado\s+na\s+Portaria[^\n•]*/gi, "")
    .replace(/(?:•\s*)?Limpeza\s+de\s+check-out\s+gerada\s+automaticamente[^\n•]*/gi, "")
    .replace(/(?:•\s*)?Quarto\s+desocupado[^\n•]*/gi, "")
    .trim();
  cleaned = cleaned.replace(/^[•\s\-,|]+|[•\s\-,|]+$/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function generateStaticPixPayload({ pixKey = "47964813000165", amount = 0, merchantName = "CORPFLATS LTDA", merchantCity = "CAMPOS DOS GOYTACAZES", txid = "***" }) {
  const formatTag = (id, value) => `${id}${String(value.length).padStart(2, "0")}${value}`;
  let payload = formatTag("00", "01");
  const gui = formatTag("00", "br.gov.bcb.pix");
  const key = formatTag("01", pixKey);
  payload += formatTag("26", `${gui}${key}`);
  payload += formatTag("52", "0000");
  payload += formatTag("53", "986");
  if (amount && Number(amount) > 0) {
    payload += formatTag("54", Number(amount).toFixed(2));
  }
  payload += formatTag("58", "BR");
  const cleanName = (merchantName || "CORPFLATS LTDA")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 25);
  payload += formatTag("59", cleanName || "CORPFLATS LTDA");
  const cleanCity = (merchantCity || "CAMPOS")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "").trim().substring(0, 15);
  payload += formatTag("60", cleanCity || "CAMPOS");
  const cleanTxId = (txid || "***").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25) || "***";
  payload += formatTag("62", formatTag("05", cleanTxId));
  const toCrc = `${payload}6304`;
  return `${toCrc}${crc16(toCrc)}`;
}

// ── Utilitário Canônico de Fuso Horário de Brasília (America/Sao_Paulo) ────────
export function getBrasiliaDateParts(d = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    todayStr: `${map.year}-${map.month}-${map.day}`,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    timeStr: `${map.hour}:${map.minute}`
  };
}

// ── Templates Padrão de Alta Conversão & Boas Práticas Hoteleiras ──────────────
export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: "tpl_pre_reserva",
    triggerEvent: "pre_reservation_created",
    title: "Pré-Reserva • Confirmação & Aguardando Pagamento",
    description: "Enviado automaticamente para o solicitante quando uma pré-reserva é registrada, informando os dados da estadia, valores e botão de copiar o código PIX.",
    enabled: true,
    channels: ["site", "whatsapp", "outros"],
    recipientTarget: "requester",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_destinatario}}*! ⏳
Recebemos o pedido de *Pré-Reserva* no *{{nome_hotel}}*!

⚠️ *Importante:* Esta reserva está *Aguardando Pagamento* para confirmação definitiva da sua acomodação.

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Quanto Falta Pagar: *{{quanto_falta}}*

{{instrucao_pagamento}}`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_portal", type: "URL", label: "💳 Ver Reserva & Pagar", url: "{{link_portal_hospede}}" },
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "{{link_copiar_pix}}" },
      { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_new_reservation",
    triggerEvent: "reservation_created",
    title: "Nova Reserva • Confirmação & Resumo (Todos os Canais)",
    description: "Template genérico para nova reserva confirmada. Prefira usar os templates especializados tpl_new_reservation_direct (Site/WhatsApp) e tpl_new_reservation_ota (Booking/Airbnb) para experiência personalizada.",
    enabled: false,
    channels: ["outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_hospede}}*! 🌟
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*
• Café da Manhã: *{{status_cafe}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo a Quitar: *{{quanto_falta}}*

{{instrucao_saldo}}

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria, realize com antecedência o seu *Pré-Check-in Digital* pelo botão abaixo:`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_new_reservation_direct",
    triggerEvent: "reservation_created",
    title: "Nova Reserva (Site/WhatsApp) • Confirmação + Early Check-in",
    description: "Enviado para reservas via Site ou WhatsApp confirmadas antes das 00:00 do dia do check-in. Garante benefício de Early Check-in a partir das 10:00 mediante disponibilidade de limpeza.",
    enabled: true,
    channels: ["site", "whatsapp"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue em anexo o Manual do Hóspede em PDF com todas as orientações da sua acomodação! 📖",
    message: `Olá, *{{nome_hospede}}*! 🌟✨
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*
• Café da Manhã: *{{status_cafe}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo a Quitar: *{{quanto_falta}}*

{{instrucao_saldo}}

🎁 *Benefício Exclusivo — Early Check-in a partir das 10:00:*
Como você reservou diretamente conosco, você tem direito à entrada antecipada a partir das 10:00, *ESTRITAMENTE MEDIANTE DISPONIBILIDADE* (depende da desocupação do hóspede anterior e da conclusão da limpeza). Assim que o flat estiver pronto pela governança, você receberá a notificação por aqui!

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria, realize com antecedência o seu *Pré-Check-in Digital* pelo botão abaixo:`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_cafe", type: "URL", label: "🥐 Escolher Itens do Café", url: "{{link_cafe_manha}}" }
    ]
  },
  {
    id: "tpl_new_reservation_ota",
    triggerEvent: "reservation_created",
    title: "Nova Reserva (Booking/Airbnb) • Confirmação sem valores",
    description: "Enviado para reservas via Booking.com ou Airbnb. Não menciona valores nem pagamento. Informa check-in 14:00, checkout 12:00, liberação com número do flat a partir das 12:00 se limpo, e benefício de 10:00 para reservas diretas.",
    enabled: true,
    channels: ["booking", "airbnb"],
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue em anexo o Manual do Hóspede em PDF com todas as orientações da sua acomodação! 📖",
    message: `Olá, *{{nome_hospede}}*! 🌟
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Entrada (Check-in): *{{data_checkin}} a partir das 14:00*
• Saída (Check-out): *{{data_checkout}} até às 12:00*
• Total de Hóspedes: *{{num_hospedes}}*

🔑 *Sobre o seu apartamento e liberação de entrada:*
O número do seu flat e as instruções de chegada serão informados no dia da sua chegada *a partir das 12:00*, assim que o apartamento estiver 100% higienizado e preparado pela nossa governança.

💡 *Dica CorpFlats:*
Em suas próximas viagens, ao reservar diretamente pelo nosso site ou WhatsApp, você conta com o benefício exclusivo de *Early Check-in gratuito a partir das 10:00 da manhã* (conforme disponibilidade)!

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar a liberação da portaria sem burocracia, realize seu *Pré-Check-in Digital* com antecedência:`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_room_ready_direct",
    triggerEvent: "room_ready",
    title: "Quarto Liberado • Early Check-in Disponível (Site/WhatsApp)",
    description: "Disparado quando a limpeza do flat é concluída no dia do check-in, para reservas via Site ou WhatsApp. Avisa que o flat está pronto para entrada antecipada.",
    enabled: true,
    channels: ["site", "whatsapp"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `*{{primeiro_nome}}*, uma ótima notícia! 🎉🔑
Seu *Flat {{quarto}}* no *{{nome_hotel}}* já está *Limpo e Pronto* para receber você!

Como você reservou diretamente conosco, pode fazer o *Early Check-in agora mesmo*, sem precisar esperar as {{horario_checkin}}! 🚀

📍 Ao chegar, basta se identificar na portaria 24h com seu nome e o número *{{quarto}}*.

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

Desejamos uma chegada tranquila e uma estadia incrível! Qualquer dúvida, estamos à disposição.`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
      { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "{{link_maps}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_room_ready_ota",
    triggerEvent: "room_ready_ota",
    title: "Quarto Liberado • Informação de Flat (Booking/Airbnb)",
    description: "Disparado no dia do check-in para reservas Booking/Airbnb: às 12:00 se o flat já estiver limpo, ou às 14:00 (check-in padrão). Revela o número do flat e as instruções de acesso.",
    enabled: true,
    channels: ["booking", "airbnb"],
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `*{{primeiro_nome}}*, tudo pronto para sua chegada! 🔑🏡
Seu apartamento no *{{nome_hotel}}* já foi definido:

🏠 *Flat {{quarto}}*
⏰ Liberado para entrada a partir de *agora*!

📍 Ao chegar, vá à portaria 24h e informe seu nome e o número *{{quarto}}*.

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

📍 *Endereço:* {{endereco_hotel}}

Desejamos uma estadia maravilhosa! Se precisar de algo, estamos à disposição.

💡 _Na próxima vez, reserve pelo nosso site ou WhatsApp e ganhe early check-in sem custo adicional!_`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
      { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "{{link_maps}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_room_ready_regular",
    triggerEvent: "room_ready_regular",
    title: "Quarto Liberado • Entrada Regular (A partir das 14:00)",
    description: "Disparado quando a limpeza do flat é concluída no dia do check-in a partir das 14:00 (horário padrão). Informa que o flat está limpo e liberado, sem menção a early check-in antecipado.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `*{{primeiro_nome}}*, seu flat está pronto! 🔑✨
Seu *Flat {{quarto}}* no *{{nome_hotel}}* já está *Limpo e Liberado* para receber você!

📍 Ao chegar, basta se identificar na portaria 24h com seu nome e o número *{{quarto}}*.

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

Desejamos uma chegada tranquila e uma estadia incrível! Qualquer dúvida, estamos à disposição.`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
      { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "{{link_maps}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_checkin_cleaning_delay",
    triggerEvent: "checkin_cleaning_delay",
    title: "Check-in 13:45 • Limpeza em Andamento & Previsão de Chegada",
    description: "Disparado no dia do check-in às 13:45 (ou logo após) exclusivamente caso o flat ainda esteja sendo limpo e o hóspede ainda não tenha entrado. Pergunta a previsão de chegada do hóspede para priorizar a limpeza ou remanejar acomodação.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "fixed_time_day_of",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "13:45",
    message: `Olá, *{{primeiro_nome}}*! Tudo bem? 🌟
Hoje é o dia da sua chegada ao *{{nome_hotel}}*!

Nossa equipe de governança está finalizando os últimos preparativos e a higienização do seu *Flat {{quarto}}* para que você encontre tudo impecável.

⏰ *Você já tem uma previsão de que horas pretende chegar hoje?*
Se puder nos informar respondendo a esta mensagem ou pelo link do portal abaixo, podemos priorizar a finalização do seu flat na limpeza ou até mesmo verificar a liberação imediata de uma acomodação pronta para sua entrada sem espera!

Qualquer dúvida ou necessidade, estamos à sua total disposição por aqui.`,
    footer: "CorpFlats • Governança & Recepção",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🏨 Informar no Portal", url: "{{link_portal_hospede}}" },
      { id: "btn_admin", type: "CALL", label: "📞 Falar no WhatsApp", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_reservation_updated",
    triggerEvent: "reservation_updated",
    title: "Modificação de Reserva • O que foi alterado",
    description: "Enviado quando houver alterações de datas, quarto, valores ou hóspedes. Informa com precisão e clareza apenas os itens alterados (De ➔ Para), sem reenviar os demais dados da reserva.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! 🔄
Sua reserva (*{{numero_reserva}}*) no *{{nome_hotel}}* foi alterada.

Confira o que foi atualizado:
{{resumo_alteracoes}}`,
    footer: "CorpFlats • Central de Atendimento",
    buttons: [
      { id: "btn_checkin", type: "URL", label: "📝 Assinar Ficha Atualizada", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_pre_checkin_reminder",
    triggerEvent: "pre_checkin_reminder",
    title: "Lembrete de Pré-Check-in Digital",
    description: "Enviado antes do check-in para quem ainda não concluiu o check-in digital. Trata reservas de 1 ou 2 hóspedes com opção de confirmar viagem individual.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "before_event",
    offsetValue: 24,
    offsetUnit: "hours",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! Tudo bem? ⏳
Sua chegada ao *{{nome_hotel}}* está próxima (*{{data_checkin}}*)!

{{mensagem_pendencia_hospedes}}

Para que a portaria libere sua entrada com agilidade na chegada, acesse o link seguro:`,
    footer: "CorpFlats • Entrada Rápida & Segura",
    buttons: [
      { id: "btn_pre", type: "URL", label: "📝 Ficha Digital de Check-in", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_pre_checkin_completed",
    triggerEvent: "pre_checkin_completed",
    title: "Check-in Online Concluído • Confirmação & Instruções de Recepção",
    description: "Enviado imediatamente após o hóspede (titular ou acompanhante) concluir o Check-in Online (FNRH). Confirma que já está tudo pronto e orienta como se identificar na recepção citando a CorpFlats e o nome ou número do flat.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! ✅🎉
Seu *Check-in Online* foi concluído com sucesso e já está *tudo pronto* para a sua chegada!

🏨 *Como funciona na Recepção 24h:*
Ao chegar no edifício, basta seguir estas orientações simples na recepção:
• Identifique-se na recepção;
• Diga que já fez o *Check-in Online*;
• Informe que fez a reserva pela *CorpFlats*;
• Informe o seu nome (*{{nome_destinatario}}*) ou o número do *Flat {{quarto}}*.

📋 *Resumo da sua Hospedagem:*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Endereço: {{endereco_hotel}}
• Localização no Maps: {{link_maps}}

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

{{aviso_acompanhante_pendente_pos_checkin}}

Desejamos uma excelente viagem e uma ótima estadia! Qualquer dúvida, estamos à disposição.`,
    footer: "CorpFlats • Check-in Online Confirmado",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "{{link_portal_hospede}}" },
      { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "{{link_maps}}" }
    ]
  },
  {
    id: "tpl_checkin_day_instructions",
    triggerEvent: "checkin_day_instructions",
    title: "Dia do Check-in (07:00) • Instruções de Chegada & Acesso",
    description: "Enviado no dia do check-in pontualmente às 07:00 (para reservas feitas antes das 07:00). Inclui endereço, portaria, Wi-Fi, café (se incluso) e botão dinâmico de pré-check-in ou chegada.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "fixed_time_day_of",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "07:00",
    message: `Bom dia, *{{primeiro_nome}}*! ☀️
Hoje é o dia da sua chegada ao *{{nome_hotel}}*!

🔑 *Seu Flat:* {{quarto}}
⏰ *Horário de Check-in:* A partir das {{horario_checkin}}
📍 *Endereço:* {{endereco_hotel}}
🗺️ *Localização no Maps:* {{link_maps}}

Ao chegar, dirija-se à portaria 24h e informe seu nome e o número do seu flat (*{{quarto}}*).

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

{{mensagem_cafe_incluso}}

{{instrucao_checkin_ou_chegada}}

Desejamos uma ótima viagem até aqui! Se precisar de suporte, estamos à disposição.`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_cheguei", type: "URL", label: "📍 Já Cheguei no Flat", url: "{{link_autocheckin}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal da Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_checkin_completed",
    triggerEvent: "checkin_completed",
    title: "Check-in Realizado • Boas-vindas ao Quarto",
    description: "Enviado assim que o hóspede entra e o check-in é concluído no tablet ou sistema.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! Seja muito bem-vindo(a) ao *Flat {{quarto}}*! 🏡✨

Desejamos que você tenha uma estadia incrível e revigorante conosco!

🌿 *Como está tudo por aí?* O flat está fresquinho, limpo e conforme todas as suas expectativas?

Se você notar qualquer detalhe que precise de atenção, desejar solicitar travesseiro extra ou precisar de qualquer auxílio no flat, estamos à sua total disposição por aqui no WhatsApp a qualquer momento!

📱 *Central do Hóspede & Manual:* No link abaixo você confere senhas de acesso, comodidades e regras do condomínio:
{{link_portal_hospede}}`,
    footer: "CorpFlats • Soho Residence Service",
    hasAttachment: false,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue em anexo o Manual do Hóspede em PDF com todas as orientações! 📖",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🌐 Abrir Portal do Flat", url: "{{link_portal_hospede}}" },
      { id: "btn_call", type: "CALL", label: "📞 Ligar Administração", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_breakfast_reminder",
    triggerEvent: "breakfast_reminder",
    title: "Café da Manhã • Montagem da Bandeja (18:00)",
    description: "Enviado às 18:00 da véspera para hóspedes com café que ainda não efetuaram a montagem do pedido.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "fixed_time_day_before",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "18:00",
    message: `Olá, *{{primeiro_nome}}*! ☕🥐
Está na hora de agendar a sua bandeja de café da manhã para amanhã no *Flat {{quarto}}*!

Preparamos tudo fresquinho e entregamos diretamente no seu flat (o serviço é exclusivo no quarto, não servido no restaurante do condomínio).

Escolha seus itens favoritos clicando no botão abaixo:`,
    footer: "CorpFlats • Café no Flat",
    buttons: [
      { id: "btn_cafe", type: "URL", label: "🥐 Montar Café da Manhã", url: "{{link_cafe_manha}}" }
    ]
  },
  {
    id: "tpl_checkout_reminder",
    triggerEvent: "checkout_reminder",
    title: "Dia do Check-out • Orientações de Saída",
    description: "Enviado no dia de saída às 09:30 relembrando o horário limite das 12:00.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "fixed_time_day_of",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "09:30",
    message: `Bom dia, *{{primeiro_nome}}*! ☀️
Lembramos que hoje é a data de encerramento da sua estadia no *Flat {{quarto}}*.

⏰ *Horário limite de saída:* Até às *{{horario_checkout}}*.

Ao sair, por favor certifique-se de desligar luzes e ar-condicionado e entregue as chaves/cartão na portaria.
Caso necessite estender o horário (Late Check-out), solicite diretamente à administração.`,
    footer: "CorpFlats • Agradecemos a visita",
    buttons: [
      { id: "btn_out", type: "URL", label: "🚪 Check-out Expresso", url: "{{link_checkout}}" }
    ]
  },
  {
    id: "tpl_checkout_completed",
    triggerEvent: "checkout_completed",
    title: "Check-out Confirmado • Agradecimento & Encerramento",
    description: "Enviado imediatamente quando o check-out for confirmado (pelo hóspede no link digital ou pela portaria no WhatsApp).",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! 🚪✨
Confirmamos o seu check-out no *Flat {{quarto}}* do *{{nome_hotel}}*.

Agradecemos imensamente pela sua estadia e por todo o cuidado com o nosso espaço! Desejamos um excelente retorno para casa e uma ótima viagem.

Esperamos recebê-lo(a) novamente em breve! 💙`,
    footer: "CorpFlats • Check-out Concluído",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_site", type: "URL", label: "🌐 Reservar Novamente", url: "https://corpflats.onrender.com/reservar" }
    ]
  },
  {
    id: "tpl_nps_satisfaction_check",
    triggerEvent: "post_checkout_review",
    title: "Pós Check-out (24h) • Pesquisa de Satisfação (Filtro NPS)",
    description: "Enviado 24h após o check-out para coletar satisfação interna antes de pedir avaliação no Google. Só hóspedes com nota 5 recebem o link do Google (filtro automático de reputação).",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "after_event",
    offsetValue: 24,
    offsetUnit: "hours",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! 😊

Sua estadia no *{{nome_hotel}}* chegou ao fim e adoraríamos saber como foi!

⭐ *De 1 a 5, que nota você daria para a sua experiência conosco?*

• *5* — Perfeito, tudo impecável! 🏆
• *4* — Muito bom, fiquei satisfeito(a) 😊
• *3* — Ok, mas poderia melhorar 🤔
• *2* — Não ficou bom, tive problemas 😕
• *1* — Péssimo, fiquei muito insatisfeito(a) 😞

Responda apenas com o número da nota (1, 2, 3, 4 ou 5). Sua opinião é muito importante para nós! 💙`,
    footer: "CorpFlats • Sua opinião importa",
    buttons: []
  },
  {
    id: "tpl_post_checkout_review",
    triggerEvent: "nps_approved",
    title: "Pós Check-out • Link Google Review (apenas nota 5) ⭐",
    description: "Enviado automaticamente SOMENTE quando o hóspede responde com nota 5 na pesquisa de satisfação. Protege a reputação no Google evitando avaliações de experiências negativas.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Que alegria, *{{primeiro_nome}}*! 🌟

Fico muito feliz que sua estadia no *{{nome_hotel}}* tenha sido nota máxima! 💙

Você poderia nos dedicar apenas 30 segundos e deixar essa mesma avaliação no Google? Isso nos ajuda a receber mais hóspedes incríveis como você e continuar melhorando nossos serviços:`,
    footer: "CorpFlats • Obrigado pela preferência!",
    buttons: [
      { id: "btn_rev", type: "URL", label: "⭐ Avaliar no Google (5 Estrelas)", url: "{{link_avaliacao_google}}" }
    ]
  },
  {
    id: "tpl_nps_score_4",
    triggerEvent: "nps_score_4",
    title: "Pós Check-out • Retorno Nota 4 (Muito Bom) ⭐⭐⭐⭐",
    description: "Enviado automaticamente quando o hóspede avalia com nota 4 na pesquisa pós-checkout. Agradece a avaliação positiva e convida a digitar o que faltou para a experiência ser nota 5.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Muito obrigado pela sua avaliação, *{{primeiro_nome}}*! 😊💙

Ficamos muito felizes que tenha gostado da estadia no *Flat {{quarto}}* do *{{nome_hotel}}*!

Como buscamos sempre a excelência para nossos hóspedes, *o que você acha que faltou ou o que poderíamos melhorar para que sua próxima experiência conosco seja nota 5?*

Pode digitar aqui mesmo no WhatsApp, sua sugestão vai direto para a nossa gerência! 👇`,
    footer: "CorpFlats • Evoluindo com você",
    buttons: []
  },
  {
    id: "tpl_nps_score_3",
    triggerEvent: "nps_score_3",
    title: "Pós Check-out • Retorno Nota 3 (Regular) ⭐⭐⭐",
    description: "Enviado automaticamente quando o hóspede avalia com nota 3 na pesquisa pós-checkout. Agradece a sinceridade e pergunta o que pode ser melhorado.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! Muito obrigado por responder à nossa pesquisa. 🙏

Vimos que sua experiência no *Flat {{quarto}}* foi avaliada com nota 3 e queremos muito evoluir!

*Você poderia nos contar brevemente o que não saiu como esperado ou o que podemos melhorar no flat e no atendimento?*

Basta digitar sua resposta aqui abaixo. Nossa gerência acompanha cada ponto pessoalmente! 👇`,
    footer: "CorpFlats • Ouvidoria & Qualidade",
    buttons: []
  },
  {
    id: "tpl_nps_score_2",
    triggerEvent: "nps_score_2",
    title: "Pós Check-out • Retorno Nota 2 (Insatisfeito) ⭐⭐",
    description: "Enviado automaticamente quando o hóspede avalia com nota 2 na pesquisa pós-checkout. Pede desculpas e solicita relato para correção imediata.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*. Sentimos muito que sua experiência no *Flat {{quarto}}* do *{{nome_hotel}}* não tenha atendido às suas expectativas. 😔

Nosso compromisso é oferecer sempre uma hospedagem impecável e gostaríamos de corrigir imediatamente qualquer falha.

*Por favor, conte para nós aqui no WhatsApp o que aconteceu durante sua estadia e o que precisamos melhorar:* 👇`,
    footer: "CorpFlats • Atenção Prioritária ao Hóspede",
    buttons: []
  },
  {
    id: "tpl_nps_score_1",
    triggerEvent: "nps_score_1",
    title: "Pós Check-out • Retorno Nota 1 (Crítico / Detrator) ⭐",
    description: "Enviado automaticamente quando o hóspede avalia com nota 1 na pesquisa pós-checkout. Acolhimento prioritário da gerência pedindo detalhes do ocorrido.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*. Pedimos sinceras desculpas por sua experiência no *Flat {{quarto}}* ter sido negativa. 😔🙏

Sua avaliação acendeu um alerta prioritário em nossa gerência e queremos muito entender tudo o que houve para tomarmos providências imediatas.

*Você poderia digitar aqui o que aconteceu ou os pontos que falharam em sua estadia?* Estamos prontos para ouvir você e resolver: 👇`,
    footer: "CorpFlats • Gerência & Ouvidoria",
    buttons: []
  },
  {
    id: "tpl_nps_feedback_thanks",
    triggerEvent: "nps_feedback_thanks",
    title: "Pós Check-out • Agradecimento após Sugestão de Melhoria (Notas 1 a 4) 🙏",
    description: "Enviado automaticamente assim que o hóspede (que deu nota 1 a 4) termina de digitar sua crítica ou sugestão de melhoria.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Muito obrigado pelo seu retorno detalhado, *{{primeiro_nome}}*! 🙏💙

Já registramos suas observações sobre o *Flat {{quarto}}* diretamente em nosso *Plano de Melhorias da Gerência* para providenciarmos os ajustes necessários.

Valorizamos imensamente sua sinceridade — é graças ao seu feedback que evoluímos a cada dia. Esperamos ter a oportunidade de recebê-lo(a) novamente em breve para proporcionar uma experiência 5 estrelas! ✨`,
    footer: "CorpFlats • Obrigado por nos ajudar a melhorar",
    buttons: []
  },
  {
    id: "tpl_reservation_cancelled",
    triggerEvent: "reservation_cancelled",
    title: "Cancelamento de Reserva",
    description: "Enviado imediatamente quando uma reserva for cancelada no sistema.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_hospede}}*.
Confirmamos o cancelamento da sua reserva *{{numero_reserva}}* no *{{nome_hotel}}*.

Lamentamos que não possa se hospedar conosco nesta ocasião e estaremos de braços abertos para recebê-lo em suas próximas viagens a Campos!`,
    footer: "CorpFlats • Central de Reservas",
    buttons: [
      { id: "btn_site", type: "URL", label: "🌐 Reservar Novas Datas", url: "https://corpflats.onrender.com/reservar" }
    ]
  },
  {
    id: "tpl_payment_pending",
    triggerEvent: "payment_pending",
    title: "Cobrança • Pagamento Pendente (+1h pós Pré-Reserva)",
    description: "Enviado 1 hora após a criação da pré-reserva apenas para o solicitante, se ainda não tiver sido paga ou se o status continuar como pré-reserva.",
    enabled: true,
    channels: ["site", "whatsapp", "outros"],
    recipientTarget: "requester",
    triggerTiming: "after_creation",
    offsetValue: 1,
    offsetUnit: "hours",
    fixedTime: "",
    message: `Olá, *{{nome_destinatario}}*! ⏳
Sua pré-reserva no *{{nome_hotel}}* (*Flat {{quarto}}*) foi gerada há 1 hora e permanece *Aguardando Pagamento* para confirmação definitiva.

📋 *Detalhes da Estadia:*
• Código: *{{numero_reserva}}*
• Período: *{{data_checkin}} a {{data_checkout}}*
• Valor Pendente: *{{quanto_falta}}*

Para garantir sua acomodação antes que as datas sejam liberadas, efetue o pagamento via PIX ou parcele em até 12x no cartão pelo portal seguro:
👉 {{link_portal_hospede}}`,
    footer: "CorpFlats • Pagamento Seguro",
    buttons: [
      { id: "btn_pagar", type: "URL", label: "💳 Ver Reserva & Pagar", url: "{{link_portal_hospede}}" },
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "{{link_copiar_pix}}" },
      { id: "btn_chk", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_additional_daily_pending",
    triggerEvent: "additional_daily_pending",
    title: "Diária Extra / Alteração • Cobrança Pendente",
    description: "Disparado quando uma reserva de qualquer canal (inclusive Booking/Airbnb) solicita acréscimo de diária ou serviço adicional e fica com saldo pendente a quitar.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "requester",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_destinatario}}*! 🔄✨
Confirmamos a solicitação de alteração/extensão da sua estadia no *{{nome_hotel}}* (*Flat {{quarto}}*)!

📋 *Resumo Atualizado da Hospedagem:*
• Código da Reserva: *{{numero_reserva}}*
• Período: *{{data_checkin}} até {{data_checkout}}*
• Total de Noites: *{{num_diarias}}*

💰 *Saldo Pendente da Alteração:*
• Valor a Quitar: *{{quanto_falta}}*

Você também pode consultar o extrato detalhado e efetuar o pagamento via PIX ou cartão em seu portal seguro:
👉 {{link_portal_hospede}}`,
    footer: "CorpFlats • Alteração Confirmada",
    buttons: [
      { id: "btn_pagar", type: "URL", label: "💳 Ver Detalhes & Pagar", url: "{{link_portal_hospede}}" },
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "{{link_copiar_pix}}" },
      { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_payment_confirmed",
    triggerEvent: "payment_confirmed",
    title: "Pagamento Confirmado (Site/WhatsApp) • Reserva Garantida",
    description: "Enviado exclusivamente para reservas de Site ou WhatsApp quando uma pré-reserva é quitada e convertida em confirmada. Disparado para o Solicitante e o Hóspede.",
    enabled: true,
    channels: ["site", "whatsapp"],
    recipientTarget: "both",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue em anexo o Manual do Hóspede em PDF com todas as orientações da sua acomodação! 📖",
    message: `Olá, *{{nome_destinatario}}*! 💚🎉
Confirmamos o recebimento do seu pagamento de *{{valor_pago}}* via *{{forma_pagamento}}*!

Sua reserva no *{{nome_hotel}}* está *Garantida & Confirmada*!

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*
• Café da Manhã: *{{status_cafe}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo Restante: *{{quanto_falta}}*

{{instrucao_saldo}}

{{early_checkin_beneficio}}

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria na chegada, realize com antecedência o seu *Pré-Check-in Digital*:`,
    footer: "CorpFlats • Pagamento Aprovado",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_cafe", type: "URL", label: "🥐 Escolher Itens do Café", url: "{{link_cafe_manha}}" }
    ]
  },
  {
    id: "tpl_sameday_reservation_instructions",
    triggerEvent: "sameday_reservation",
    title: "Reserva de Hoje (07:01+) • Confirmação & Instruções Imediatas",
    description: "Disparado imediatamente para reservas confirmadas no próprio dia do check-in a partir das 07:01, consolidando confirmação e orientações de entrada sem envios duplicados.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue em anexo o Manual do Hóspede em PDF com todas as orientações da sua acomodação! 📖",
    message: `Olá, *{{primeiro_nome}}*! 🌟🔑
Sua reserva no *{{nome_hotel}}* para *HOJE* está *Confirmada*!

📋 *Sua Hospedagem:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *Hoje a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Café da Manhã: *{{status_cafe}}*
• Pagamento: *{{status_pagamento}}*

📍 *Endereço:* {{endereco_hotel}}
🗺️ *Localização no Maps:* {{link_maps}}
🚪 *Portaria:* 24 horas (basta se identificar com seu nome e o número do Flat *{{quarto}}*)

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

{{mensagem_cafe_incluso}}

{{instrucao_checkin_ou_chegada}}`,
    footer: "CorpFlats • Entrada Imediata",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_cheguei", type: "URL", label: "📍 Já Cheguei no Flat", url: "{{link_autocheckin}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal da Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_lost_item_registered",
    triggerEvent: "lost_item_registered",
    title: "Achados & Perdidos • Objeto Encontrado no Quarto",
    description: "Enviado automaticamente ao hóspede quando um item esquecido é registrado no Achados & Perdidos, contendo a descrição, foto e o WhatsApp da camareira que o encontrou para combinar a retirada.",
    enabled: true,
    channels: ["all"],
    recipientTarget: "guest",
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_hospede}}*! Tudo bem?

A equipe de governança do *{{nome_hotel}}* identificou que foi esquecido um objeto no *Flat {{quarto}}*{{local_no_quarto}} após o seu check-out.

📦 *Item encontrado:* {{descricao_item}}
{{foto_item}}
👩‍💼 *Encontrado e guardado por:* {{nome_camareira}}
📱 *WhatsApp da Camareira:* {{whatsapp_camareira}}
💬 *Link direto:* {{link_whatsapp_camareira}}

Por favor, entre em contato diretamente com a *{{nome_camareira}}* pelo WhatsApp acima para combinar a retirada ou envio do seu objeto! ✨`,
    footer: "CorpFlats • Governança & Hospitalidade",
    buttons: [
      { id: "btn_contact_maid", type: "URL", label: "Falar com Camareira", url: "{{link_whatsapp_camareira}}" }
    ]
  }
];

// ── Modelos de Mensagens Rápidas Pré-cadastradas (Envio Manual no PMS/Card) ────
export const DEFAULT_WHATSAPP_QUICK_MESSAGES = [
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
    id: "qm_payment_confirmed",
    title: "Confirmar Pagamento & Reserva",
    shortLabel: "Pago & Confirmado",
    icon: "✅",
    description: "Aviso de pagamento aprovado e confirmação de reserva.",
    category: "Financeiro",
    recipientTarget: "requester",
    enabled: true,
    message: `Olá, *{{primeiro_nome}}*! 💚🎉
Confirmamos o recebimento do seu pagamento de *{{valor_pago}}* via *{{forma_pagamento}}*.
Sua reserva no *{{nome_hotel}}* (*Flat {{quarto}}*) para *{{data_checkin}}* está confirmada!

Acesse seu portal para realizar o Pré-Check-in Digital:
{{link_checkin_digital}}`,
    footer: "CorpFlats • Pagamento Aprovado",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Reserva", url: "{{link_portal_hospede}}" }
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

Para agilizar sua entrada na portaria, preencha o *Pré-Check-in Digital*:
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
    buttons: []
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
    title: "Manual do Hóspede (PDF)",
    shortLabel: "Manual PDF",
    icon: "📖",
    description: "Envia o Guia e Manual do Hóspede em anexo com regras e orientações do Flat.",
    category: "Check-in",
    recipientTarget: "guest",
    enabled: true,
    hasAttachment: true,
    documentUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
    documentName: "Manual_do_Hospede_CorpFlats.pdf",
    documentCaption: "Segue o Manual do Hóspede em PDF com todas as orientações! 📖",
    message: `Olá, *{{primeiro_nome}}*! 📖✨
Segue em anexo o *Manual do Hóspede* do *{{nome_hotel}}* com todas as orientações da sua acomodação (instruções dos aparelhos, regras do condomínio e senhas de acesso).

Tenha uma excelente estadia! Se precisar de suporte, estamos à disposição.`,
    footer: "CorpFlats • Guia de Convivência & Acomodação",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" },
      { id: "btn_admin", type: "CALL", label: "📞 Falar com Atendimento", phone: "{{telefone_hotel}}" }
    ]
  }
];


// ── Sanitização de Telefone WhatsApp ───────────────────────────────────────────
export function cleanWhatsAppPhone(rawPhone) {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  
  // Remove zeros à esquerda (ex: 022998505276 -> 22998505276)
  while (digits.startsWith("0")) {
    digits = digits.substring(1);
  }

  // Se tem 10 ou 11 dígitos (DDD + número no Brasil), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    digits = "55" + digits;
  }
  return digits;
}

// ── Comparador Seguro de Telefones com Tolerância a 8/9 Dígitos e DDD ──────────
export function matchClientPhone(phoneA, phoneB) {
  if (!phoneA || !phoneB) return false;
  const cleanA = cleanWhatsAppPhone(phoneA);
  const cleanB = cleanWhatsAppPhone(phoneB);
  if (!cleanA || !cleanB) return false;

  if (cleanA.length < 8 || cleanB.length < 8) return false;
  if (cleanA === cleanB) return true;

  const last8A = cleanA.slice(-8);
  const last8B = cleanB.slice(-8);
  if (last8A !== last8B) return false;

  const getDdd = (clean) => {
    if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
      return clean.slice(2, 4);
    }
    if (clean.length === 10 || clean.length === 11) {
      return clean.slice(0, 2);
    }
    return null;
  };

  const dddA = getDdd(cleanA);
  const dddB = getDdd(cleanB);
  if (dddA && dddB && dddA !== dddB) {
    return false;
  }

  return cleanA.endsWith(last8B) || cleanB.endsWith(last8A);
}

// ── Identificação Persistente de Administrador / Desenvolvedor (Modo Treinador) ──
export const DEVELOPER_PHONES = [
  "22998505276",
  "5522998505276"
];

export function isDeveloperPhone(rawPhone, db = null) {
  if (!rawPhone) return false;
  const digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return false;
  if (DEVELOPER_PHONES.includes(digits)) return true;
  const clean = cleanWhatsAppPhone(digits);
  if (clean === "5522998505276" || clean === "22998505276") return true;
  if ((digits.endsWith("998505276") || digits.endsWith("98505276")) && (clean.startsWith("5522") || digits.startsWith("22"))) {
    return true;
  }
  const configuredDev = db?.whatsappAiSettings?.developerPhone;
  if (configuredDev) {
    const cleanConfig = cleanWhatsAppPhone(configuredDev);
    if (clean === cleanConfig || digits === String(configuredDev).replace(/\D/g, "")) return true;
  }
  return false;
}

// ── Motor de Regras de Exceção e Segmentação por Cliente (FAQ Sofia) ───────────
export function isFaqApplicableToClient(faqItem, clientPhone) {
  if (!faqItem || typeof faqItem !== 'object') return false;
  if (faqItem.status && faqItem.status !== "ativo") return false;

  const scope = faqItem.scope || "all";
  if (scope === "all") return true;

  const rawPhones = Array.isArray(faqItem.clientPhones)
    ? faqItem.clientPhones
    : (typeof faqItem.clientPhones === "string" ? faqItem.clientPhones.split(/[,;\s]+/) : []);
  const clientPhones = rawPhones.map(p => String(p).trim()).filter(Boolean);

  if (!clientPhone) {
    if (scope === "exclude") return true;
    if (scope === "include_only") return false;
    return true;
  }

  const isMatched = clientPhones.some(p => matchClientPhone(clientPhone, p));

  if (scope === "exclude") {
    return !isMatched;
  }

  if (scope === "include_only") {
    if (clientPhones.length === 0) return false;
    return isMatched;
  }

  return true;
}

// ── Rastreamento de Mensagens Enviadas pelo Robô/Sistema ────────────────────────
const recentBotSentMessages = new Map(); // key: phone_normalizedText, val: timestamp
const recentBotMessageIds = new Set();

export function recordBotSentMessage({ messageId = "", phone = "", text = "" } = {}) {
  const now = Date.now();
  if (messageId) {
    recentBotMessageIds.add(String(messageId).trim());
    if (recentBotMessageIds.size > 200) {
      const first = recentBotMessageIds.values().next().value;
      recentBotMessageIds.delete(first);
    }
  }
  const cleanPhone = cleanWhatsAppPhone(phone);
  const cleanText = String(text || "").trim().slice(0, 80);
  if (cleanPhone && cleanText) {
    recentBotSentMessages.set(`${cleanPhone}_${cleanText}`, now);
    if (recentBotSentMessages.size > 200) {
      for (const [k, time] of recentBotSentMessages.entries()) {
        if (now - time > 60000) recentBotSentMessages.delete(k);
      }
    }
  }
}

export function isRecentBotSentMessage({ messageId = "", phone = "", text = "" } = {}) {
  if (messageId && recentBotMessageIds.has(String(messageId).trim())) {
    return true;
  }
  const cleanPhone = cleanWhatsAppPhone(phone);
  const cleanText = String(text || "").trim().slice(0, 80);
  if (cleanPhone && cleanText) {
    const key = `${cleanPhone}_${cleanText}`;
    const timestamp = recentBotSentMessages.get(key);
    if (timestamp && (Date.now() - timestamp) <= 60000) {
      return true;
    }
  }
  return false;
}

/**
 * Identifica se uma mensagem foi gerada automaticamente pela Sofia / Bot / Sistema
 * para impedir que mensagens automáticas do robô sejam capturadas como sugestão humana do operador.
 */
export function isBotMessage(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // 1. Identificação explícita de Sofia / Concierge Virtual / CorpFlats
  if (/\b(?:sou\s+a\s+sofia|concierge\s+virtual|corpflats\s*🏨|posso\s+te\s+ajudar\s+com\s+informa[cç][oõ]es\s+sobre\s+\*?wi-?fi|sou\s+a\s+assistente\s+virtual)\b/i.test(lower)) {
    return true;
  }

  // 2. Mensagens automatizadas de registro/espera de FAQ ou demanda
  if (/\b(?:anotei\s+sua\s+d[uú]vida|como\s+n[aã]o\s+tenho\s+essa\s+informa[cç][aã]o|j[aá]\s+registrei\s+sua\s+pergunta|j[aá]\s+registrei\s+o\s+seu\s+pedido|encaminhei\s+sua\s+solicita[cç][aã]o\s+para\s+a\s+nossa\s+equipe)\b/i.test(lower)) {
    return true;
  }

  // 3. Notificações automáticas de transbordo e comandos de coaching
  if (/\b(?:se\s+preferir\s+falar\s+com\s+um\s+atendente\s+da\s+recep[cç][aã]o|diretriz\s+registrada|aprendizado\s+conclu[ií]do|tom\s+calibrado|comandos?\s+do\s+desenvolvedor)\b/i.test(lower)) {
    return true;
  }

  // 4. Frases padrões de boas-vindas / saudação de robô
  if (/^ol[aá].*?recebi\s+sua\s+mensagem\.\s+sou\s+a\s+sofia/i.test(lower)) {
    return true;
  }

  // 5. Modelos de mensagens rápidas do sistema e Assistente Ativa de Pré-Reservas
  if (/\b(?:corpflats\s*•\s*agradecemos\s+sua\s+prefer[eê]ncia|corpflats\s*•\s*sua\s+opini[aã]o\s+vale\s+muito|corpflats\s*•\s*guia\s+de\s+conviv[eê]ncia|manual_do_hospede_corpflats\.pdf|assistente\s+ativa\s+de\s+pre-reservas|resumo\s+atualizado\s+da\s+pre-reserva|pre-reserva\s+criada\s+com\s+sucesso\s+no\s+sistema|proposta\s+de\s+pre-reserva\s+cancelada|possui\s+conflito\s+de\s+ocupacao\/bloqueio|nao\s+encontrei\s+o\s+\*?flat|nao\s+foi\s+possivel\s+criar\s+a\s+pre-reserva)\b/i.test(lower)) {
    return true;
  }

  return false;
}

// ── Captura Automática da Resposta Humana do Operador (Auto-Aprendizado FAQ) ────
export function linkOperatorResponseToPendingFaq(db, param1, param2) {
  let clientPhone = "";
  let text = "";
  let answeredBy = "operador";
  let senderName = "";

  if (param1 && typeof param1 === "object") {
    clientPhone = param1.clientPhone || param1.phone || "";
    text = param1.text || param1.message || "";
    answeredBy = param1.answeredBy || "operador";
    senderName = param1.senderName || "";
  } else {
    clientPhone = param1 || "";
    text = param2 || "";
  }

  if (!db || !Array.isArray(db.faqItems) || !clientPhone || !text) {
    return null;
  }

  const cleanPhone = cleanWhatsAppPhone(clientPhone);
  if (!cleanPhone) return null;

  // Se a mensagem foi enviada pelo bot/Sofia ou for identificada como mensagem automática da IA:
  if (
    /^(?:sofia|ai|ia|bot|system|sistema)$/i.test(String(answeredBy).trim()) ||
    /^(?:sofia|sofia\s+ai|concierge\s+virtual)$/i.test(String(senderName).trim()) ||
    isBotMessage(text) ||
    isRecentBotSentMessage({ phone: cleanPhone, text })
  ) {
    return null;
  }

  const trimmedText = String(text).trim();
  if (!trimmedText || /^\[(image|audio|video|document|location)\]$/i.test(trimmedText)) {
    return null;
  }

  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 horas

  // Busca itens de FAQ com status "pendente" ou "aguardando_aprovacao" (não aprovados por humano ainda) para o telefone do cliente nas últimas 24h
  const candidates = db.faqItems.filter(item => {
    if (!item) return false;
    const isUnapproved = item.status === "pendente" || (item.status === "aguardando_aprovacao" && !item.approvedAt && item.answeredBy !== "operador");
    if (!isUnapproved) return false;

    // Correspondência pelo sourceClientPhone ou pela lista de clientPhones
    const matchesSource = item.sourceClientPhone && matchClientPhone(item.sourceClientPhone, cleanPhone);
    const matchesList = Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone));
    if (!matchesSource && !matchesList) return false;

    // Verificação da janela de 24 horas
    const itemDateStr = item.createdAt || item.updatedAt;
    if (!itemDateStr) return true;
    const itemTime = new Date(itemDateStr).getTime();
    if (isNaN(itemTime)) return true;

    const diff = now - itemTime;
    return diff >= -300000 && diff <= maxAgeMs;
  });

  if (candidates.length === 0) return null;

  // Ordena decrescente pelo timestamp mais recente
  candidates.sort((a, b) => {
    const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime() || 0;
    return timeB - timeA;
  });

  const targetItem = candidates[0];
  const nowIso = new Date().toISOString();

  // Destilação Conceitual Factual (Anti-Copia-e-Cola):
  // Transforma o par (Dúvida do Hóspede + Resposta do Operador) em regra conceitual viva
  const distilled = distillGuidelineFromOperatorResponse({
    question: targetItem.question,
    response: trimmedText,
    category: targetItem.category || "geral"
  });

  // Salva a diretriz destilada na base viva de conhecimento da IA
  const newGuideline = saveDeveloperGuideline(db, {
    id: targetItem.guidelineId || undefined,
    text: distilled.guidelineText,
    category: distilled.category || targetItem.category || "geral",
    sample: distilled.sampleResponse,
    sampleResponse: distilled.sampleResponse,
    source: "operator_response",
    question: targetItem.question,
    operatorText: trimmedText,
    synthesized: true
  });

  targetItem.operatorRawResponse = trimmedText;
  targetItem.distilledGuideline = distilled.guidelineText;
  targetItem.guidelineId = newGuideline?.id || targetItem.guidelineId || null;

  // Se a resposta humana for curta ("sim", "pode", "Olá! Sim", etc.), sugere a resposta articulada completa
  // Se já for uma frase completa (>= 25 chars), preserva a redação do operador
  const coreResponse = trimmedText
    .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;*\s]*/i, "")
    .trim();
  if (coreResponse.length < 25 && /^(?:sim|n[aã]o|pode|consegue|claro|positivo|temos|tem)\b/i.test(coreResponse)) {
    targetItem.suggestedAnswer = distilled.sampleResponse;
  } else {
    targetItem.suggestedAnswer = trimmedText;
  }

  targetItem.status = "aguardando_aprovacao";
  targetItem.answeredAt = nowIso;
  targetItem.answeredBy = answeredBy;
  targetItem.updatedAt = nowIso;

  // Pausa a IA na conversa deste cliente em db.whatsappConversations (exceto se for desenvolvedor)
  if (Array.isArray(db.whatsappConversations) && !isDeveloperPhone(cleanPhone)) {
    const conv = db.whatsappConversations.find(c => matchClientPhone(c.phone, cleanPhone));
    if (conv && !conv.isDeveloper) {
      conv.aiPaused = true;
      conv.aiPausedAt = nowIso;
      conv.aiPausedReason = "operator_manual_reply";
    }
  }

  return targetItem;
}

export const captureOperatorResponseForFaq = linkOperatorResponseToPendingFaq;

// Referência global ao getter do banco de dados para checagens contextuais (ex: números de camareiras)
let globalDbGetter = null;
export function setZapiGlobalDbGetter(getter) {
  globalDbGetter = typeof getter === "function" ? getter : () => getter;
}

// ── Governança dos 7 Canais Independentes Z-API ─────────────────────────────
export const VALID_ZAPI_CHANNEL_IDS = [
  "guest_schedule",
  "ai_agent",
  "maids",
  "service_providers",
  "reception",
  "stay_operations",
  "transactional_chat"
];

export const DEFAULT_ZAPI_CHANNELS = {
  guest_schedule: {
    id: "guest_schedule",
    name: "Régua de Envios de Hóspedes",
    description: "Confirmações, instruções de check-in, senhas de Wi-Fi, quarto pronto, avisos de saída e pesquisa NPS",
    category: "hospedes",
    enabled: true,
    testMode: true,
    redirectToWhitelistOnTest: false,
    whitelist: ["22998505276", "21997142513"],
    blacklist: [],
    communications: [
      "Confirmação de reserva (Direta / Site / WhatsApp)",
      "Confirmação de reserva (OTA / Booking.com / Airbnb)",
      "Pré-Reserva & Cobrança PIX com código copia-e-cola",
      "Confirmação de Pagamento Recebido",
      "Lembrete de Pré-Check-in Digital (24h antes e reenvio manual)",
      "Confirmação de Check-in Online Concluído e instruções na recepção",
      "Instruções de Chegada & Senhas no dia do check-in (07:00)",
      "Quarto Liberado — Early Check-in Antecipado (Site/WhatsApp)",
      "Quarto Liberado — Informação de Flat às 12:00 (Booking/Airbnb)",
      "Quarto Liberado — Entrada Regular às 14:00",
      "Alerta de higienização em andamento às 14:00 com previsão de chegada",
      "Boas-vindas ao Quarto (Check-in Concluído)",
      "Lembrete de Escolha do Café da Manhã (18:00 da véspera)",
      "Lembrete de Check-out e orientações de saída (09:30)",
      "Check-out Concluído & Agradecimento",
      "Pesquisa de Satisfação NPS (24h pós-saída)",
      "Convite de Avaliação no Google (apenas hóspedes nota 5)",
      "Notificação de Alteração de Reserva (De ➔ Para)",
      "Notificação de Cancelamento de Reserva"
    ]
  },

  ai_agent: {
    id: "ai_agent",
    name: "Agente IA Sofia & Assistente Fiscal",
    description: "Respostas autônomas da Sofia, cotações, pré-reserva, fluxo fiscal NFS-e e transbordo humano",
    category: "ia",
    enabled: true,
    testMode: true,
    redirectToWhitelistOnTest: false,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Respostas autônomas inteligentes da Sofia no WhatsApp",
      "Cotações de tarifas e cálculo dinâmico de diárias",
      "Consulta em tempo real de vagas e flats disponíveis",
      "Pré-reserva conversacional no WhatsApp",
      "Fluxo fiscal automático de coleta de CPF/CNPJ para emissão de NFS-e",
      "Mensagens acolhedoras de transbordo para atendente humano",
      "Mensagens de retificação de dados enviados pelo bot",
      "Coaching contextual do desenvolvedor via WhatsApp (Tom e Diretrizes)"
    ]
  },

  maids: {
    id: "maids",
    name: "Camareiras — Limpeza & Extrato",
    description: "Alertas de limpeza prolongada, resumo diário às 18h, fechamento quinzenal, pagamentos PIX e extrato",
    category: "governanca",
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: true,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Alerta de limpeza prolongada no quarto (>40 min em andamento)",
      "Resumo diário de produtividade às 18:00 com total de quartos",
      "Relatório de fechamento quinzenal (dia 15 e último dia do mês às 18:00)",
      "Comprovante de pagamento PIX e registro de vales (adiantamentos)",
      "Aviso imediato de estorno de pagamento ou vale cancelado",
      "Demonstrativo de extrato financeiro enviado sob demanda"
    ]
  },

  service_providers: {
    id: "service_providers",
    name: "Prestadores de Serviço (OS)",
    description: "Boas-vindas ao vincular OS, aviso de apartamentos liberados e alerta de serviço atrasado",
    category: "manutencao",
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: true,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Mensagem de boas-vindas com link do portal ao vincular OS",
      "Aviso automático de apartamento(s) liberado(s) para execução do serviço",
      "Alerta de serviço atrasado e solicitação de nova previsão de término"
    ]
  },

  reception: {
    id: "reception",
    name: "Recepção, Portaria & Administração",
    description: "Avisos de entrada/garagem de prestadores, início e conclusão de OS com fotos, e monitoramento da portaria",
    category: "portaria",
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: true,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Solicitação de liberação de entrada de prestador no condomínio",
      "Solicitação de liberação de vaga de garagem para prestador",
      "Aviso de início de serviço com previsão informada pelo prestador",
      "Aviso de atraso e atualização de previsão de término de serviço",
      "Aviso de conclusão de serviço pelo prestador com necessidades de limpeza",
      "Envio de fotos anexadas na conclusão do serviço via WhatsApp",
      "Monitoramento do Grupo da Portaria para check-out automático de flats"
    ]
  },

  stay_operations: {
    id: "stay_operations",
    name: "Operações de Estadia (Café & Achados)",
    description: "Avisos de café em preparo e a caminho do quarto, e notificações de objetos esquecidos",
    category: "operacoes",
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: true,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Aviso da cozinha de café da manhã em preparo para entrega no flat",
      "Aviso da cozinha de café da manhã a caminho do quarto",
      "Notificação de objeto esquecido ao hóspede com contato da camareira / recepção"
    ]
  },

  transactional_chat: {
    id: "transactional_chat",
    name: "Chat Ao Vivo & OTP Check-in",
    description: "Códigos OTP de verificação do check-in digital, mensagens do chat ao vivo pelo operador e testes",
    category: "chat",
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: false,
    whitelist: ["22998505276"],
    blacklist: [],
    communications: [
      "Envio de código OTP de segurança para validação do Check-in Digital / FNRH",
      "Mensagens manuais enviadas pelo operador humano no Chat Ao Vivo",
      "Disparos de teste direto de conexão e botões no painel Z-API"
    ]
  }
};

export function matchPhoneNumber(p1, p2) {
  if (!p1 || !p2) return false;
  const d1 = String(p1).replace(/\D/g, "");
  const d2 = String(p2).replace(/\D/g, "");
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const without55_1 = d1.startsWith("55") && d1.length >= 12 ? d1.slice(2) : d1;
  const without55_2 = d2.startsWith("55") && d2.length >= 12 ? d2.slice(2) : d2;
  if (without55_1 === without55_2) return true;
  if (without55_1.length >= 10 && without55_2.length >= 10) {
    const area1 = without55_1.slice(0, 2);
    const area2 = without55_2.slice(0, 2);
    if (area1 !== area2) return false;
    const rest1 = without55_1.slice(2);
    const rest2 = without55_2.slice(2);
    if (rest1 === rest2) return true;
    if (rest1.slice(-8) === rest2.slice(-8)) return true;
  }
  if ((d1.length < 10 || d2.length < 10) && d1.slice(-8) === d2.slice(-8)) {
    return true;
  }
  return false;
}

export function isPhoneInList(phone, list) {
  if (!phone || !Array.isArray(list) || list.length === 0) return false;
  return list.some(item => matchPhoneNumber(phone, item));
}

export function evaluateZapiChannelPolicy(configOrOptions, maybeOptions = {}) {
  const isSingleObjectCall = Boolean(
    configOrOptions &&
    typeof configOrOptions === "object" &&
    !maybeOptions?.phone &&
    (configOrOptions.phone !== undefined || configOrOptions.channelId !== undefined || configOrOptions.config !== undefined)
  );
  const config = isSingleObjectCall ? (configOrOptions.config || configOrOptions.db?.zapiConfig || configOrOptions) : configOrOptions;
  const options = isSingleObjectCall ? configOrOptions : (maybeOptions || {});

  const {
    phone,
    channelId,
    recipientRole = "",
    triggerEvent = "",
    message = "",
    db = null,
    bypassTestMode = false
  } = options;

  const rawPhone = phone || "";
  let cleanPhone = cleanWhatsAppPhone(rawPhone) || String(rawPhone).replace(/\D/g, "");
  if (cleanPhone && !cleanPhone.startsWith("55") && (cleanPhone.length === 10 || cleanPhone.length === 11)) {
    cleanPhone = `55${cleanPhone}`;
  }
  if (!cleanPhone) {
    return {
      allowed: false,
      reason: "Número de WhatsApp do destinatário inválido ou ausente.",
      reasonCode: "invalid_phone",
      targetPhone: "",
      effectivePhone: ""
    };
  }

  // 1. Resolver canal correspondente
  let resolvedChannelId = channelId;
  if (!resolvedChannelId || !VALID_ZAPI_CHANNEL_IDS.includes(resolvedChannelId)) {
    const roleLower = String(recipientRole || "").toLowerCase();
    const eventLower = String(triggerEvent || "").toLowerCase();

    if (roleLower === "camareira" || roleLower === "cleaner") {
      resolvedChannelId = "maids";
    } else if (roleLower === "service_worker" || roleLower === "prestador") {
      resolvedChannelId = (eventLower.startsWith("service_order_") && !eventLower.includes("overdue") && !eventLower.includes("worker") && !eventLower.includes("room_available")) ? "reception" : "service_providers";
    } else if (roleLower === "reception" || roleLower === "recepcao" || roleLower === "portaria" || roleLower === "garagem" || roleLower === "admin") {
      resolvedChannelId = "reception";
    } else if (roleLower === "developer" || roleLower === "ia") {
      resolvedChannelId = "ai_agent";
    } else if (roleLower === "operator") {
      resolvedChannelId = "transactional_chat";
    } else if (eventLower.startsWith("maid_")) {
      resolvedChannelId = "maids";
    } else if (eventLower.includes("overdue_alert") || eventLower.includes("worker_registered") || eventLower.includes("room_available")) {
      resolvedChannelId = "service_providers";
    } else if (eventLower.startsWith("service_order_")) {
      resolvedChannelId = "reception";
    } else if (eventLower.startsWith("breakfast_") || eventLower.startsWith("lost_item")) {
      resolvedChannelId = "stay_operations";
    } else if (eventLower.startsWith("pre_checkin_otp") || eventLower.startsWith("otp_") || eventLower.startsWith("chat_")) {
      resolvedChannelId = "transactional_chat";
    } else if (eventLower.startsWith("ai_")) {
      resolvedChannelId = "ai_agent";
    } else {
      resolvedChannelId = "guest_schedule";
    }
  }

  // 2. Obter configurações do canal
  const activeChannels = config?.channels || db?.zapiConfig?.channels || null;
  const defaultChannel = DEFAULT_ZAPI_CHANNELS[resolvedChannelId] || {
    id: resolvedChannelId,
    name: resolvedChannelId,
    enabled: true,
    testMode: false,
    redirectToWhitelistOnTest: false,
    whitelist: ["22998505276"],
    blacklist: []
  };

  let fallbackOverrides = {};
  if (!activeChannels || !activeChannels[resolvedChannelId]) {
    const legacyPhones = String(config?.testAllowedPhones || db?.zapiConfig?.testAllowedPhones || "")
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (resolvedChannelId === "guest_schedule") {
      const legacyEnabled = config?.enabled ?? db?.zapiConfig?.enabled;
      const legacyTest = config?.testModeOnly ?? db?.zapiConfig?.testModeOnly;
      fallbackOverrides = {
        enabled: legacyEnabled !== undefined ? Boolean(legacyEnabled) : defaultChannel.enabled,
        testMode: legacyTest !== undefined ? Boolean(legacyTest) : false,
        whitelist: legacyPhones.length > 0 ? Array.from(new Set([...defaultChannel.whitelist, ...legacyPhones])) : defaultChannel.whitelist
      };
    } else if (resolvedChannelId === "ai_agent") {
      const aiAgentCfg = config?.aiAgent || db?.zapiConfig?.aiAgent || {};
      const legacyTest = aiAgentCfg.testMode !== undefined
        ? Boolean(aiAgentCfg.testMode)
        : (config?.testModeOnly ?? db?.zapiConfig?.testModeOnly ?? false);
      fallbackOverrides = {
        enabled: aiAgentCfg.enabled !== undefined ? Boolean(aiAgentCfg.enabled) : defaultChannel.enabled,
        testMode: Boolean(legacyTest),
        whitelist: legacyPhones.length > 0 ? Array.from(new Set([...defaultChannel.whitelist, ...legacyPhones])) : defaultChannel.whitelist
      };
    }
  }

  const channel = {
    ...defaultChannel,
    ...fallbackOverrides,
    ...(activeChannels?.[resolvedChannelId] || {})
  };

  // 3. Regra 1: Canal desativado / pausado
  if (channel.enabled === false) {
    return {
      allowed: false,
      reason: `Canal ${channel.name || resolvedChannelId} está pausado.`,
      reasonCode: "channel_paused",
      blockedByChannelPause: true,
      channelId: resolvedChannelId,
      targetPhone: cleanPhone,
      effectivePhone: cleanPhone
    };
  }

  // 4. Regra 2: Blacklist (bloqueio absoluto, mesmo em produção)
  if (Array.isArray(channel.blacklist) && channel.blacklist.length > 0) {
    if (isPhoneInList(cleanPhone, channel.blacklist)) {
      return {
        allowed: false,
        reason: `Telefone ${cleanPhone} está na lista de bloqueio (Blacklist) do canal ${channel.name || resolvedChannelId}.`,
        reasonCode: "blacklisted",
        blockedByBlacklist: true,
        channelId: resolvedChannelId,
        targetPhone: cleanPhone,
        effectivePhone: cleanPhone
      };
    }
  }

  // 5. Regra 3: Modo de Teste
  if (channel.testMode === true && !bypassTestMode) {
    const isWhitelisted = isPhoneInList(cleanPhone, channel.whitelist);
    if (isWhitelisted) {
      return {
        allowed: true,
        testMode: true,
        redirected: false,
        testRedirect: false,
        targetPhone: cleanPhone,
        effectivePhone: cleanPhone,
        effectiveMessage: message,
        channelId: resolvedChannelId
      };
    }

    // Se não está na Whitelist, verifica se tem redirecionamento ativado
    if (channel.redirectToWhitelistOnTest === true && Array.isArray(channel.whitelist) && channel.whitelist.length > 0) {
      const rawTarget = channel.whitelist[0];
      let targetPhone = cleanWhatsAppPhone(rawTarget) || String(rawTarget).replace(/\D/g, "");
      if (!targetPhone.startsWith("55") && targetPhone.length <= 11) {
        targetPhone = `55${targetPhone}`;
      }

      const displayOriginal = typeof formatPhoneDisplay === "function" ? formatPhoneDisplay(cleanPhone) : cleanPhone;
      const channelName = channel.name || resolvedChannelId;
      const redirectHeader = `🧪 *[MODO TESTE • Canal: ${channelName}]*\n📍 *Destinatário original:* ${displayOriginal} (não enviado ao nº real)\n─────────────────────\n`;

      return {
        allowed: true,
        testMode: true,
        redirected: true,
        testRedirect: true,
        targetPhone,
        effectivePhone: targetPhone,
        originalPhone: cleanPhone,
        redirectHeader,
        effectiveMessage: message ? `${redirectHeader}${message}` : redirectHeader,
        channelId: resolvedChannelId
      };
    }

    // Bloqueado pela Whitelist
    return {
      allowed: false,
      reason: `Disparo bloqueado: Canal ${channel.name || resolvedChannelId} em Modo de Teste e telefone ${cleanPhone} não está na Whitelist.`,
      reasonCode: "not_in_whitelist",
      blockedByWhitelist: true,
      blockedByTestMode: true,
      channelId: resolvedChannelId,
      targetPhone: cleanPhone,
      effectivePhone: cleanPhone
    };
  }

  // 6. Regra 4: Modo Produção (testMode: false)
  return {
    allowed: true,
    testMode: false,
    redirected: false,
    testRedirect: false,
    targetPhone: cleanPhone,
    effectivePhone: cleanPhone,
    effectiveMessage: message,
    channelId: resolvedChannelId
  };
}

export function ensureZapiChannels(dbOrConfig) {
  if (!dbOrConfig) return {};
  const isDirectConfig = !dbOrConfig.zapiConfig && (
    dbOrConfig.channels !== undefined ||
    dbOrConfig.testModeOnly !== undefined ||
    dbOrConfig.testAllowedPhones !== undefined ||
    dbOrConfig.instanceId !== undefined ||
    (!dbOrConfig.reservations && !dbOrConfig.whatsappConversations && !dbOrConfig.whatsappAiSettings && dbOrConfig.enabled !== undefined)
  );
  const cfg = isDirectConfig ? dbOrConfig : (dbOrConfig.zapiConfig || (dbOrConfig.zapiConfig = {}));
  if (!cfg.channels) cfg.channels = {};

  for (const [chId, defCh] of Object.entries(DEFAULT_ZAPI_CHANNELS)) {
    if (!cfg.channels[chId]) {
      cfg.channels[chId] = JSON.parse(JSON.stringify(defCh));
    } else {
      const ch = cfg.channels[chId];
      if (ch.enabled === undefined) ch.enabled = defCh.enabled;
      if (ch.testMode === undefined) ch.testMode = defCh.testMode;
      if (ch.redirectToWhitelistOnTest === undefined) ch.redirectToWhitelistOnTest = defCh.redirectToWhitelistOnTest;
      if (!Array.isArray(ch.whitelist)) ch.whitelist = [...defCh.whitelist];
      if (!Array.isArray(ch.blacklist)) ch.blacklist = [...defCh.blacklist];
      if (!ch.name) ch.name = defCh.name;
      if (!ch.description) ch.description = defCh.description;
      if (!ch.category) ch.category = defCh.category;
      if (!Array.isArray(ch.communications)) ch.communications = [...defCh.communications];
    }
  }
  return cfg.channels;
}

export function syncChannelsBidirectional(db, source = "channels") {
  if (!db || !db.zapiConfig) return;
  ensureZapiChannels(db);
  const channels = db.zapiConfig.channels;

  if (source === "root") {
    if (db.zapiConfig.enabled !== undefined) {
      channels.guest_schedule.enabled = Boolean(db.zapiConfig.enabled);
    }
    if (db.zapiConfig.testModeOnly !== undefined) {
      channels.guest_schedule.testMode = Boolean(db.zapiConfig.testModeOnly);
    }
    if (db.zapiConfig.testAllowedPhones !== undefined) {
      const phones = String(db.zapiConfig.testAllowedPhones)
        .split(/[,;\s\n]+/)
        .map(p => cleanWhatsAppPhone(p))
        .filter(Boolean);
      if (phones.length > 0) {
        channels.guest_schedule.whitelist = Array.from(new Set([...channels.guest_schedule.whitelist, ...phones]));
      }
    }
    if (db.whatsappAiSettings) {
      if (db.whatsappAiSettings.enabled !== undefined) {
        channels.ai_agent.enabled = Boolean(db.whatsappAiSettings.enabled);
      }
      if (db.whatsappAiSettings.testModeOnly !== undefined) {
        channels.ai_agent.testMode = Boolean(db.whatsappAiSettings.testModeOnly);
      }
    }
  } else {
    if (channels.guest_schedule) {
      db.zapiConfig.enabled = Boolean(channels.guest_schedule.enabled);
      db.zapiConfig.testModeOnly = Boolean(channels.guest_schedule.testMode);
      if (Array.isArray(channels.guest_schedule.whitelist) && channels.guest_schedule.whitelist.length > 0) {
        db.zapiConfig.testAllowedPhones = channels.guest_schedule.whitelist.join(", ");
      }
    }
    if (channels.ai_agent) {
      if (!db.whatsappAiSettings) db.whatsappAiSettings = {};
      db.whatsappAiSettings.enabled = Boolean(channels.ai_agent.enabled);
      db.whatsappAiSettings.testModeOnly = Boolean(channels.ai_agent.testMode);
      if (db.zapiConfig.aiAgent) {
        db.zapiConfig.aiAgent.enabled = Boolean(channels.ai_agent.enabled);
        db.zapiConfig.aiAgent.testModeOnly = Boolean(channels.ai_agent.testMode);
      }
    }
  }
}

// ── Verificação de Whitelist / Modo de Teste (Sandbox) ─────────────────────────
// Números sempre liberados no Modo de Teste (além de testAllowedPhones e camareiras):
// - 22998505276: Miller Mendonça (gestor / desenvolvedor)
// - 21997142513: hóspede de teste liberado para receber as mensagens programadas
export const DEFAULT_TEST_ALLOWED_PHONES = [
  "22998505276", "5522998505276",
  "21997142513", "5521997142513"
];

export function isPhoneAllowedInTestMode(phone, config = {}, db = null) {
  // Se testModeOnly for false explicitamente, estamos em produção total (todos permitidos)
  if (config?.testModeOnly === false) {
    return true;
  }

  if (!phone) return false;
  const targetDigits = String(phone).replace(/\D/g, "");
  if (!targetDigits) return false;

  // Miller Mendonça (gestor do hotel / desenvolvedor) + hóspedes de teste liberados
  const defaultAllowed = DEFAULT_TEST_ALLOWED_PHONES;

  // Telefones autorizados configurados pelo usuário
  const userConfigured = String(config?.testAllowedPhones || "")
    .split(/[,;\s\n]+/)
    .map(p => p.replace(/\D/g, ""))
    .filter(Boolean);

  const allAllowed = [...defaultAllowed, ...userConfigured];

  // 1. Checagem direta na whitelist de telefones
  const isDirectlyAllowed = allAllowed.some(allowed => {
    if (!allowed) return false;
    if (targetDigits === allowed) return true;
    if (targetDigits.endsWith(allowed) && allowed.length >= 8) return true;
    if (allowed.endsWith(targetDigits) && targetDigits.length >= 8) return true;
    return false;
  });

  if (isDirectlyAllowed) {
    return true;
  }

  const activeDb = db || (typeof globalDbGetter === "function" ? globalDbGetter() : null);

  // 2. Camareiras e equipe interna: permitidas por padrão mesmo em modo de teste
  //    (para que seus resumos diários às 18:00 e alertas de limpeza continuem sendo disparados normalmente)
  if (config?.allowMaidsInTestMode !== false) {
    if (activeDb && Array.isArray(activeDb.users)) {
      const isStaffOrMaid = activeDb.users.some(u => {
        if (u.active === false) return false;
        const role = String(u.role || "").toLowerCase();
        if (role !== "camareira" && role !== "cleaner" && role !== "admin") return false;
        const rawUserPhone = u.whatsapp || u.phone;
        if (!rawUserPhone) return false;
        const userDigits = String(rawUserPhone).replace(/\D/g, "");
        if (!userDigits) return false;
        return userDigits === targetDigits || 
               (userDigits.endsWith(targetDigits) && targetDigits.length >= 8) || 
               (targetDigits.endsWith(userDigits) && userDigits.length >= 8);
      });
      if (isStaffOrMaid) {
        return true;
      }
    }
  }

  // 3. Módulo de Prestadores de Serviço (serviceWorkers e serviceOrders): liberado para qualquer número cadastrado no módulo
  if (activeDb) {
    const matchesTarget = (rawPhone) => {
      if (!rawPhone) return false;
      const digits = String(rawPhone).replace(/\D/g, "");
      if (!digits || digits.length < 8) return false;
      return digits === targetDigits ||
             (digits.endsWith(targetDigits) && targetDigits.length >= 8) ||
             (targetDigits.endsWith(digits) && digits.length >= 8);
    };

    if (Array.isArray(activeDb.serviceWorkers)) {
      const isServiceWorker = activeDb.serviceWorkers.some(w => matchesTarget(w?.mainWorker?.phone || w?.phone));
      if (isServiceWorker) return true;
    }

    if (Array.isArray(activeDb.serviceOrders)) {
      const isInServiceOrder = activeDb.serviceOrders.some(o => {
        if (matchesTarget(o?.workerPhone)) return true;
        if (Array.isArray(o?.notificationRecipients)) {
          return o.notificationRecipients.some(r => r && r.enabled !== false && matchesTarget(r.phone));
        }
        return false;
      });
      if (isInServiceOrder) return true;
    }
  }

  return false;
}

// ── Cancelamento em Massa de Hóspedes Reais da Fila ────────────────────────────
export function cancelRealGuestsFromQueue(db, saveDatabase) {
  if (!db || !Array.isArray(db.whatsappQueue)) return { cancelledCount: 0 };

  let cancelledCount = 0;
  const nowIso = new Date().toISOString();

  for (const item of db.whatsappQueue) {
    if (item.status === "scheduled") {
      const allowed = isPhoneAllowedInTestMode(item.guestPhone, db?.zapiConfig);
      if (!allowed) {
        item.status = "cancelled";
        item.error = "Cancelado pelo Modo de Teste / Sandbox: destinatário não está na lista de telefones autorizados.";
        item.updatedAt = nowIso;
        cancelledCount++;
      }
    }
  }

  if (cancelledCount > 0 && typeof saveDatabase === "function") {
    saveDatabase();
  }

  return { cancelledCount };
}

// ── Formatação de Datas em pt-BR ──────────────────────────────────────────────
function formatDateBr(isoDate) {
  if (!isoDate) return "";
  const parts = String(isoDate).substring(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Formatação de Alterações da Reserva para o WhatsApp (De ➔ Para) ─────────
export const FINANCIAL_CHANGE_FIELDS = new Set([
  "totalAmount",
  "paidAmount",
  "paymentStatus",
  "dailyRate",
  "paymentMethod"
]);

export function hasNonFinancialChanges(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) return true;
  return changes.some(c => c && !FINANCIAL_CHANGE_FIELDS.has(String(c.field || "")));
}

export function formatWhatsAppChangesSummary(changes = [], options = {}) {
  const excludeFinancial = Boolean(options?.excludeFinancial);
  const filteredChanges = Array.isArray(changes)
    ? (excludeFinancial ? changes.filter(c => c && !FINANCIAL_CHANGE_FIELDS.has(String(c.field || ""))) : changes)
    : [];

  if (filteredChanges.length === 0) {
    return "• *Status da Reserva:* Atualizada no sistema.";
  }

  const lines = [];

  for (const c of filteredChanges) {
    if (!c) continue;
    let label = c.label || c.field;
    let oldV = c.oldValue;
    let newV = c.newValue;

    // Normaliza rótulos para comunicação direta e amigável com o hóspede
    if (c.field === "flatNumber") label = "Acomodação / Quarto";
    if (c.field === "checkinDate") label = "Data de Entrada (Check-in)";
    if (c.field === "checkoutDate") label = "Data de Saída (Check-out)";
    if (c.field === "checkinTime") label = "Horário de Entrada";
    if (c.field === "checkoutTime") label = "Horário de Saída";
    if (c.field === "totalAmount") label = "Valor Total";
    if (c.field === "paidAmount") label = "Valor Pago";
    if (c.field === "paymentStatus") label = "Situação do Pagamento";
    if (c.field === "guestCount" || c.field === "adults") label = "Total de Hóspedes";
    if (c.field === "includeBreakfast") label = "Café da Manhã";
    if (c.field === "twinBeds") label = "Configuração de Camas";
    if (c.field === "extraMattress") label = "Colchão Extra";
    if (c.field === "prefersHighFloor") label = "Andar Alto";
    if (c.field === "guestName") label = "Hóspede Titular";
    if (c.field === "vehiclePlate") label = "Veículo / Garagem";

    // Formata datas YYYY-MM-DD -> DD/MM/YYYY
    if (typeof oldV === "string" && /^\d{4}-\d{2}-\d{2}$/.test(oldV.trim())) {
      oldV = formatDateBr(oldV.trim());
    }
    if (typeof newV === "string" && /^\d{4}-\d{2}-\d{2}$/.test(newV.trim())) {
      newV = formatDateBr(newV.trim());
    }

    // Formata booleanos
    if (typeof oldV === "boolean" || oldV === "Sim" || oldV === "Não") {
      oldV = (oldV === true || oldV === "Sim") ? "Sim" : "Não";
    }
    if (typeof newV === "boolean" || newV === "Sim" || newV === "Não") {
      newV = (newV === true || newV === "Sim") ? "Sim" : "Não";
    }

    // Formata café da manhã
    if (c.field === "includeBreakfast") {
      oldV = (oldV === "Sim" || oldV === true || oldV === "Incluso") ? "Incluso" : "Não incluso";
      newV = (newV === "Sim" || newV === true || newV === "Incluso") ? "Incluso" : "Não incluso";
    }

    // Formata camas de solteiro
    if (c.field === "twinBeds") {
      oldV = (oldV === "Sim" || oldV === true) ? "2 Camas de Solteiro" : "Cama de Casal";
      newV = (newV === "Sim" || newV === true) ? "2 Camas de Solteiro" : "Cama de Casal";
    }

    // Formata status de pagamento
    if (c.field === "paymentStatus") {
      const mapPay = {
        pago: "Confirmado / Pago (100%)",
        pago_total: "Confirmado / Pago (100%)",
        pendente: "Aguardando Pagamento",
        parcial: "Sinal Pago / Parcial",
        estornado: "Estornado"
      };
      if (mapPay[String(oldV).toLowerCase()]) oldV = mapPay[String(oldV).toLowerCase()];
      if (mapPay[String(newV).toLowerCase()]) newV = mapPay[String(newV).toLowerCase()];
    }

    // Formata quantidade de hóspedes
    if (c.field === "guestCount" || c.field === "adults") {
      const nOld = parseInt(oldV, 10);
      const nNew = parseInt(newV, 10);
      if (!isNaN(nOld)) oldV = `${nOld} ${nOld === 1 ? 'pessoa' : 'pessoas'}`;
      if (!isNaN(nNew)) newV = `${nNew} ${nNew === 1 ? 'pessoa' : 'pessoas'}`;
    }

    // Formata valores monetários se forem números puros
    if (c.field === "totalAmount" || c.field === "paidAmount" || c.field === "dailyRate") {
      if (typeof oldV === "number" || (typeof oldV === "string" && !oldV.includes("R$"))) {
        const n = Number(oldV) || 0;
        oldV = formatCurrency(n);
      }
      if (typeof newV === "number" || (typeof newV === "string" && !newV.includes("R$"))) {
        const n = Number(newV) || 0;
        newV = formatCurrency(n);
      }
    }

    const hasOld = oldV !== undefined && oldV !== null && oldV !== "" && oldV !== "(vazio)" && oldV !== "null";
    if (hasOld && String(oldV) !== String(newV)) {
      lines.push(`• *${label}:* ${oldV} ➔ *${newV}*`);
    } else {
      lines.push(`• *${label}:* *${newV}*`);
    }
  }

  return lines.join("\n");
}

// ── Identificação Unificada de Destinatários (Hóspede, Acompanhantes e Solicitante) ──
function normalizeEmailAddress(raw) {
  const email = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function getReservationRecipients(reservation = {}, db = {}) {
  const guestName = (reservation.guestName || reservation.guests?.[0]?.name || "Hóspede").trim();
  const guestFirstName = guestName.split(" ")[0] || guestName;
  const rawGuestPhone = reservation.guestPhone || reservation.guests?.[0]?.phone || "";
  const cleanGuestDigits = String(rawGuestPhone).replace(/\D/g, "");
  const guestEmail = normalizeEmailAddress(reservation.guestEmail || reservation.guests?.[0]?.email);

  let requesterName = "";
  let requesterPhone = "";
  let requesterEmail = "";
  let requesterType = reservation.requesterType || "guest";
  if (requesterType === "guest") {
    if (reservation.companyId || reservation.companyName) {
      requesterType = "company";
    } else if (
      reservation.requesterInfo &&
      (reservation.requesterInfo.name || reservation.requesterInfo.phone || reservation.requesterInfo.email)
    ) {
      requesterType = "other_person";
    }
  }
  let requesterCompany = "";

  if (requesterType === "other_person" && reservation.requesterInfo) {
    requesterName = (reservation.requesterInfo.name || "").trim();
    requesterPhone = (reservation.requesterInfo.phone || "").trim();
    requesterEmail = normalizeEmailAddress(reservation.requesterInfo.email);
  } else if (requesterType === "company") {
    requesterCompany = reservation.companyName || "";
    let companyObj = null;
    if (reservation.companyId && db?.companies) {
      companyObj = db.companies.find(c => String(c.id) === String(reservation.companyId));
    }
    if (!companyObj && reservation.companyName && db?.companies) {
      companyObj = db.companies.find(c => 
        c.tradeName?.toLowerCase() === reservation.companyName?.toLowerCase() ||
        c.corporateName?.toLowerCase() === reservation.companyName?.toLowerCase()
      );
    }
    if (companyObj) {
      requesterName = (companyObj.contactPerson || companyObj.tradeName || reservation.companyName || "Solicitante Corporativo").trim();
      requesterPhone = (companyObj.phone || "").trim();
      requesterEmail = normalizeEmailAddress(companyObj.email || companyObj.financialEmail);
      requesterCompany = companyObj.tradeName || companyObj.corporateName || requesterCompany;
    } else {
      requesterName = reservation.companyName || "Solicitante Corporativo";
    }
  }

  const requesterHasOwnPhone = Boolean(requesterPhone);
  const requesterHasOwnEmail = Boolean(requesterEmail);
  const requesterHasOwnContact = requesterHasOwnPhone || requesterHasOwnEmail;
  if (!requesterName) {
    requesterName = guestName;
  }
  // Fallback estrito: só usa telefone/e-mail do hóspede se o solicitante não possuir NENHUM contato próprio (nem telefone, nem e-mail)
  if (!requesterHasOwnContact) {
    if (!requesterPhone) {
      requesterPhone = rawGuestPhone;
    }
    if (!requesterEmail) {
      requesterEmail = guestEmail;
    }
  }

  const requesterFirstName = requesterName.split(" ")[0] || requesterName;
  const cleanRequesterDigits = String(requesterPhone).replace(/\D/g, "");
  const isDifferentFromGuest = Boolean(
    (cleanRequesterDigits && cleanGuestDigits && cleanRequesterDigits !== cleanGuestDigits) ||
    (requesterEmail && guestEmail && requesterEmail !== guestEmail) ||
    (requesterType !== "guest" && requesterHasOwnContact) ||
    (requesterType !== "guest" && requesterName && requesterName.toLowerCase() !== guestName.toLowerCase())
  );

  // Acompanhantes (2º, 3º hóspede...) cadastrados no PMS com WhatsApp e/ou e-mail
  const companions = [];
  const guestList = Array.isArray(reservation.guests) ? reservation.guests : [];
  guestList.forEach((g, idx) => {
    if (!g || idx === 0) return;
    const index = Number(g.index) > 1 ? Number(g.index) : idx + 1;
    const phone = String(g.phone || g.whatsapp || "").trim();
    const email = normalizeEmailAddress(g.email);
    if (!phone && !email) return;
    const rawName = String(g.name || "").trim();
    const isPlaceholder = !rawName || /^h[óo]spede\s*\d*$/i.test(rawName);
    const name = isPlaceholder ? "Hóspede" : rawName;
    companions.push({
      index,
      type: `guest_${index}`,
      name,
      firstName: name.split(" ")[0] || name,
      phone,
      cleanDigits: phone.replace(/\D/g, ""),
      email,
      hasCompletedCheckin: Boolean(g.hasCompletedCheckin || g.status === "CHECKED_IN")
    });
  });

  return {
    guest: {
      name: guestName,
      firstName: guestFirstName,
      phone: rawGuestPhone,
      cleanDigits: cleanGuestDigits,
      email: guestEmail
    },
    companions,
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
  };
}

// ── Régua de Acompanhantes: eventos financeiros nunca vão para o 2º/3º hóspede ──
export const COMPANION_EXCLUDED_EVENTS = new Set([
  "pre_reservation_created",
  "payment_pending",
  "additional_daily_pending",
  "payment_confirmed"
]);

// ── Cobrança / PIX puro: quando há solicitante distinto, vai EXCLUSIVAMENTE ao solicitante ──
export const PURE_BILLING_EVENTS = new Set([
  "pre_reservation_created",
  "payment_pending",
  "additional_daily_pending"
]);

export const PURE_BILLING_TEMPLATE_IDS = new Set([
  "tpl_pre_reserva",
  "tpl_payment_pending",
  "tpl_additional_daily_pending",
  "qm_payment_pending",
  "qm_payment_confirmed"
]);

export function isPureBillingTemplateOrEvent(tplOrEvent) {
  if (!tplOrEvent) return false;
  if (typeof tplOrEvent === "string") {
    return PURE_BILLING_EVENTS.has(tplOrEvent) || PURE_BILLING_TEMPLATE_IDS.has(tplOrEvent);
  }
  const id = String(tplOrEvent.id || "").trim();
  const ev = String(tplOrEvent.triggerEvent || "").trim();
  return PURE_BILLING_TEMPLATE_IDS.has(id) || PURE_BILLING_EVENTS.has(ev);
}

export function shouldIncludeCompanions(tpl) {
  if (typeof tpl?.includeCompanions === "boolean") return tpl.includeCompanions;
  return !COMPANION_EXCLUDED_EVENTS.has(String(tpl?.triggerEvent || ""));
}

export function shouldMirrorTemplateToEmail(tpl) {
  return tpl?.sendEmail !== false;
}

/** Retorna o acompanhante correspondente a um targetRecipient "guest_2" / "guest_3" ou objeto de destinatário */
export function getCompanionForTarget(recipients, targetRecipient) {
  if (!recipients) return null;
  if (targetRecipient && typeof targetRecipient === "object") {
    const rawIdx = targetRecipient.guestIndex || targetRecipient.index;
    if (rawIdx && Number(rawIdx) > 1) {
      return (recipients.companions || []).find(c => c.index === Number(rawIdx)) || targetRecipient;
    }
    if (String(targetRecipient.type || "").startsWith("guest_")) {
      const matchObj = /^guest_(\d+)$/.exec(String(targetRecipient.type));
      if (matchObj) return (recipients.companions || []).find(c => c.index === Number(matchObj[1])) || null;
    }
  }
  const match = /^guest_(\d+)$/.exec(String(targetRecipient || ""));
  if (!match) return null;
  return (recipients.companions || []).find(c => c.index === Number(match[1])) || null;
}

/**
 * Monta a lista única de destinatários de um template (hóspede, solicitante e acompanhantes),
 * cada um com telefone (WhatsApp) e/ou e-mail. Remove contatos repetidos por canal.
 */
export function buildTemplateTargets(tpl, recipients, options = {}) {
  const guest = recipients.guest;
  const requester = recipients.requester;
  const isPureBilling = isPureBillingTemplateOrEvent(tpl);
  const isNewReservationConfirm = tpl?.id === "tpl_new_reservation_direct" || tpl?.id === "tpl_new_reservation";

  let targetMode = options.targetMode || tpl?.recipientTarget || "guest";
  if (requester?.isDifferentFromGuest) {
    if (isPureBilling) {
      targetMode = "requester";
    } else if (isNewReservationConfirm && !options.targetMode && requester.hasOwnContact) {
      targetMode = "both";
    }
  }

  const includeEmail = options.includeEmail !== undefined ? options.includeEmail : shouldMirrorTemplateToEmail(tpl);
  const onlyGuestIdx = options.onlyGuestIndex ? Number(options.onlyGuestIndex) : 0;
  const raw = [];
  const guestTarget = () => ({ type: "guest", guestIndex: 1, name: guest.name, phone: guest.phone, email: guest.email });
  const requesterHasOwnContact = requester?.hasOwnContact !== undefined
    ? Boolean(requester.hasOwnContact)
    : Boolean(requester?.isDifferentFromGuest && (requester?.phone || requester?.email));

  if (onlyGuestIdx > 1 && !(requester?.isDifferentFromGuest && isPureBilling)) {
    const matchedComp = (recipients.companions || []).find(c => Number(c.index) === onlyGuestIdx);
    if (matchedComp && (matchedComp.phone || matchedComp.email)) {
      raw.push({
        type: matchedComp.type || `guest_${onlyGuestIdx}`,
        guestIndex: matchedComp.index,
        name: matchedComp.name,
        phone: matchedComp.phone,
        email: matchedComp.email,
        hasCompletedCheckin: matchedComp.hasCompletedCheckin
      });
    } else if (guest.phone || guest.email) {
      raw.push({
        type: `guest_${onlyGuestIdx}`,
        guestIndex: onlyGuestIdx,
        name: matchedComp?.name || `Hóspede ${onlyGuestIdx}`,
        phone: matchedComp?.phone || guest.phone,
        email: matchedComp?.email || guest.email,
        hasCompletedCheckin: true
      });
    }
  } else {
    if (targetMode === "guest" || targetMode === "both") {
      if (guest.phone || guest.email) raw.push(guestTarget());
    }

    if (targetMode === "requester" || targetMode === "both") {
      if (targetMode === "requester" || requester.isDifferentFromGuest) {
        if (requester.phone || requester.email) {
          raw.push({ type: "requester", guestIndex: null, name: requester.name, phone: requester.phone, email: requester.email });
        } else if (targetMode === "requester" && (!requester.isDifferentFromGuest || !requesterHasOwnContact) && (guest.phone || guest.email)) {
          raw.push(guestTarget());
        }
      }
    }

    if (raw.length === 0 && (guest.phone || guest.email)) {
      if (!(targetMode === "requester" && requester?.isDifferentFromGuest && requesterHasOwnContact)) {
        raw.push(guestTarget());
      }
    }

    if (onlyGuestIdx !== 1 && (targetMode === "guest" || targetMode === "both") && shouldIncludeCompanions(tpl)) {
      for (const c of (recipients.companions || [])) {
        raw.push({ type: c.type, guestIndex: c.index, name: c.name, phone: c.phone, email: c.email, hasCompletedCheckin: c.hasCompletedCheckin });
      }
    }
  }

  const seenPhones = new Set();
  const seenEmails = new Set();
  const seenTypes = new Set();
  const targets = [];
  for (const t of raw) {
    if (seenTypes.has(t.type)) continue;
    const digits = String(t.phone || "").replace(/\D/g, "");
    const phoneKey = digits ? digits.slice(-8) : "";
    let phone = t.phone || "";
    let email = includeEmail ? normalizeEmailAddress(t.email) : "";
    if (phoneKey && seenPhones.has(phoneKey)) phone = "";
    if (email && seenEmails.has(email)) email = "";
    if (!phone && !email) continue;
    if (phoneKey && phone) seenPhones.add(phoneKey);
    if (email) seenEmails.add(email);
    seenTypes.add(t.type);
    targets.push({ ...t, phone, email });
  }
  return targets;
}

/** Indica se a reserva possui algum contato (WhatsApp ou e-mail) para a régua automática */
export function reservationHasAnyContact(reservation = {}, db = {}) {
  if (reservation.guestPhone || reservation.guestEmail) return true;
  const r = getReservationRecipients(reservation, db);
  return Boolean(r.guest.phone || r.guest.email || r.requester.email || r.companions.length > 0);
}

export function getRecipientTypeLabel(type) {
  if (type === "requester") return "Solicitante";
  const m = /^guest_(\d+)$/.exec(String(type || ""));
  if (m) return `${m[1]}º Hóspede`;
  return "Hóspede";
}

const EMAIL_SUBJECT_BY_EVENT = {
  pre_reservation_created: "Pré-reserva recebida • Aguardando pagamento",
  reservation_created: "Sua reserva está confirmada",
  payment_confirmed: "Pagamento confirmado",
  payment_pending: "Pagamento pendente da sua reserva",
  additional_daily_pending: "Diária adicional pendente",
  sameday_reservation: "Sua reserva para hoje • Instruções de chegada",
  room_ready: "Seu flat está pronto",
  room_ready_ota: "Seu flat está pronto",
  room_ready_regular: "Seu flat está pronto",
  checkin_cleaning_delay: "Atualização sobre a liberação do seu flat",
  reservation_updated: "Sua reserva foi atualizada",
  reservation_cancelled: "Reserva cancelada",
  pre_checkin_reminder: "Lembrete: faça seu pré-check-in digital",
  pre_checkin_completed: "Check-in online concluído • Instruções para sua chegada",
  checkin_day_instructions: "Instruções para o seu check-in",
  checkin_completed: "Boas-vindas ao seu flat",
  breakfast_reminder: "Escolha seu café da manhã",
  checkout_reminder: "Lembrete de check-out",
  checkout_completed: "Check-out realizado • Obrigado pela estadia",
  on_checkout: "Check-out realizado • Obrigado pela estadia",
  post_checkout_review: "Como foi sua estadia?",
  nps_approved: "Como foi sua estadia?"
};

/** Assunto do e-mail espelhado: usa o assunto customizado do template ou um assunto amigável por evento */
export function buildMirrorEmailSubject(tpl, reservation = {}, db = {}, baseUrl = "", targetRecipient = "guest") {
  const recipients = getReservationRecipients(reservation, db);
  const targetType = targetRecipient && typeof targetRecipient === "object" ? targetRecipient.type : targetRecipient;
  const hideFinancialForGuest = Boolean(recipients.requester?.isDifferentFromGuest && targetType !== "requester");

  const custom = String(tpl?.emailSubject || "").trim();
  if (custom) {
    let resolvedCustom = resolveWhatsAppTags(custom, reservation, db, baseUrl, targetRecipient, tpl).replace(/\s+/g, " ").trim();
    if (hideFinancialForGuest) {
      resolvedCustom = resolvedCustom
        .replace(/Pagamento\s+Confirmado/gi, "Reserva Confirmada")
        .replace(/Pagamento\s+Pendente/gi, "Informações da Reserva");
    }
    return resolvedCustom;
  }
  const hotelName = db?.siteConfig?.branding?.brandName || "CorpFlats";
  const event = String(tpl?.triggerEvent || "");
  let label = EMAIL_SUBJECT_BY_EVENT[event] || "Informações da sua reserva";
  if (hideFinancialForGuest && event === "payment_confirmed") {
    label = EMAIL_SUBJECT_BY_EVENT.reservation_created;
  }
  const resCode = reservation.code || reservation.reservationCode || "";
  return [hotelName, label, resCode ? `Reserva ${resCode}` : ""].filter(Boolean).join(" • ");
}

/**
 * Envia o espelho por e-mail de uma mensagem da régua (texto e botões já renderizados).
 * Respeita a chave "Motor de e-mails automáticos" (metadata.isAutomated).
 */
export function sendMirrorEmail(db, saveDatabase, {
  reservation = null,
  reservationCode = null,
  reservationId = null,
  email,
  recipientName = "",
  recipientType = "guest",
  templateId = null,
  triggerEvent = null,
  subject = "",
  message = "",
  buttons = [],
  footer = "",
  documentUrl = "",
  documentName = "",
  baseUrl = "",
  source = "auto"
}) {
  try {
    if (!db || !email || !message) return null;
    const appOrigin = baseUrl || (typeof process !== "undefined" && process.env?.APP_BASE_URL) || "https://corpflats.onrender.com";
    const rendered = renderWhatsAppMirrorEmail({
      message,
      buttons,
      footer,
      subject,
      documentUrl,
      documentName,
      appOrigin,
      settings: { hotelName: db?.siteConfig?.branding?.brandName || "CorpFlats" }
    });
    const resRef = reservationCode || reservation?.code || reservation?.reservationCode || reservationId || reservation?.id || "0";
    return sendEmailAsync({
      db,
      saveDatabase,
      reservationId: resRef,
      recipient: email,
      subject: rendered.subject,
      bodyHtml: rendered.bodyHtml,
      bodyText: rendered.bodyText,
      type: "email",
      direction: "outbound",
      metadata: {
        isAutomated: true,
        channel: "whatsapp_mirror",
        trigger: triggerEvent,
        templateId,
        recipientType,
        recipientName,
        guestName: reservation?.guestName || recipientName,
        source
      }
    });
  } catch (err) {
    console.error("[E-mail Espelho] Falha ao preparar e-mail:", err.message);
    return null;
  }
}

// ── Motor de Resolução de Tags Dinâmicas ───────────────────────────────────────
export function resolveWhatsAppTags(text, reservation = {}, db = {}, baseUrl = "", targetRecipient = "guest", templateOrEvent = null) {
  if (!text) return "";

  const templateId = String(templateOrEvent?.id || (typeof templateOrEvent === "string" ? templateOrEvent : "")).trim();
  const triggerEvent = String(templateOrEvent?.triggerEvent || (typeof templateOrEvent === "string" ? templateOrEvent : "")).trim();

  const recipients = getReservationRecipients(reservation, db);
  const guest = recipients.guest;
  const requester = recipients.requester;
  // Acompanhante (2º/3º hóspede) como destinatário: saudação e link de check-in são dele
  const companion = getCompanionForTarget(recipients, targetRecipient);
  const recipientGuestIndex = companion 
    ? (companion.index || companion.guestIndex || 1) 
    : (targetRecipient && typeof targetRecipient === "object" && (targetRecipient.guestIndex || targetRecipient.index)
        ? Number(targetRecipient.guestIndex || targetRecipient.index)
        : 1);

  const recipientIsRequester = targetRecipient === "requester" || (targetRecipient && typeof targetRecipient === "object" && targetRecipient.type === "requester");
  const hideFinancialForGuest = Boolean(requester.isDifferentFromGuest && !recipientIsRequester);
  const primaryRecipientName = companion ? companion.name : (recipientIsRequester ? requester.name : guest.name);
  const primaryRecipientFirstName = companion ? companion.firstName : (recipientIsRequester ? requester.firstName : guest.firstName);
  const primaryRecipientPhone = companion ? companion.phone : (recipientIsRequester ? requester.phone : guest.phone);

  const guestName = companion ? companion.name : guest.name;
  const firstName = primaryRecipientFirstName;
  const flatNumber = reservation.flatNumber || reservation.flatId || "Pendente";
  const resCode = reservation.code || reservation.reservationCode || `RES-${flatNumber}-${reservation.id || "0000"}`;
  
  const checkinBr = formatDateBr(reservation.checkinDate);
  const checkoutBr = formatDateBr(reservation.checkoutDate);
  
  const checkinTime = db.settings?.checkinTime || "14:00";
  const checkoutTime = db.settings?.checkoutTime || "12:00";
  
  const guestCount = reservation.guestCount || reservation.adults || 1;
  const chanLower = String(reservation.channel || "").toLowerCase();
  const totalAmount = Number(reservation.totalAmount) || 0;
  const paidAmount = Number(reservation.paidAmount) || 0;
  const pendingAmount = Math.max(0, totalAmount - paidAmount);
  const pixKey = db.settings?.interConfig?.pixKey || db.settings?.pixKey || "47.964.813/0001-65";
  const titularPix = "CorpFlats Ltda (Banco Inter)";

  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
  const isPaid = isOta || reservation.paymentStatus === "pago" || reservation.paymentStatus === "pago_total" || (paidAmount >= totalAmount && totalAmount > 0);

  let paymentStatus = "Aguardando Pagamento";
  if (isPaid) {
    paymentStatus = "Confirmado / Pago (100%)";
  } else if (paidAmount > 0 && pendingAmount > 0) {
    paymentStatus = `Sinal Pago (${formatCurrency(paidAmount)})`;
  }
  const channel = reservation.channel || "Site CorpFlats";

  const rawMethod = String(reservation.paymentMethod || "").toLowerCase();
  let formaPagamento = "PIX";
  if (
    rawMethod.includes("cart") ||
    rawMethod.includes("card") ||
    rawMethod.includes("credit") ||
    rawMethod.includes("mercadopago") ||
    rawMethod.includes("infinite") ||
    (reservation.mpPaymentId && !reservation.pixEndToEndId)
  ) {
    formaPagamento = rawMethod.includes("debito") || rawMethod.includes("débito")
      ? "Cartão de Débito"
      : "Cartão de Crédito";
  } else if (rawMethod.includes("booking")) {
    formaPagamento = "Booking.com";
  } else if (rawMethod.includes("airbnb")) {
    formaPagamento = "Airbnb";
  } else if (rawMethod.includes("dinheiro") || rawMethod.includes("especie")) {
    formaPagamento = "Dinheiro";
  } else {
    formaPagamento = "PIX";
  }

  // URL Base pública do sistema (prioriza domínio de produção ou host)
  const appOrigin = baseUrl || "https://corpflats.onrender.com";

  const resStatus = String(reservation.status || "").toLowerCase().trim();
  const isCancelled = resStatus === "cancelada" || resStatus === "cancelled" || resStatus === "cancelado";
  const isBreakfastExplicitTemplate = templateId === "qm_breakfast" || templateId === "tpl_breakfast_reminder" || triggerEvent === "breakfast_reminder";
  const hasBreakfast = Boolean(reservation.includeBreakfast || reservation.hasBreakfast || reservation.ratePlan === "with_breakfast" || isBreakfastExplicitTemplate);

  // Links inteligentes com autenticação por código de reserva
  const linkCheckinDigital = getCheckinUrlSync(reservation, recipientGuestIndex, appOrigin, db);
  const linkPortalHospede = recipientGuestIndex && Number(recipientGuestIndex) > 1 
    ? `${appOrigin}/minha-reserva/${resCode}?guest=${recipientGuestIndex}` 
    : `${appOrigin}/minha-reserva/${resCode}`;
  const linkPagamento = `${appOrigin}/minha-reserva/${resCode}`;
  const linkCopiarPix = `${appOrigin}/copiar-pix/${resCode}`;
  const linkCafeManha = (hasBreakfast || isBreakfastExplicitTemplate) && !isCancelled ? `${appOrigin}/cafe/${resCode}` : "";
  const linkCheckout = `${appOrigin}/checkout/${resCode}`;

  let instrucaoPagamento = "";
  if (paidAmount === 0) {
    instrucaoPagamento = `Para garantir e confirmar definitivamente sua acomodação, efetue o pagamento via PIX ou cartão de crédito pelo portal do hóspede:\n👉 ${linkPortalHospede}`;
  } else if (paidAmount > 0 && pendingAmount > 0) {
    instrucaoPagamento = `Identificamos o pagamento parcial de *${formatCurrency(paidAmount)}*. O saldo restante de *${formatCurrency(pendingAmount)}* poderá ser quitado pelo portal:\n👉 ${linkPortalHospede}`;
  } else {
    instrucaoPagamento = "Reserva 100% quitada! Nenhuma pendência financeira.";
  }

  let instrucaoSaldo = "";
  if (pendingAmount > 0) {
    instrucaoSaldo = `ℹ️ *Aviso de Pagamento:* Resta o saldo de *${formatCurrency(pendingAmount)}*, que poderá ser quitado pelo link seguro do seu portal:\n👉 ${linkPortalHospede}`;
  } else {
    instrucaoSaldo = "";
  }

  // Código PIX Copia e Cola da transação integrada (Inter ou payload oficial)
  let pixCopiaECola = reservation.pixCopiaECola || "";
  if (!pixCopiaECola && pendingAmount > 0) {
    const cleanTxId = (resCode || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);
    pixCopiaECola = generateStaticPixPayload({
      pixKey: db.settings?.interConfig?.pixKey || db.settings?.pixKey || "47964813000165",
      amount: pendingAmount,
      merchantName: db.siteConfig?.branding?.brandName || "CORPFLATS LTDA",
      merchantCity: "CAMPOS DOS GOYTACAZES",
      txid: cleanTxId || "***"
    });
    if (reservation && typeof reservation === "object") {
      reservation.pixCopiaECola = pixCopiaECola;
    }
  }

  const statusConfirmacao = reservation.status === "confirmada" ? "Confirmada" : "Pré-Reserva";
  
  const hotelName = db.siteConfig?.branding?.brandName || "CorpFlats";
  const hotelAddress = db.settings?.hotelAddress || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ";
  const mapsUrl = db.settings?.googleMapsUrl || "https://share.google/LHu3541d5lhkdvbL2";
  
  const zapiCfg = db.zapiConfig || {};
  const wifiNetwork = flatNumber ? `apto ${flatNumber}` : (zapiCfg.wifiNetwork || "apto {quarto}");
  const wifiPassword = zapiCfg.wifiPassword || "1234567890123";
  const adminWhatsApp = db.settings?.adminWhatsApp || "5522997124021";
  const googleReviewUrl = zapiCfg.googleReviewUrl || "https://share.google/LHu3541d5lhkdvbL2";

  let totalNights = 1;
  if (reservation.checkinDate && reservation.checkoutDate) {
    const d1 = new Date(reservation.checkinDate);
    const d2 = new Date(reservation.checkoutDate);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) totalNights = diff;
  }

  // ── Tag: {{early_checkin_beneficio}} ────────────────────────────────────────
  // Mostrar benefício de early check-in apenas para reservas com chegada futura
  // OU para o próprio dia do check-in quando criadas com pelo menos 30min de antecedência.
  let earlyCheckinBeneficio = "";
  if (reservation.checkinDate) {
    const checkinDate = reservation.checkinDate;
    const todayStr = new Date().toISOString().substring(0, 10);
    const isSameDayCheckin = checkinDate === todayStr;
    const isFutureCheckin = checkinDate > todayStr;

    const earlyCheckinText = `🎁 *Benefício Exclusivo — Early Check-in a partir das 10:00:*\nComo você reservou diretamente conosco, você tem direito à entrada antecipada a partir das 10:00, *ESTRITAMENTE MEDIANTE DISPONIBILIDADE* (depende da desocupação do hóspede anterior e da conclusão da limpeza). Assim que o flat estiver pronto pela governança, você receberá a notificação por aqui!`;

    if (isFutureCheckin) {
      earlyCheckinBeneficio = earlyCheckinText;
    } else if (isSameDayCheckin) {
      const now = new Date();
      const [ciHour, ciMin] = checkinTime.split(":").map(Number);
      const checkinDeadline = new Date();
      checkinDeadline.setHours(ciHour, ciMin - 30, 0, 0); // 30 min antes do check-in
      if (now < checkinDeadline) {
        earlyCheckinBeneficio = earlyCheckinText;
      }
    }
  }

  // ── Tag: {{resumo_alteracoes}} ────────────────────────────────────────────
  // Formata a lista de campos alterados (apenas o que mudou, De ➔ Para)
  let resumoAlteracoes = "";
  const changes = reservation._changesContext || [];
  if (Array.isArray(changes) && changes.length > 0) {
    resumoAlteracoes = formatWhatsAppChangesSummary(changes, { excludeFinancial: hideFinancialForGuest });
  }
  if (!resumoAlteracoes) {
    resumoAlteracoes = "• *Status da Reserva:* Dados atualizados no sistema.";
  }

  // Tag de link de autodeclaração de checkin ("Já cheguei / Estou no Flat")
  const linkAutocheckin = `${appOrigin}/api/pms/guest-portal/${resCode}/self-checkin`;

  // Tag: {{status_cafe}} e {{mensagem_cafe_incluso}}
  const statusCafe = isCancelled ? "Cancelado" : (hasBreakfast ? "Incluso" : "Não incluso");
  const mensagemCafeIncluso = (hasBreakfast && !isCancelled)
    ? `🥐 *Café da Manhã Incluso:*\nSua diária inclui nosso café da manhã servido exclusivamente no seu flat! Você já pode agendar sua bandeja pelo botão abaixo.`
    : "";

  const titularGuest = (reservation.guests || []).find(g => Number(g.index) === 1) || reservation.guests?.[0];
  const isTitularDone = titularGuest 
    ? Boolean(titularGuest.hasCompletedCheckin || titularGuest.status === "CHECKED_IN")
    : Boolean(reservation.fnhrCompleted || reservation.preCheckinCompleted || reservation.checkedInAt);

  const allCheckedIn = Boolean(
    reservation.fnhrCompleted ||
    (Array.isArray(reservation.guests) && reservation.guests.length > 0 && reservation.guests.every(g => g.hasCompletedCheckin || g.status === "CHECKED_IN")) ||
    (!reservation.guests?.length && (reservation.preCheckinCompleted || reservation.checkedInAt))
  );
  const hasEnteredFlat = Boolean(
    reservation.guestSelfCheckin ||
    reservation.actualCheckinAt ||
    reservation.status === "in_house" ||
    (reservation.status === "checkin" && reservation.guestSelfCheckin)
  );
  const isPreCheckinDone = companion 
    ? Boolean(companion.hasCompletedCheckin || companion.status === "CHECKED_IN") 
    : isTitularDone;

  // Tag: {{instrucao_checkin_ou_chegada}}
  let instrucaoCheckinOuChegada = "";
  if (hasEnteredFlat) {
    instrucaoCheckinOuChegada = `🏡 *Check-in Concluído:* Sua entrada já foi confirmada! Acesse todos os detalhes da sua estadia pelo botão abaixo:`;
  } else if (isPreCheckinDone) {
    instrucaoCheckinOuChegada = `✅ *Pré-Check-in Concluído:* Seus dados já foram enviados à portaria! Ao chegar no condomínio, clique no botão abaixo para autodeclarar sua entrada no flat:`;
  } else {
    instrucaoCheckinOuChegada = `👉 *Pré-Check-in Digital Obrigatório:*\nPara liberação imediata na portaria do condomínio, preencha sua ficha rápida pelo botão abaixo:`;
  }

  // Tag: {{mensagem_pendencia_hospedes}} (Lógica de 1 vs 2 hóspedes)
  const isMultiGuest = (reservation.guestCount > 1 || reservation.adults > 1);
  const firstGuestDone = Boolean(reservation.guests?.[0]?.hasCompletedCheckin || reservation.guests?.[0]?.status === "CHECKED_IN");
  let mensagemPendenciaHospedes = "Para que a portaria do condomínio libere sua entrada imediatamente na chegada, pedimos que adiante o cadastro dos hóspedes pelo link abaixo:";
  if (companion) {
    // O próprio acompanhante recebe a mensagem: pede apenas a ficha dele
    mensagemPendenciaHospedes = companion.hasCompletedCheckin
      ? `Recebemos com sucesso a sua ficha de Check-in Digital, *${companion.firstName}*! Sua entrada já está autorizada na portaria.`
      : `Para que a portaria do condomínio libere sua entrada imediatamente na chegada, pedimos que adiante o seu cadastro (ficha individual do acompanhante) pelo link abaixo:`;
  } else if (isMultiGuest && firstGuestDone) {
    const linkCheckinDigitalGuest2 = getCheckinUrlSync(reservation, 2, appOrigin, db);
    mensagemPendenciaHospedes = `Recebemos com sucesso a ficha de Check-in Digital do(a) *${guest.firstName || guest.name}*, porém ainda está pendente o cadastro do *2º hóspede* para autorização na portaria.\n\nPor favor, repasse este link ao segundo acompanhante para preenchimento:\n👉 ${linkCheckinDigitalGuest2}\n\n💡 _Caso vá viajar sozinho(a), basta confirmar em seu portal ou responder por aqui para atualizarmos sua reserva para 1 hóspede sem pendências._`;
  }

  // Tag: {{aviso_checkin_pendente}}
  const avisoCheckinPendente = !isPreCheckinDone
    ? `⚠️ *Atenção:* Notamos que sua ficha de Pré-Check-in Digital ainda está pendente. Para liberação imediata na portaria do condomínio, preencha agora pelo botão abaixo.`
    : "";

  // Tag: {{aviso_pendencia_segundo_hospede}} (Portaria e Informativos)
  const avisoPendenciaSegundoHospede = (isMultiGuest && firstGuestDone && !allCheckedIn)
    ? `⚠️ *Atenção Portaria:* Apenas o *Hóspede 1 (${guest.firstName || guest.name})* realizou o pré-check-in digital e está *LIBERADO* para check-in. O *2º hóspede AINDA NÃO ESTÁ LIBERADO* para entrada; estamos aguardando o preenchimento digital de sua ficha para autorização de acesso ao flat.`
    : "";

  // Tag: {{aviso_acompanhante_pendente_pos_checkin}} (Confirmação Pós Check-in Online do Titular)
  let avisoAcompanhantePendentePosCheckin = "";
  const hasMultipleGuests = isMultiGuest || (Array.isArray(reservation.guests) && reservation.guests.length > 1);
  if (!companion && Number(recipientGuestIndex) === 1 && hasMultipleGuests && !allCheckedIn) {
    const pendingCompanions = (reservation.guests || []).filter(g => Number(g.index) > 1 && !g.hasCompletedCheckin && g.status !== "CHECKED_IN");
    const nextPendingIdx = pendingCompanions.length > 0 ? Number(pendingCompanions[0].index) : 2;
    const linkCheckinDigitalNextPending = getCheckinUrlSync(reservation, nextPendingIdx, appOrigin, db);
    avisoAcompanhantePendentePosCheckin = `👥 *Acompanhante Pendente (${nextPendingIdx}º Hóspede):*\nNotamos que sua reserva possui acompanhante que ainda não preencheu a ficha individual. Para que a entrada dele(a) também já fique liberada na recepção, envie o link abaixo para preenchimento:\n👉 ${linkCheckinDigitalNextPending}\n\n💡 _Caso vá se hospedar sozinho(a), você pode atualizar para 1 hóspede diretamente no Portal do Hóspede._`;
  }

  const tagsMap = {
    "{{nome_hospede}}": guestName,
    "{{primeiro_nome}}": firstName,
    "{{telefone_hospede}}": guest.phone || "",
    "{{nome_solicitante}}": requester.name,
    "{{primeiro_nome_solicitante}}": requester.firstName,
    "{{telefone_solicitante}}": requester.phone || "",
    "{{empresa_solicitante}}": requester.company || "",
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
    "{{valor_total}}": hideFinancialForGuest ? "" : formatCurrency(totalAmount),
    "{{valor_pago}}": hideFinancialForGuest ? "" : formatCurrency(paidAmount),
    "{{quanto_falta}}": hideFinancialForGuest ? "" : formatCurrency(pendingAmount),
    "{{saldo_restante}}": hideFinancialForGuest ? "" : formatCurrency(pendingAmount),
    "{{valor_restante}}": hideFinancialForGuest ? "" : formatCurrency(pendingAmount),
    "{{chave_pix}}": hideFinancialForGuest ? "" : pixKey,
    "{{titular_pix}}": hideFinancialForGuest ? "" : titularPix,
    "{{pix_copia_e_cola}}": hideFinancialForGuest ? "" : pixCopiaECola,
    "{{instrucao_pagamento}}": hideFinancialForGuest ? "" : instrucaoPagamento,
    "{{instrucao_saldo}}": hideFinancialForGuest ? "" : instrucaoSaldo,
    "{{status_confirmacao}}": statusConfirmacao,
    "{{status_pagamento}}": hideFinancialForGuest ? "" : paymentStatus,
    "{{canal_reserva}}": channel,
    "{{nome_hotel}}": hotelName,
    "{{endereco_hotel}}": hotelAddress,
    "{{link_maps}}": mapsUrl,
    "{{wifi_rede}}": wifiNetwork,
    "{{wifi_senha}}": wifiPassword,
    "{{telefone_hotel}}": adminWhatsApp,
    "{{link_checkin_digital}}": linkCheckinDigital,
    "{{link_portal_hospede}}": linkPortalHospede,
    "{{link_pagamento}}": hideFinancialForGuest ? "" : linkPagamento,
    "{{link_copiar_pix}}": hideFinancialForGuest ? "" : linkCopiarPix,
    "{{link_pix}}": hideFinancialForGuest ? "" : linkCopiarPix,
    "{{link_cafe_manha}}": linkCafeManha,
    "{{link_checkout}}": linkCheckout,
    "{{link_avaliacao_google}}": googleReviewUrl,
    "{{link_autocheckin}}": linkAutocheckin,
    "{{status_cafe}}": statusCafe,
    "{{mensagem_cafe_incluso}}": mensagemCafeIncluso,
    "{{instrucao_checkin_ou_chegada}}": instrucaoCheckinOuChegada,
    "{{mensagem_pendencia_hospedes}}": mensagemPendenciaHospedes,
    "{{aviso_checkin_pendente}}": avisoCheckinPendente,
    "{{aviso_pendencia_segundo_hospede}}": avisoPendenciaSegundoHospede,
    "{{aviso_acompanhante_pendente_pos_checkin}}": avisoAcompanhantePendentePosCheckin,
    "{{link_guia_hospede}}": zapiCfg.guestGuidePdfUrl || `${appOrigin}/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf`,
    "{{link_manual_hospede}}": zapiCfg.guestGuidePdfUrl || `${appOrigin}/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf`,
    "{{early_checkin_beneficio}}": earlyCheckinBeneficio,
    "{{forma_pagamento}}": hideFinancialForGuest ? "" : formaPagamento,
    "{{data_pagamento}}": formatDateBr(reservation.paidAt || new Date().toISOString()),
    "{{resumo_alteracoes}}": resumoAlteracoes,
    "{{nome_camareira}}": reservation.maidName || reservation.foundBy || "Camareira",
    "{{whatsapp_camareira}}": reservation.maidPhone || "",
    "{{link_whatsapp_camareira}}": reservation.maidWhatsAppUrl || (reservation.maidPhone ? `https://wa.me/55${String(reservation.maidPhone).replace(/\D/g, "").replace(/^55/, "")}` : ""),
    "{{descricao_item}}": reservation.description || reservation.itemDescription || "",
    "{{local_no_quarto}}": reservation.locationInRoom ? ` (${reservation.locationInRoom})` : "",
    "{{foto_item}}": (reservation.photoUrl && (reservation.photoUrl.startsWith("http://") || reservation.photoUrl.startsWith("https://"))) ? `📸 *Foto do item:* ${reservation.photoUrl}\n` : ""
  };

  let rendered = text;
  if (hideFinancialForGuest) {
    rendered = rendered
      .replace(/Confirmamos o recebimento do seu pagamento[^\n]*A sua reserva está \*100% garantida\*! 🎉/gi, "A sua reserva está *100% confirmada e garantida*! 🎉")
      .replace(/Confirmamos o recebimento do seu pagamento[^\n]*\n*/gi, "")
      .replace(/💰\s*\*Situação Financeira:\*[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/💰\s*\*Saldo Pendente da Alteração:\*[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/💳\s*\*Dados para Pagamento[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/📋\s*\*PIX Copia e Cola[\s\S]*?(?=\n\n|$)/gi, "")
      .replace(/^[ \t]*•[ \t]*\*?(Pagamento|Valor Total[^\n:]*|Quanto foi Pago|Valor Pago|Saldo a Quitar|Saldo Restante|Quanto Falta[^\n:]*|Situação do Pagamento|Chave PIX|Favorecido|Forma de Pagamento)\*?:[^\n]*\n?/gim, "");
  }

  for (const [tag, val] of Object.entries(tagsMap)) {
    rendered = rendered.split(tag).join(val !== undefined && val !== null ? String(val) : "");
  }

  if (hideFinancialForGuest) {
    rendered = rendered.replace(/^[ \t]*•[^:\n]+:[ \t]*(\*\*[ \t]*)?(\([ \t]*\))?[ \t]*\n?/gm, "");
  }

  // Remove excesso de quebras de linha decorrentes de tags opcionais vazias
  rendered = rendered.replace(/\n{3,}/g, "\n\n").trim();

  return rendered;
}

// ── Formatador de Mensagem com Links Clicáveis (100% compatível com qualquer WhatsApp) ──
export function formatMessageWithLinks(message, footer = "", buttons = []) {
  let text = (message || "").trim();
  let validButtons = (buttons || []).filter(b => b && b.label && (b.url || b.phone || b.copyCode || b.type === "REPLY" || b.type === "COPY"));

  // Blindagem de segurança: Se a mensagem contiver termos claros de check-out, cancelamento ou pós-estadia,
  // nunca incluir links ou botões de café da manhã (/cafe/ ou btn_cafe) no Acesso Rápido!
  const lowerMsg = text.toLowerCase();
  const isCheckoutOrEndStay = lowerMsg.includes("check-out") || 
                              lowerMsg.includes("checkout") || 
                              lowerMsg.includes("encerramento da sua estadia") || 
                              lowerMsg.includes("horário limite de saída");
  const isCancellation = lowerMsg.includes("cancelamento") || 
                         lowerMsg.includes("cancelada") || 
                         lowerMsg.includes("cancelado");
  const isReviewOnly = lowerMsg.includes("avaliação") || 
                       lowerMsg.includes("satisfação") || 
                       lowerMsg.includes("como foi sua experiência");

  if (isCheckoutOrEndStay || isCancellation || isReviewOnly) {
    validButtons = validButtons.filter(b => b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
  }

  if (validButtons.length > 0) {
    const linkItems = validButtons
      .filter(b => b && (b.url || b.phone || b.copyCode || b.type === "COPY"))
      .map(b => {
        if (b.type === "CALL" || b.phone) {
          const phoneStr = String(b.phone).trim();
          if (phoneStr && text.includes(phoneStr)) return null;
          return `📞 *${b.label}:* ${b.phone}`;
        }
        if (b.type === "COPY" || b.copyCode) {
          const code = b.copyCode || b.code || (b.url && b.url.startsWith("000201") ? b.url : "");
          if (code) {
            if (text.includes(code)) return null;
            return `📋 *${b.label} (PIX Copia e Cola):*\n\`${code}\``;
          }
        }
        const urlStr = String(b.url || "").trim();
        const normUrl = urlStr.replace(/\/+$/, "");
        if (urlStr && (text.includes(urlStr) || (normUrl && text.includes(normUrl)))) {
          return null;
        }
        return `👉 *${b.label}:*\n${b.url}`;
      })
      .filter(Boolean);

    if (linkItems.length > 0) {
      text += `\n\n🔗 *Acesso Rápido:*\n` + linkItems.join("\n\n");
    }
  }

  if (footer) {
    text += `\n\n_${footer}_`;
  }

  return text;
}

// ── Formatador e Injetor Inteligente de Botões de Template ───────────────────
export function renderTemplateButtons(rawButtons, reservation = {}, db = {}, baseUrl = "", targetRecipient = "guest", templateOrEvent = null) {
  let templateObj = null;
  let list = [];

  if (rawButtons && typeof rawButtons === "object" && !Array.isArray(rawButtons)) {
    templateObj = rawButtons;
    list = Array.isArray(rawButtons.buttons) ? [...rawButtons.buttons] : [];
  } else {
    list = Array.isArray(rawButtons) ? [...rawButtons] : [];
    if (templateOrEvent && typeof templateOrEvent === "object") {
      templateObj = templateOrEvent;
    }
  }

  const templateId = String(templateObj?.id || (typeof templateOrEvent === "string" ? templateOrEvent : "")).trim();
  const triggerEvent = String(templateObj?.triggerEvent || (typeof templateOrEvent === "string" && !templateOrEvent.startsWith("tpl_") && !templateOrEvent.startsWith("qm_") ? templateOrEvent : "")).trim();
  const templateTitle = String(templateObj?.title || templateObj?.name || templateObj?.shortLabel || "").toLowerCase().trim();

  const idLower = templateId.toLowerCase();
  const eventLower = triggerEvent.toLowerCase();

  const resStatus = String(reservation?.status || "").toLowerCase().trim();
  const isCancelled = resStatus === "cancelada" || resStatus === "cancelled" || resStatus === "cancelado";

  // Identificação de contextos onde link/botão de café NUNCA deve ser enviado:
  // 1. Cancelamento de reserva
  // 2. Checkout / Pós-checkout / Pesquisa de satisfação
  // 3. Cobranças financeiras pendentes
  const isCancellationContext = 
    isCancelled || 
    idLower.includes("cancel") || 
    eventLower.includes("cancel") || 
    templateTitle.includes("cancel");

  const isCheckoutOrReviewContext = 
    idLower.includes("checkout") || 
    idLower.includes("check_out") || 
    idLower.includes("check-out") || 
    idLower.includes("review") || 
    idLower.includes("nps") || 
    idLower.includes("saida") || 
    idLower.includes("saída") ||
    eventLower.includes("checkout") || 
    eventLower.includes("check_out") || 
    eventLower.includes("check-out") || 
    eventLower.includes("review") || 
    eventLower.includes("nps") || 
    eventLower.includes("on_checkout") ||
    templateTitle.includes("checkout") || 
    templateTitle.includes("check-out") || 
    templateTitle.includes("saída") || 
    templateTitle.includes("saida") || 
    templateTitle.includes("avaliação") || 
    templateTitle.includes("satisfação");

  const isFinancialReminderOnly = 
    idLower.includes("payment_pending") || 
    idLower.includes("additional_daily_pending") || 
    idLower.includes("cobranca") || 
    idLower.includes("cobrança") || 
    eventLower.includes("payment_pending") || 
    eventLower.includes("additional_daily_pending");

  const hasBreakfast = Boolean(reservation?.includeBreakfast || reservation?.ratePlan === "with_breakfast");
  const appOrigin = baseUrl || "https://corpflats.onrender.com";
  const resCode = reservation?.code || reservation?.reservationCode || `RES-${reservation?.flatNumber || "000"}-${reservation?.id || "0000"}`;
  const linkCafeManha = `${appOrigin}/cafe/${resCode}`;

  const companionTarget = getCompanionForTarget(getReservationRecipients(reservation || {}, db || {}), targetRecipient);

  const isPreCheckinDone = companionTarget
    ? Boolean(companionTarget.hasCompletedCheckin || companionTarget.status === "CHECKED_IN")
    : Boolean(
      reservation?.fnhrCompleted ||
      (Array.isArray(reservation?.guests) && reservation.guests.length > 0 && reservation.guests.every(g => g.hasCompletedCheckin || g.status === "CHECKED_IN")) ||
      (!reservation?.guests?.length && (reservation?.preCheckinCompleted || reservation?.checkedInAt))
    );

  const hasEnteredFlat = Boolean(
    reservation?.guestSelfCheckin ||
    reservation?.actualCheckinAt ||
    reservation?.status === "in_house" ||
    (reservation?.status === "checkin" && reservation?.guestSelfCheckin)
  );

  const targetGuestIdx = companionTarget ? companionTarget.index : (targetRecipient?.guestIndex || targetRecipient?.index);
  const linkPortalHospede = targetGuestIdx && Number(targetGuestIdx) > 1 
    ? `${appOrigin}/minha-reserva/${resCode}?guest=${targetGuestIdx}` 
    : `${appOrigin}/minha-reserva/${resCode}`;
  const linkCheckinDigital = getCheckinUrlSync(reservation, companionTarget ? companionTarget.index : 1, appOrigin, db);
  const linkAutocheckin = `${appOrigin}/api/pms/guest-portal/${resCode}/self-checkin`;

  // Predicado para identificar botões de check-in por ID (btn_chk, btn_pre, btn_chk_digital) ou URLs (pre-checkin, turismo.gov.br)
  const isCheckinBtn = b => 
    Boolean(b) && (
      b.id === "btn_chk" || 
      b.id === "btn_pre" || 
      b.id === "btn_chk_digital" || 
      (b.url && (
        String(b.url).includes("/pre-checkin") || 
        String(b.url).includes("/precheckin") || 
        String(b.url).includes("turismo.gov.br")
      ))
    );

  // ── Lógica Dinâmica de Botões de Check-in e Chegada ────────────────────────
  const isUnpaidPreReserva = Boolean(
    reservation && (
      reservation.status === "pre_reserva" ||
      reservation.status === "pendente" ||
      templateId === "tpl_pre_reserva" ||
      templateId === "tpl_payment_pending" ||
      triggerEvent === "pre_reservation_created" ||
      triggerEvent === "payment_pending"
    )
  );

  if (isUnpaidPreReserva) {
    // Pré-reserva NÃO permite check-in digital nem autodeclaração de chegada antes do pagamento!
    list = list.filter(b =>
      !isCheckinBtn(b) &&
      b.id !== "btn_cheguei" &&
      b.id !== "btn_cafe" &&
      (!b.url || (!String(b.url).includes("/self-checkin") && !String(b.url).includes("/cafe")))
    );
  } else if (hasEnteredFlat) {
    // Se o hóspede já entrou no flat:
    // Remove botões de pré-checkin e de auto-declaração de chegada
    list = list.filter(b => 
      !isCheckinBtn(b) && 
      b.id !== "btn_cheguei" && 
      (!b.url || !String(b.url).includes("/self-checkin"))
    );
    // Garante que o Portal do Hóspede está presente
    if (!list.some(b => b.id === "btn_portal" || (b.url && String(b.url).includes("/minha-reserva")))) {
      list.push({
        id: "btn_portal",
        type: "URL",
        label: "🏨 Portal da Reserva",
        url: linkPortalHospede
      });
    }
  } else if (isPreCheckinDone) {
    // Pré-check-in já preenchido, mas ainda NÃO entrou no flat:
    // Remove botão de pré-checkin e assegura "Já Cheguei no Flat" (btn_cheguei), exceto na confirmação pós-check-in online
    list = list.filter(b => !isCheckinBtn(b));

    const isPreCheckinCompletedTpl = templateId === "tpl_pre_checkin_completed" || triggerEvent === "pre_checkin_completed";
    if (!isPreCheckinCompletedTpl) {
      const existingChegueiIdx = list.findIndex(b => b.id === "btn_cheguei" || (b.url && String(b.url).includes("/self-checkin")));
      const chegueiBtn = {
        id: "btn_cheguei",
        type: "URL",
        label: "📍 Já Cheguei no Flat",
        url: linkAutocheckin
      };
      if (existingChegueiIdx >= 0) {
        list[existingChegueiIdx] = chegueiBtn;
      } else {
        list.unshift(chegueiBtn);
      }
    }
  } else {
    // Pré-check-in PENDENTE:
    // NUNCA exibe "Já Cheguei no Flat" antes do pré-check-in estar preenchido!
    list = list.filter(b => b.id !== "btn_cheguei" && (!b.url || !String(b.url).includes("/self-checkin")));

    const isArrivalOrCheckinTemplate = [
      "tpl_sameday_reservation_instructions",
      "tpl_checkin_day_instructions",
      "tpl_new_reservation",
      "tpl_new_reservation_direct",
      "tpl_pre_checkin_reminder",
      "tpl_pre_checkin_missing_docs",
      "tpl_second_guest_reminder"
    ].includes(templateId) || [
      "sameday_reservation",
      "checkin_day_instructions",
      "pre_checkin_reminder",
      "pre_checkin_missing_docs",
      "second_guest_reminder"
    ].includes(triggerEvent);

    if (isArrivalOrCheckinTemplate) {
      const existingChkIdx = list.findIndex(b => isCheckinBtn(b));
      const chkBtn = {
        id: "btn_chk",
        type: "URL",
        label: "📝 Fazer Check-in Online",
        url: linkCheckinDigital
      };
      if (existingChkIdx >= 0) {
        list[existingChkIdx] = chkBtn;
      } else {
        list.unshift(chkBtn);
      }
    }
  }

  // Templates e eventos permitidos para inclusão do botão de café (apenas no fluxo de entrada e estadia inicial)
  const ALLOWED_TEMPLATES_FOR_CAFE = [
    "tpl_new_reservation_direct",
    "tpl_new_reservation",
    "tpl_pre_reserva",
    "tpl_payment_confirmed",
    "tpl_sameday_reservation_instructions",
    "tpl_room_ready_direct",
    "tpl_room_ready_regular",
    "tpl_checkin_day_instructions",
    "tpl_checkin_completed",
    "tpl_breakfast_reminder",
    "qm_breakfast",
    "qm_payment_confirmed",
    "qm_summary_checkin"
  ];
  const ALLOWED_EVENTS_FOR_CAFE = [
    "new_reservation",
    "new_reservation_direct",
    "payment_confirmed",
    "sameday_reservation",
    "room_ready",
    "room_ready_direct",
    "room_ready_regular",
    "checkin_day_instructions",
    "checkin_completed",
    "breakfast_reminder"
  ];

  const isAllowedTemplate = ALLOWED_TEMPLATES_FOR_CAFE.includes(templateId) || ALLOWED_EVENTS_FOR_CAFE.includes(triggerEvent);
  const isBreakfastExplicitTemplate = templateId === "qm_breakfast" || templateId === "tpl_breakfast_reminder" || triggerEvent === "breakfast_reminder";

  // Se o contexto for cancelamento, pós-checkout, checkout, cobrança, sem café ou template não autorizado:
  // Remove QUALQUER botão de café existente ou acidental (a menos que seja template explícito de café).
  if (!isBreakfastExplicitTemplate && (isCancellationContext || isCheckoutOrReviewContext || isFinancialReminderOnly || !hasBreakfast || !isAllowedTemplate)) {
    list = list.filter(b => b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
  } else {
    // Para reservas ativas com café OU disparo explícito de café:
    const safeCafeUrl = linkCafeManha || `${baseUrl || "https://corpflats.onrender.com"}/cafe/${resCode}`;
    const existingCafeIdx = list.findIndex(b => b.id === "btn_cafe" || (b.url && String(b.url).includes("/cafe/")));
    const cafeBtn = {
      id: "btn_cafe",
      type: "URL",
      label: "🥐 Escolher Itens do Café",
      url: safeCafeUrl
    };
    if (existingCafeIdx >= 0) {
      list[existingCafeIdx] = cafeBtn;
    } else {
      const portalIdx = list.findIndex(b => b.id === "btn_portal" || (b.url && String(b.url).includes("/minha-reserva")));
      if (portalIdx >= 0) {
        list.splice(portalIdx, 0, cafeBtn);
      } else {
        list.push(cafeBtn);
      }
    }
  }

  const recipientsObj = getReservationRecipients(reservation || {}, db || {});
  const targetType = targetRecipient && typeof targetRecipient === "object" ? targetRecipient.type : targetRecipient;
  const hideFinancialForGuest = Boolean(recipientsObj.requester?.isDifferentFromGuest && targetType !== "requester");

  if (hideFinancialForGuest) {
    list = list.filter(b => {
      if (!b) return false;
      const bId = String(b.id || "").toLowerCase();
      const bLabel = String(b.label || "").toLowerCase();
      const bUrl = String(b.url || "").toLowerCase();
      if (bId === "btn_pix" || bId === "btn_pagar" || bId === "btn_payment") return false;
      if (b.type === "COPY" || Boolean(b.copyCode)) return false;
      if (
        bUrl.includes("/copiar-pix") ||
        bUrl.includes("link_pagamento") ||
        bUrl.includes("link_copiar_pix") ||
        bUrl.includes("link_pix") ||
        bUrl.includes("pix_copia_e_cola") ||
        bUrl.startsWith("000201")
      ) {
        return false;
      }
      if (/pix|pagar|pagamento|quitar|fatura|cobran[cç]a/i.test(bLabel)) return false;
      return true;
    });
  }

  // Deduplicação de botões por id/url
  const seenButtonKeys = new Set();
  list = list.filter(b => {
    const key = b.id || b.url || b.label;
    if (seenButtonKeys.has(key)) return false;
    seenButtonKeys.add(key);
    return true;
  });

  return list.map(b => {
    let finalUrl = b.url ? resolveWhatsAppTags(b.url, reservation, db, baseUrl, targetRecipient, templateObj || templateOrEvent) : undefined;
    // Sanitização anti-falha: Se a URL apontar para o antigo link do whatsapp.com/otp/code/ ou for vazia com botão PIX, substitui pela URL oficial do portal/copiar-pix
    if ((finalUrl && finalUrl.includes("whatsapp.com/otp")) || (!finalUrl && (b.type === "COPY" || b.id === "btn_pix"))) {
      finalUrl = `${appOrigin}/copiar-pix/${resCode}`;
    }
    return {
      ...b,
      url: finalUrl,
      phone: b.phone ? resolveWhatsAppTags(b.phone, reservation, db, baseUrl, targetRecipient, templateObj || templateOrEvent) : undefined,
      copyCode: b.copyCode ? resolveWhatsAppTags(b.copyCode, reservation, db, baseUrl, targetRecipient, templateObj || templateOrEvent) : undefined
    };
  });
}

export const buildTemplateActionButtons = renderTemplateButtons;

// ── Disparo Oficial de Documento / PDF via Z-API (/send-document/{extension}) ─
export async function sendZapiDocument(config, {
  phone,
  document,
  fileName = "Manual_do_Hospede_CorpFlats.pdf",
  caption = "",
  bypassTestMode = false,
  recipientRole = "",
  channelId = "",
  triggerEvent = "",
  db = null
}) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  const activeDb = db || (typeof globalDbGetter === "function" ? globalDbGetter() : null);
  const policy = evaluateZapiChannelPolicy(config, {
    phone: cleanPhone,
    channelId,
    recipientRole,
    triggerEvent,
    db: activeDb,
    bypassTestMode
  });

  if (!policy.allowed) {
    console.warn(`[Z-API Channel Policy] Documento para ${cleanPhone} BLOQUEADO pelo canal ${policy.channelId}. Motivo: ${policy.reason}`);
    return {
      success: false,
      blockedByChannelPause: Boolean(policy.blockedByChannelPause),
      blockedByBlacklist: Boolean(policy.blockedByBlacklist),
      blockedByWhitelist: Boolean(policy.blockedByWhitelist),
      blockedByTestMode: Boolean(policy.blockedByWhitelist || policy.blockedByTestMode),
      channelId: policy.channelId,
      error: policy.reason || "Disparo bloqueado pela governança de canais Z-API."
    };
  }

  let targetPhone = cleanPhone;
  let finalCaption = caption;

  if (policy.redirected) {
    targetPhone = policy.targetPhone;
    const header = policy.redirectHeader || "";
    finalCaption = finalCaption ? `${header}${finalCaption}` : header.trim();
  }

  if (!document) {
    return { success: false, error: "Arquivo ou link do documento não especificado." };
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  // Simulação para desenvolvimento se credenciais não estiverem configuradas
  if (!instanceId || !token) {
    console.warn(`[Z-API Mock] Credenciais não configuradas. Documento '${fileName}' para ${targetPhone} simulado.`);
    return {
      success: true,
      simulated: true,
      messageId: `mock_doc_${Date.now()}`,
      phone: targetPhone,
      originalPhone: cleanPhone,
      redirected: Boolean(policy.redirected),
      fileName,
      channelId: policy.channelId
    };
  }

  // Detecta extensão do arquivo
  let extension = "pdf";
  if (fileName && fileName.includes(".")) {
    extension = fileName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  }

  // Se o documento for um arquivo local do sistema (/api/storage/files/...), lê do disco e converte em Base64
  let finalDocument = document;
  if (typeof document === "string") {
    if (document.startsWith("/api/storage/files/")) {
      const relPath = document.replace(/^\/api\/storage\/files\//, "");
      const fullPath = path.join(UPLOADS_DIR, relPath);
      if (fs.existsSync(fullPath)) {
        try {
          const fileBuf = fs.readFileSync(fullPath);
          const mime = extension === "pdf" ? "application/pdf" : (extension === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : `application/${extension}`);
          finalDocument = `data:${mime};base64,${fileBuf.toString("base64")}`;
          console.log(`[Z-API Document] Arquivo local '${relPath}' lido e convertido em Base64 (${fileBuf.length} bytes) para envio seguro.`);
        } catch (readErr) {
          console.warn("[Z-API Document] Erro ao ler arquivo local:", readErr.message);
          const pubBase = config.publicOrigin || "https://corpflats.onrender.com";
          finalDocument = `${pubBase.replace(/\/+$/, "")}/${document.replace(/^\/+/, "")}`;
        }
      } else {
        const pubBase = config.publicOrigin || "https://corpflats.onrender.com";
        finalDocument = `${pubBase.replace(/\/+$/, "")}/${document.replace(/^\/+/, "")}`;
      }
    } else if (!document.startsWith("http://") && !document.startsWith("https://") && !document.startsWith("data:")) {
      const fullPath = path.join(DOCUMENTS_DIR, document);
      if (fs.existsSync(fullPath)) {
        try {
          const fileBuf = fs.readFileSync(fullPath);
          finalDocument = `data:application/pdf;base64,${fileBuf.toString("base64")}`;
        } catch (e) {}
      }
    }
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const docUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-document/${extension}`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: targetPhone,
    document: finalDocument,
    fileName: fileName || `Documento.${extension}`,
    caption: finalCaption || ""
  };

  try {
    console.log(`[Z-API] Enviando documento (${fileName}) para ${targetPhone}...`);
    const res = await fetch(docUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.zaapId || data.id || data.messageId)) {
      console.log(`[Z-API ✓] Documento ${fileName} entregue para ${targetPhone}. ID: ${data.zaapId || data.id}`);
      return {
        success: true,
        messageId: data.zaapId || data.id,
        fileName,
        phone: targetPhone,
        originalPhone: cleanPhone,
        redirected: Boolean(policy.redirected),
        channelId: policy.channelId,
        data
      };
    }

    console.warn(`[Z-API] Falha ao enviar documento (HTTP ${res.status}):`, data);
    return {
      success: false,
      error: data.message || data.error || `Erro HTTP ${res.status} ao enviar documento via Z-API`,
      data
    };
  } catch (err) {
    console.error(`[Z-API] Exceção ao enviar documento:`, err.message);
    return { success: false, error: err.message };
  }
}

// ── Disparo Oficial Z-API ──────────────────────────────────────────────────────
export async function sendZapiMessage(config, {
  phone,
  message,
  title = "",
  footer = "",
  buttons = [],
  sendMode = "auto",
  documentUrl = "",
  documentName = "",
  documentCaption = "",
  fileBase64 = "",
  bypassTestMode = false,
  recipientRole = "",
  channelId = "",
  triggerEvent = "",
  db = null
}) {
  let cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  const activeDb = db || (typeof globalDbGetter === "function" ? globalDbGetter() : null);
  const policy = evaluateZapiChannelPolicy(config, {
    phone: cleanPhone,
    channelId,
    recipientRole,
    triggerEvent,
    db: activeDb,
    bypassTestMode
  });

  if (!policy.allowed) {
    console.warn(`[Z-API Channel Policy] Disparo para ${cleanPhone} BLOQUEADO pelo canal ${policy.channelId}. Motivo: ${policy.reason}`);
    return {
      success: false,
      blockedByChannelPause: Boolean(policy.blockedByChannelPause),
      blockedByBlacklist: Boolean(policy.blockedByBlacklist),
      blockedByWhitelist: Boolean(policy.blockedByWhitelist),
      blockedByTestMode: Boolean(policy.blockedByWhitelist || policy.blockedByTestMode),
      channelId: policy.channelId,
      error: policy.reason || "Disparo bloqueado pela governança de canais Z-API."
    };
  }

  let targetPhone = cleanPhone;
  let finalMessage = message;
  let finalDocumentCaption = documentCaption;
  let finalTitle = title;

  if (policy.redirected) {
    targetPhone = policy.targetPhone;
    const header = policy.redirectHeader || "";
    console.log(`[Z-API Test Redirect] Mensagem do canal ${policy.channelId} redirecionada de ${cleanPhone} para ${targetPhone}`);
    if (finalMessage) {
      finalMessage = `${header}${finalMessage}`;
    } else if (finalTitle) {
      finalTitle = `${header}${finalTitle}`;
    }
    if (finalDocumentCaption) {
      finalDocumentCaption = `${header}${finalDocumentCaption}`;
    } else if (!finalMessage && !finalTitle) {
      finalDocumentCaption = header.trim();
    }
  }

  const hasDoc = Boolean(documentUrl || fileBase64);

  // Se não há texto na mensagem mas há documento, envia diretamente o documento
  if (!finalMessage && hasDoc) {
    return await sendZapiDocument(config, {
      phone: targetPhone,
      document: fileBase64 || documentUrl,
      fileName: documentName || "Manual_do_Hospede_CorpFlats.pdf",
      caption: finalDocumentCaption || "",
      bypassTestMode,
      recipientRole,
      channelId: policy.channelId,
      triggerEvent,
      db: activeDb
    });
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  const fallbackToText = config?.fallbackToText !== false;
  const configuredDeliveryMode = config?.deliveryMode || "buttons"; // "buttons" (padrão oficial), "text_links", "auto"

  // Se não configurado, simula sucesso em ambiente de desenvolvimento/teste sem travar
  if (!instanceId || !token) {
    console.warn(`[Z-API Mock] Credenciais não configuradas. Mensagem para ${targetPhone} simulada.`);
    const mockResult = {
      success: true,
      simulated: true,
      messageId: `mock_${Date.now()}`,
      phone: targetPhone,
      originalPhone: cleanPhone,
      redirected: Boolean(policy.redirected),
      message: finalMessage,
      channelId: policy.channelId
    };
    if (hasDoc) {
      mockResult.hasDocument = true;
      mockResult.documentResult = {
        success: true,
        simulated: true,
        messageId: `mock_doc_${Date.now()}`,
        fileName: documentName || "Manual_do_Hospede_CorpFlats.pdf"
      };
    }
    return mockResult;
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const headers = {
    "Content-Type": "application/json"
  };
  if (clientToken) {
    headers["Client-Token"] = clientToken;
  }

  // Sanitização de segurança de botões em mensagens de check-out, pós-estadia ou cancelamento
  const msgContext = `${finalTitle || ""} ${finalMessage || ""}`.toLowerCase();
  const isCheckoutOrEndMessage = msgContext.includes("check-out") || 
                                 msgContext.includes("checkout") || 
                                 msgContext.includes("encerramento da sua estadia") || 
                                 msgContext.includes("horário limite de saída");
  const isCancelMessage = msgContext.includes("cancelamento") || 
                          msgContext.includes("cancelada") || 
                          msgContext.includes("cancelado");
  const isReviewMessage = msgContext.includes("avaliação") || 
                          msgContext.includes("satisfação");

  let safeButtons = buttons || [];
  if (isCheckoutOrEndMessage || isCancelMessage || isReviewMessage) {
    safeButtons = safeButtons.filter(b => b && b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
  }

  const validButtons = safeButtons.filter(b => b && b.label && (b.url || b.phone || b.type === "REPLY"));

  // Determina se deve enviar direto por texto com links (garantido) ou tentar botões
  const shouldSendText = sendMode === "text" || 
                         (sendMode !== "buttons" && configuredDeliveryMode === "text_links") || 
                         validButtons.length === 0;

  let primaryResult = null;

  // 1. Envio Direto via Texto Formatado com Links (/send-text)
  if (shouldSendText) {
    const textWithLinks = formatMessageWithLinks(finalMessage, footer, validButtons);
    const textUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;

    try {
      console.log(`[Z-API] Enviando mensagem em texto formatado para ${targetPhone}...`);
      const res = await fetch(textUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: targetPhone, message: textWithLinks })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.zaapId || data.id || data.messageId)) {
        console.log(`[Z-API ✓] Texto entregue para ${targetPhone}. ID: ${data.zaapId || data.id}`);
        primaryResult = {
          success: true,
          method: "text_links",
          messageId: data.zaapId || data.id,
          phone: targetPhone,
          originalPhone: cleanPhone,
          redirected: Boolean(policy.redirected),
          channelId: policy.channelId,
          data
        };
        recordBotSentMessage({ messageId: primaryResult.messageId, phone: targetPhone, text: finalMessage });
      } else {
        primaryResult = {
          success: false,
          error: data.message || data.error || `Erro HTTP ${res.status} ao enviar texto via Z-API`
        };
      }
    } catch (err) {
      console.error(`[Z-API] Exceção ao enviar texto:`, err.message);
      primaryResult = { success: false, error: err.message };
    }
  } else {
    // 2. Tentativa com Botões Interativos (/send-button-actions)
    const buttonActionsUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-actions`;

    const hasCallOrUrl = validButtons.some(b => b.type === "CALL" || b.type === "URL" || b.type === "COPY" || b.copyCode);
    const hasReply = validButtons.some(b => b.type === "REPLY");

    let filteredButtons = validButtons;
    if (hasCallOrUrl && hasReply) {
      filteredButtons = validButtons.filter(b => b.type !== "REPLY");
    }

    const formattedActions = filteredButtons.slice(0, 3).map((b, idx) => {
      const isCall = b.type === "CALL" || Boolean(b.phone);
      const type = isCall ? "CALL" : "URL";
      const action = {
        id: String(b.id || `btn_${idx + 1}`),
        type,
        label: String(b.label || "Acessar").trim().substring(0, 25)
      };

      if (type === "URL") {
        let rawUrl = String(b.url || "").trim();
        const codeToCopy = b.copyCode || b.code || (b.type === "COPY" && rawUrl.startsWith("000201") ? rawUrl : "");
        // Se a URL apontar para o antigo link do whatsapp.com/otp/code/ ou for vazia/código puro, redireciona para a página oficial do portal para copiar o PIX
        if (!rawUrl || rawUrl.startsWith("000201") || rawUrl.includes("whatsapp.com/otp")) {
          const hostBase = (baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com").replace(/\/+$/, "");
          rawUrl = `${hostBase}/copiar-pix`;
        } else if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
          rawUrl = "https://" + rawUrl;
        }
        action.url = rawUrl;
      } else if (type === "CALL") {
        action.phone = cleanWhatsAppPhone(b.phone || config.adminWhatsApp || "5522997124021");
      }

      return action;
    });

    const buttonActionsPayload = {
      phone: targetPhone,
      message: finalMessage,
      // Omitido 'title' para que a mensagem inicie direto com a saudação, sem cabeçalho com o nome interno do template
      ...(footer ? { footer } : {}),
      buttonActions: formattedActions
    };

    try {
      console.log(`[Z-API] Enviando mensagem com botões para ${targetPhone}...`);
      const res = await fetch(buttonActionsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(buttonActionsPayload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.zaapId || data.id || data.messageId || data.value)) {
        console.log(`[Z-API ✓] Mensagem com botões aceita para ${targetPhone}. ID: ${data.zaapId || data.id}`);
        primaryResult = {
          success: true,
          method: "buttons",
          messageId: data.zaapId || data.id || "ok",
          phone: targetPhone,
          originalPhone: cleanPhone,
          redirected: Boolean(policy.redirected),
          channelId: policy.channelId,
          data
        };
        recordBotSentMessage({ messageId: primaryResult.messageId, phone: targetPhone, text: finalMessage });
      } else {
        console.warn(`[Z-API] Falha ao enviar com botões (HTTP ${res.status}):`, data);

        // Fallback para texto formatado se configurado
        if (fallbackToText) {
          console.log(`[Z-API Fallback] Reenviando como texto formatado para ${targetPhone}...`);
          const textWithLinks = formatMessageWithLinks(finalMessage, footer, validButtons);
          const textUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;
          const textRes = await fetch(textUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ phone: targetPhone, message: textWithLinks })
          });
          const textData = await textRes.json().catch(() => ({}));

          if (textRes.ok && (textData.zaapId || textData.id)) {
            primaryResult = {
              success: true,
              method: "fallback_text",
              warning: "Mensagem entregue via texto com links diretos após recusa de botões pela Z-API.",
              buttonError: data.message || data.error || `Erro HTTP ${res.status}`,
              messageId: textData.zaapId || textData.id,
              phone: targetPhone,
              originalPhone: cleanPhone,
              redirected: Boolean(policy.redirected),
              channelId: policy.channelId,
              data: textData
            };
            recordBotSentMessage({ messageId: primaryResult.messageId, phone: targetPhone, text: finalMessage });
          } else {
            primaryResult = {
              success: false,
              error: data.message || data.error || `Erro HTTP ${res.status} na Z-API`
            };
          }
        } else {
          primaryResult = {
            success: false,
            error: data.message || data.error || `Erro HTTP ${res.status} na Z-API`
          };
        }
      }
    } catch (err) {
      console.error(`[Z-API] Exceção no envio:`, err.message);
      primaryResult = { success: false, error: err.message };
    }
  }

  // Se o envio principal teve sucesso (ou simulação) E há documento anexo configurado:
  if ((primaryResult?.success || primaryResult?.simulated) && hasDoc) {
    try {
      console.log(`[Z-API] Anexando documento ${documentName || 'PDF'} para ${targetPhone}...`);
      await new Promise(r => setTimeout(r, 1200)); // Pequena pausa para garantir ordem cronológica no WhatsApp
      const docResult = await sendZapiDocument(config, {
        phone: targetPhone,
        document: fileBase64 || documentUrl,
        fileName: documentName || "Manual_do_Hospede_CorpFlats.pdf",
        caption: finalDocumentCaption || "",
        bypassTestMode,
        recipientRole,
        channelId: policy.channelId,
        triggerEvent,
        db: activeDb
      });
      primaryResult.documentResult = docResult;
      primaryResult.hasDocument = true;
    } catch (docErr) {
      console.warn(`[Z-API] Erro ao disparar documento anexo:`, docErr.message);
      primaryResult.documentError = docErr.message;
    }
  }

  // Se a mensagem enviada contém botão ou código PIX de cópia, despacha imediatamente o código PIX no chat
  const pixBtn = validButtons.find(b => b && (b.copyCode || (b.type === "COPY" && (b.code || b.url)) || (b.url && String(b.url).startsWith("000201"))));
  const pixCodeToCopy = pixBtn ? (pixBtn.copyCode || pixBtn.code || (String(pixBtn.url).startsWith("000201") ? pixBtn.url : "")) : "";

  if (pixCodeToCopy && typeof pixCodeToCopy === "string" && pixCodeToCopy.startsWith("000201") && (primaryResult?.success || primaryResult?.simulated)) {
    try {
      console.log(`[Z-API PIX Companion] Enviando código PIX para cópia em 1 toque para ${targetPhone}...`);
      await new Promise(r => setTimeout(r, 800)); // Pequena pausa para garantir ordem cronológica no WhatsApp

      // 1. Tenta botão OTP nativo da Z-API (/send-button-otp)
      let otpSent = false;
      try {
        const otpRes = await sendZapiOtpButton(config, {
          phone: targetPhone,
          message: `📋 *PIX Copia e Cola:*\nToque no botão abaixo para copiar o código e pagar no app do seu banco:`,
          code: pixCodeToCopy,
          buttonText: "Copiar Código PIX",
          channelId: policy.channelId,
          recipientRole,
          triggerEvent: "pix_companion_otp",
          db: activeDb
        });
        if (otpRes?.success) {
          otpSent = true;
          console.log(`[Z-API PIX Companion ✓] Botão OTP entregue com sucesso para ${targetPhone}`);
        }
      } catch (otpErr) {
        console.warn(`[Z-API PIX Companion] Botão OTP falhou:`, otpErr.message);
      }

      // 2. Se o botão OTP não foi aceito, envia o código puro em texto para cópia garantida com toque longo
      if (!otpSent) {
        const rawPixUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;
        await fetch(rawPixUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: targetPhone,
            message: `${pixCodeToCopy}`
          })
        }).catch(() => {});
        console.log(`[Z-API PIX Companion ✓] Código PIX puro entregue para ${targetPhone}`);
      }
    } catch (pixErr) {
      console.warn(`[Z-API PIX Companion] Erro ao enviar código PIX complementar:`, pixErr.message);
    }
  }

  if (primaryResult) {
    if (primaryResult.phone === undefined) primaryResult.phone = targetPhone;
    if (primaryResult.originalPhone === undefined) primaryResult.originalPhone = cleanPhone;
    if (primaryResult.redirected === undefined) primaryResult.redirected = Boolean(policy.redirected);
    if (primaryResult.channelId === undefined) primaryResult.channelId = policy.channelId;
  }

  return primaryResult;
}

// ── Funções Auxiliares de Recursos Modernos da Z-API ───────────────────────────

/**
 * Enviar Localização Fixa no Mapa do WhatsApp (/send-message-location)
 */
export async function sendZapiLocation(config, { phone, title, address, latitude, longitude }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) return { success: true, simulated: true };

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-message-location`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: cleanPhone,
    title: title || "CorpFlats Soho Residence",
    address: address || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ, 28010-140",
    latitude: String(latitude || "-21.7584"),
    longitude: String(longitude || "-41.3262")
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Enviar Botão OTP de Cópia com 1 Toque (/send-button-otp)
 */
export async function sendZapiOtpButton(config, {
  phone,
  message,
  code,
  buttonText = "Copiar código",
  channelId = "transactional_chat",
  recipientRole = "guest",
  triggerEvent = "pre_checkin_otp",
  db = null
}) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const activeDb = db || (typeof globalDbGetter === "function" ? globalDbGetter() : null);
  const policy = evaluateZapiChannelPolicy(config, {
    phone: cleanPhone,
    channelId: channelId || "transactional_chat",
    recipientRole,
    triggerEvent,
    db: activeDb
  });

  if (!policy.allowed) {
    console.warn(`[Z-API Channel Policy] OTP Button para ${cleanPhone} BLOQUEADO pelo canal ${policy.channelId}. Motivo: ${policy.reason}`);
    return {
      success: false,
      blockedByChannelPause: Boolean(policy.blockedByChannelPause),
      blockedByBlacklist: Boolean(policy.blockedByBlacklist),
      blockedByWhitelist: Boolean(policy.blockedByWhitelist),
      blockedByTestMode: Boolean(policy.blockedByWhitelist || policy.blockedByTestMode),
      channelId: policy.channelId,
      error: policy.reason || "Disparo bloqueado pela governança de canais Z-API."
    };
  }

  let targetPhone = cleanPhone;
  let finalMessage = message;
  if (policy.redirected) {
    targetPhone = policy.targetPhone;
    const header = policy.redirectHeader || "";
    finalMessage = `${header}${finalMessage}`;
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) {
    return {
      success: true,
      simulated: true,
      phone: targetPhone,
      originalPhone: cleanPhone,
      redirected: Boolean(policy.redirected),
      channelId: policy.channelId
    };
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-otp`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: targetPhone,
    message: finalMessage,
    code,
    buttonText
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return {
      success: res.ok,
      data,
      phone: targetPhone,
      originalPhone: cleanPhone,
      redirected: Boolean(policy.redirected),
      channelId: policy.channelId
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Enviar Botão Nativo de Chave PIX (/send-button-pix)
 */
export async function sendZapiPixButton(config, {
  phone,
  pixKey,
  type = "EVP",
  merchantName = "CorpFlats",
  channelId = "guest_schedule",
  recipientRole = "guest",
  triggerEvent = "pix_button",
  db = null
}) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const activeDb = db || (typeof globalDbGetter === "function" ? globalDbGetter() : null);
  const policy = evaluateZapiChannelPolicy(config, {
    phone: cleanPhone,
    channelId,
    recipientRole,
    triggerEvent,
    db: activeDb
  });

  if (!policy.allowed) {
    return {
      success: false,
      blockedByChannelPause: Boolean(policy.blockedByChannelPause),
      blockedByBlacklist: Boolean(policy.blockedByBlacklist),
      blockedByWhitelist: Boolean(policy.blockedByWhitelist),
      blockedByTestMode: Boolean(policy.blockedByWhitelist || policy.blockedByTestMode),
      channelId: policy.channelId,
      error: policy.reason || "Disparo bloqueado pela governança de canais Z-API."
    };
  }

  let targetPhone = cleanPhone;
  if (policy.redirected) {
    targetPhone = policy.targetPhone;
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) return { success: true, simulated: true, phone: targetPhone, redirected: Boolean(policy.redirected), channelId: policy.channelId };

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-pix`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: targetPhone,
    pixKey,
    type,
    merchantName
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, data, phone: targetPhone, redirected: Boolean(policy.redirected), channelId: policy.channelId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Enviar Lista Interativa de Opções / Dropdown (/send-option-list)
 */
export async function sendZapiOptionList(config, { phone, message, title, buttonLabel = "Ver Opções", options }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) return { success: true, simulated: true };

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-option-list`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: cleanPhone,
    message,
    optionList: {
      title: title || "Opções Disponíveis",
      buttonLabel,
      options: options || []
    }
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    return { success: res.ok, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Cache & Single-Flight para Status da Conexão Z-API (Elimina Event Loop Lag) ──
let zapiStatusCache = {
  data: null,
  cachedAt: 0,
  key: ""
};
let inFlightZapiStatusPromise = null;

export function clearZapiStatusCache() {
  zapiStatusCache = { data: null, cachedAt: 0, key: "" };
  inFlightZapiStatusPromise = null;
}

export async function getZapiStatus(config, options = {}) {
  const force = Boolean(options?.force);
  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  if (!instanceId || !token) {
    return {
      connected: false,
      configured: false,
      message: "Z-API não configurada. Preencha Instance ID e Token."
    };
  }

  const cacheKey = `${instanceId}:${token}`;
  const now = Date.now();
  const CACHE_TTL_MS = 15000; // 15 segundos de cache para eliminar sobrecarga contínua

  // Retorna instantaneamente do cache em memória (<1ms) se válido
  if (!force && zapiStatusCache.data && zapiStatusCache.key === cacheKey && (now - zapiStatusCache.cachedAt) < CACHE_TTL_MS) {
    return { ...zapiStatusCache.data, fromCache: true };
  }

  // Deduplicação de chamadas concorrentes: se já houver uma busca em andamento, aguarda a mesma Promise
  if (inFlightZapiStatusPromise) {
    return inFlightZapiStatusPromise;
  }

  const executeFetch = async () => {
    const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
    const statusUrl = `${baseUrl}/instances/${instanceId}/token/${token}/status`;
    const deviceUrl = `${baseUrl}/instances/${instanceId}/token/${token}/device`;
    const headers = {};
    if (clientToken) headers["Client-Token"] = clientToken;

    try {
      const statusSignal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined;
      const res = await fetch(statusUrl, { headers, signal: statusSignal });
      const data = await res.json().catch(() => ({}));
      const isConnected = Boolean(data.connected || data.smartphoneConnected);

      let deviceInfo = null;
      if (isConnected) {
        try {
          const devSignal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined;
          const devRes = await fetch(deviceUrl, { headers, signal: devSignal });
          if (devRes.ok) {
            deviceInfo = await devRes.json().catch(() => null);
          }
        } catch (devErr) {
          console.warn("[Z-API] Falha ao consultar /device:", devErr.message);
        }
      }

      const result = {
        connected: isConnected,
        configured: true,
        smartphone: data.smartphone || null,
        phone: deviceInfo?.phone || data.phone || data.smartphone?.phone || "",
        name: deviceInfo?.name || "",
        isBusiness: Boolean(deviceInfo?.isBusiness),
        deviceModel: deviceInfo?.device?.device_model || deviceInfo?.originalDevice || "",
        battery: data.battery || data.smartphone?.battery || null,
        error: isConnected ? null : (data.error || data.message || null),
        details: { ...data, device: deviceInfo },
        cachedAt: new Date().toISOString()
      };

      zapiStatusCache = {
        data: result,
        cachedAt: Date.now(),
        key: cacheKey
      };

      return result;
    } catch (err) {
      // Se a conexão falhar ou expirar por timeout, usa o cache anterior como fallback gracioso
      if (zapiStatusCache.data && zapiStatusCache.key === cacheKey) {
        return { ...zapiStatusCache.data, fromCacheFallback: true };
      }
      return {
        connected: false,
        configured: true,
        error: err.message
      };
    } finally {
      inFlightZapiStatusPromise = null;
    }
  };

  inFlightZapiStatusPromise = executeFetch();
  return inFlightZapiStatusPromise;
}

// ── Consulta QR Code Z-API ────────────────────────────────────────────────────
export async function getZapiQrCode(config) {
  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  if (!instanceId || !token) {
    return { success: false, error: "Credenciais incompletas" };
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const qrUrl = `${baseUrl}/instances/${instanceId}/token/${token}/qr-code/image`;
  const headers = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const res = await fetch(qrUrl, { headers });
    const data = await res.json().catch(() => ({}));
    if (data.value) {
      return { success: true, qrImage: data.value };
    }
    return { success: true, qrImage: data.link || data.value || null, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Consulta Existência de Conta no WhatsApp via Z-API ────────────────────────
export async function checkZapiPhoneExists(phone, config) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { exists: false, error: "Número inválido ou vazio", checked: false };
  }
  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  if (!instanceId || !token) {
    return { exists: true, phone: cleanPhone, checked: false, note: "Z-API não configurada" };
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/phone-exists/${cleanPhone}`;
  const headers = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        exists: data.exists !== false,
        phone: data.phone ? cleanWhatsAppPhone(data.phone) : cleanPhone,
        checked: true,
        data
      };
    }
    return { exists: true, phone: cleanPhone, checked: false };
  } catch (err) {
    return { exists: true, phone: cleanPhone, checked: false, error: err.message };
  }
}

// ── Cálculo do Horário de Disparo (Offset Engine - Fuso Brasília -03:00) ───────
export function calculateScheduledTime(template, reservation, db) {
  const now = new Date();
  const { todayStr: brTodayStr } = getBrasiliaDateParts(now);
  const checkinTimeStr = db.settings?.checkinTime || "14:00";
  const checkoutTimeStr = db.settings?.checkoutTime || "12:00";

  // Checkin ISO datetime (Horário de Brasília -03:00)
  const checkinDateStr = reservation.checkinDate || brTodayStr;
  const checkinDateTime = new Date(`${checkinDateStr}T${checkinTimeStr}:00-03:00`);

  // Checkout ISO datetime (Horário de Brasília -03:00)
  const checkoutDateStr = reservation.checkoutDate || brTodayStr;
  const checkoutDateTime = new Date(`${checkoutDateStr}T${checkoutTimeStr}:00-03:00`);

  const timing = template.triggerTiming || "immediate";

  if (timing === "immediate") {
    return now.toISOString();
  }

  if (timing === "fixed_time_day_of") {
    const targetHour = template.fixedTime || "09:00";
    const eventDate = template.triggerEvent.includes("checkout") ? checkoutDateStr : checkinDateStr;
    return new Date(`${eventDate}T${targetHour}:00-03:00`).toISOString();
  }

  if (timing === "fixed_time_day_before") {
    const targetHour = template.fixedTime || "18:00";
    const eventDate = template.triggerEvent.includes("checkout") ? checkoutDateStr : checkinDateStr;
    const eventNoonUtc = new Date(`${eventDate}T12:00:00Z`);
    const dayBeforeStr = new Date(eventNoonUtc.getTime() - 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    return new Date(`${dayBeforeStr}T${targetHour}:00-03:00`).toISOString();
  }

  const offsetMultiplier = template.offsetUnit === "days" 
    ? 24 * 60 * 60 * 1000 
    : (template.offsetUnit === "minutes" ? 60 * 1000 : 60 * 60 * 1000);
  
  const offsetMs = (template.offsetValue || 0) * offsetMultiplier;
  const baseTarget = template.triggerEvent.includes("checkout") ? checkoutDateTime.getTime() : checkinDateTime.getTime();

  if (timing === "before_event") {
    return new Date(baseTarget - offsetMs).toISOString();
  }

  if (timing === "after_event") {
    return new Date(baseTarget + offsetMs).toISOString();
  }

  if (timing === "after_creation") {
    const createdDate = reservation.createdAt ? new Date(reservation.createdAt) : now;
    const offsetMultiplier = template.offsetUnit === "days" 
      ? 24 * 60 * 60 * 1000 
      : (template.offsetUnit === "minutes" ? 60 * 1000 : 60 * 60 * 1000);
    const offsetMs = (template.offsetValue || 1) * offsetMultiplier;
    return new Date(createdDate.getTime() + offsetMs).toISOString();
  }

  return now.toISOString();
}

// ── Renderizadores de E-mail de Alerta de Conexão Z-API ───────────────────────

export function renderDisconnectionAlertEmailHtml({ hotelName, disconnectedAt, reason, source, targetUrl }) {
  const dateFormatted = disconnectedAt ? new Date(disconnectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : new Date().toLocaleString("pt-BR");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ALERTA CRÍTICO: WhatsApp Desconectado</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #fee2e2; }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 24px 30px; text-align: left; }
    .brand { color: #fef2f2; font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
    .subbrand { color: #fca5a5; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px; }
    .badge-bar { margin-top: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: #ffffff; color: #b91c1c; }
    .content { padding: 30px; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #ef4444; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    .alert-title { font-size: 16px; font-weight: 800; color: #991b1b; margin-bottom: 6px; }
    .alert-text { font-size: 13px; color: #7f1d1d; line-height: 1.5; margin: 0; }
    .impact-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .impact-title { font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 8px; }
    .impact-list { margin: 0; padding-left: 20px; font-size: 12px; color: #78350f; line-height: 1.6; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .info-table td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .info-table .label { color: #64748b; font-weight: 600; width: 35%; }
    .info-table .val { color: #0f172a; font-weight: 700; }
    .btn-container { text-align: center; margin: 28px 0 16px 0; }
    .btn-action { display: inline-block; padding: 14px 28px; background: #059669; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 800; box-shadow: 0 4px 12px rgba(5,150,105,0.3); }
    .footer { background: #f8fafc; padding: 18px 30px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="brand">${hotelName}</div>
      <div class="subbrand">Alerta de Monitoramento de Infraestrutura</div>
      <div class="badge-bar">
        <span class="badge">🚨 WhatsApp Desconectado</span>
      </div>
    </div>
    <div class="content">
      <div class="alert-box">
        <div class="alert-title">⚠️ A conexão do WhatsApp com a Z-API foi interrompida!</div>
        <p class="alert-text">
          O sistema detectou que a instância de WhatsApp da CorpFlats perdeu a conexão com o servidor. A sessão no celular pode ter expirado, o aparelho pode estar desligado ou desconectado da internet.
        </p>
      </div>

      <div class="impact-box">
        <div class="impact-title">Impacto Imediato nas Operações:</div>
        <ul class="impact-list">
          <li><strong>Mensagens de Pré-Check-in e Confirmação:</strong> Não serão entregues aos hóspedes.</li>
          <li><strong>Instruções de Chegada e Senhas de Wi-Fi:</strong> Pausadas até reconexão.</li>
          <li><strong>Avisos de Café da Manhã e Check-out:</strong> Permanecerão retidos na fila.</li>
        </ul>
      </div>

      <table class="info-table">
        <tr>
          <td class="label">Data/Hora da Queda:</td>
          <td class="val">${dateFormatted}</td>
        </tr>
        <tr>
          <td class="label">Origem da Detecção:</td>
          <td class="val">${source === "webhook" ? "Webhook em Tempo Real (Z-API)" : "Watchdog Automático do Sistema"}</td>
        </tr>
        <tr>
          <td class="label">Motivo Informado:</td>
          <td class="val">${reason || "Desconexão de sessão / aparelho indisponível"}</td>
        </tr>
      </table>

      <div class="btn-container">
        <a href="${targetUrl}" class="btn-action" target="_blank">
          📱 Reconectar WhatsApp via QR Code Agora
        </a>
      </div>
    </div>
    <div class="footer">
      Alerta automático gerado pela plataforma CorpFlats / Guest Flow Manager.<br/>
      Para alterar preferências de alerta, acesse o painel em Conexão Z-API.
    </div>
  </div>
</body>
</html>`;
}

export function renderReconnectionAlertEmailHtml({ hotelName, connectedAt, phone, targetUrl }) {
  const dateFormatted = connectedAt ? new Date(connectedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : new Date().toLocaleString("pt-BR");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WhatsApp Reconectado com Sucesso</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #d1fae5; }
    .header { background: linear-gradient(135deg, #065f46 0%, #047857 100%); padding: 24px 30px; text-align: left; }
    .brand { color: #ecfdf5; font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
    .subbrand { color: #a7f3d0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 2px; }
    .badge-bar { margin-top: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; background: #ffffff; color: #047857; }
    .content { padding: 30px; }
    .success-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-left: 5px solid #10b981; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
    .success-title { font-size: 16px; font-weight: 800; color: #065f46; margin-bottom: 6px; }
    .success-text { font-size: 13px; color: #064e3b; line-height: 1.5; margin: 0; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .info-table td { padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .info-table .label { color: #64748b; font-weight: 600; width: 35%; }
    .info-table .val { color: #0f172a; font-weight: 700; }
    .btn-container { text-align: center; margin: 28px 0 16px 0; }
    .btn-action { display: inline-block; padding: 14px 28px; background: #0f172a; color: #ffffff !important; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 800; }
    .footer { background: #f8fafc; padding: 18px 30px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="brand">${hotelName}</div>
      <div class="subbrand">Alerta de Monitoramento de Infraestrutura</div>
      <div class="badge-bar">
        <span class="badge">🟢 Conexão Restabelecida</span>
      </div>
    </div>
    <div class="content">
      <div class="success-box">
        <div class="success-title">✅ WhatsApp Reconectado com Sucesso!</div>
        <p class="success-text">
          A conexão entre o WhatsApp e a Z-API foi restabelecida normalmente. O motor de automação voltou a operar e os disparos agendados estão sendo processados.
        </p>
      </div>

      <table class="info-table">
        <tr>
          <td class="label">Data/Hora da Reconexão:</td>
          <td class="val">${dateFormatted}</td>
        </tr>
        ${phone ? `<tr><td class="label">Número Conectado:</td><td class="val">+${phone}</td></tr>` : ""}
        <tr>
          <td class="label">Status das Operações:</td>
          <td class="val" style="color: #059669;">100% Operacional</td>
        </tr>
      </table>

      <div class="btn-container">
        <a href="${targetUrl}" class="btn-action" target="_blank">
          Ver Painel Z-API
        </a>
      </div>
    </div>
    <div class="footer">
      Alerta automático gerado pela plataforma CorpFlats / Guest Flow Manager.
    </div>
  </div>
</body>
</html>`;
}

// ── Disparadores de Alertas de Infraestrutura (E-mail e Webhook Externo) ──────

export async function sendDisconnectionAlertEmail({ db, recipient, reason, source, disconnectedAt }) {
  if (!recipient) return { success: false, error: "E-mail destinatário não fornecido" };
  const hotelName = db?.siteConfig?.branding?.brandName || "CorpFlats";
  const targetUrl = "https://corpflats.onrender.com/zapi-connection";
  const html = renderDisconnectionAlertEmailHtml({ hotelName, disconnectedAt, reason, source, targetUrl });
  const subject = `🚨 [URGENTE] WhatsApp CorpFlats Desconectado (Z-API) - Reconexão Necessária`;

  try {
    const config = getSmtpConfig(db);
    if (!config.user || !config.pass) {
      console.warn("[Z-API Alert] SMTP não configurado para envio de e-mail de alerta.");
      return { success: false, error: "SMTP não configurado" };
    }

    const transporter = createTransporter(db);
    if (!transporter) return { success: false, error: "Erro ao criar transporte SMTP" };

    const mailOptions = {
      from: `"${config.fromName} - Alertas" <${config.fromEmail}>`,
      to: recipient.trim(),
      subject,
      html,
      text: `🚨 [URGENTE] WhatsApp CorpFlats Desconectado na Z-API.\nData/Hora: ${disconnectedAt || new Date().toISOString()}\nMotivo: ${reason || 'Desconexão'}\nReconecte agora acessando: ${targetUrl}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Z-API Alert] ✓ E-mail de alerta de desconexão enviado para ${recipient} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Z-API Alert] ✗ Falha ao enviar e-mail de alerta:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function sendReconnectedAlertEmail({ db, recipient, connectedAt, phone }) {
  if (!recipient) return { success: false, error: "E-mail destinatário não fornecido" };
  const hotelName = db?.siteConfig?.branding?.brandName || "CorpFlats";
  const targetUrl = "https://corpflats.onrender.com/zapi-connection";
  const html = renderReconnectionAlertEmailHtml({ hotelName, connectedAt, phone, targetUrl });
  const subject = `✅ [RESTABELECIDO] WhatsApp Reconectado com Sucesso - Z-API CorpFlats`;

  try {
    const config = getSmtpConfig(db);
    if (!config.user || !config.pass) return { success: false, error: "SMTP não configurado" };

    const transporter = createTransporter(db);
    if (!transporter) return { success: false, error: "Erro ao criar transporte SMTP" };

    const mailOptions = {
      from: `"${config.fromName} - Alertas" <${config.fromEmail}>`,
      to: recipient.trim(),
      subject,
      html,
      text: `✅ [RESTABELECIDO] WhatsApp Reconectado com Sucesso na Z-API.\nData/Hora: ${connectedAt || new Date().toISOString()}\nNúmero: +${phone || 'Aparelho ativo'}\nPainel: ${targetUrl}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Z-API Alert] ✓ E-mail de reconexão enviado para ${recipient} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Z-API Alert] ✗ Falha ao enviar e-mail de reconexão:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function sendExternalAlertWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    let bodyPayload = payload;
    if (webhookUrl.includes("discord.com")) {
      bodyPayload = {
        content: payload.event === "disconnected"
          ? `🚨 **[URGENTE - CorpFlats]** WhatsApp Desconectado na Z-API!\n${payload.message}\nReconecte agora: ${payload.targetUrl || "https://corpflats.onrender.com/zapi-connection"}`
          : `✅ **[CorpFlats]** WhatsApp Reconectado com sucesso na Z-API!`,
        embeds: [{
          title: payload.title || "Alerta Z-API CorpFlats",
          description: payload.message,
          color: payload.event === "disconnected" ? 15158332 : 3066993,
          timestamp: new Date().toISOString()
        }]
      };
    } else if (webhookUrl.includes("slack.com")) {
      bodyPayload = {
        text: payload.event === "disconnected"
          ? `🚨 *[URGENTE - CorpFlats]* WhatsApp Desconectado na Z-API!\n${payload.message}\nReconecte: ${payload.targetUrl || "https://corpflats.onrender.com/zapi-connection"}`
          : `✅ *[CorpFlats]* WhatsApp Reconectado com sucesso!`
      };
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });
  } catch (err) {
    console.warn("[Z-API Alert] Falha ao disparar webhook externo de alerta:", err.message);
  }
}

// ── Sincronização Automática de Webhooks com a API da Z-API ───────────────────

export async function syncZapiWebhooks(config, appBaseUrl) {
  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  if (!instanceId || !token) {
    return { success: false, error: "Credenciais da Z-API incompletas (Instance ID e Token necessários)." };
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const cleanAppUrl = (appBaseUrl || "https://corpflats.onrender.com").replace(/\/+$/, "");
  const disconnectedWebhookUrl = `${cleanAppUrl}/api/whatsapp/webhook/disconnected`;
  const connectedWebhookUrl = `${cleanAppUrl}/api/whatsapp/webhook/connected`;
  const receivedWebhookUrl = `${cleanAppUrl}/api/whatsapp/webhook/received`;

  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const results = {
    disconnected: { ok: false },
    connected: { ok: false },
    received: { ok: false },
    disconnectedUrl: disconnectedWebhookUrl,
    connectedUrl: connectedWebhookUrl,
    receivedUrl: receivedWebhookUrl
  };

  try {
    const resDisc = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/update-webhook-disconnected`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value: disconnectedWebhookUrl })
    });
    results.disconnected.ok = resDisc.ok;
    results.disconnected.status = resDisc.status;
    results.disconnected.data = await resDisc.json().catch(() => ({}));
  } catch (err) {
    results.disconnected.error = err.message;
  }

  try {
    const resConn = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/update-webhook-connected`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value: connectedWebhookUrl })
    });
    results.connected.ok = resConn.ok;
    results.connected.status = resConn.status;
    results.connected.data = await resConn.json().catch(() => ({}));
  } catch (err) {
    results.connected.error = err.message;
  }

  try {
    const resRecv = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/update-webhook-received`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value: receivedWebhookUrl })
    });
    results.received.ok = resRecv.ok;
    results.received.status = resRecv.status;
    results.received.data = await resRecv.json().catch(() => ({}));
  } catch (err) {
    results.received.error = err.message;
  }

  try {
    const resSent = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/update-notify-sent-by-me`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ value: true, notifySentByMe: true })
    });
    results.notifySentByMe = {
      ok: resSent.ok,
      status: resSent.status,
      data: await resSent.json().catch(() => ({}))
    };
  } catch (err) {
    results.notifySentByMe = { ok: false, error: err.message };
  }

  const overallSuccess = results.disconnected.ok || results.connected.ok || results.received.ok || results.notifySentByMe?.ok;
  return {
    success: overallSuccess,
    results,
    disconnectedUrl: disconnectedWebhookUrl,
    connectedUrl: connectedWebhookUrl,
    receivedUrl: receivedWebhookUrl
  };
}

// ── Manipuladores Centrais de Eventos de Queda & Reconexão ────────────────────

export async function handleDisconnectionEvent({ db, saveDatabase, createNotification, reason, source, details, isTest = false }) {
  if (!db) return;
  const now = new Date();
  const nowIso = now.toISOString();

  // Cooldown de segurança (evita spam de e-mails em menos de 15 min a menos que seja teste ou troca de status)
  const lastState = db.zapiConfig?.connectionState;
  const lastAlertTime = db.zapiConfig?.lastAlertSentAt ? new Date(db.zapiConfig.lastAlertSentAt).getTime() : 0;
  const cooldownPassed = (now.getTime() - lastAlertTime) > 15 * 60 * 1000;

  // Bloqueia se: não é teste E (já está marcado como desconectado OU alerta enviado recentemente)
  if (!isTest && !cooldownPassed && lastAlertTime > 0) {
    console.log(`[Z-API Watchdog] Cooldown ativo — alerta de desconexão enviado há menos de 15min. Ignorando.`);
    return;
  }

  if (!isTest && lastState === "disconnected" && !cooldownPassed && lastAlertTime === 0) {
    console.log(`[Z-API Watchdog] Instância já marcada como desconectada (alerta enviado há menos de 15 min).`);
    return;
  }

  if (!isTest) {
    db.zapiConfig.connectionState = "disconnected";
    db.zapiConfig.disconnectedAt = nowIso;
    db.zapiConfig.lastDisconnectReason = reason || "Desconexão do WhatsApp / Instância inativa";
    db.zapiConfig.lastAlertSentAt = nowIso;

    if (!db.zapiConnectionLogs) db.zapiConnectionLogs = [];
    db.zapiConnectionLogs.unshift({
      id: `conn_${Date.now()}`,
      event: "disconnected",
      timestamp: nowIso,
      source: source || "webhook",
      reason: reason || "Desconexão detectada",
      details: details || null
    });
    if (db.zapiConnectionLogs.length > 50) {
      db.zapiConnectionLogs = db.zapiConnectionLogs.slice(0, 50);
    }
    if (typeof saveDatabase === "function") saveDatabase();
  }

  // 1. Notificação no PMS (Banner sonoro / alta prioridade)
  if (typeof createNotification === "function") {
    createNotification({
      category: "system",
      title: isTest ? "🔔 [TESTE] WhatsApp Desconectado (Simulação)" : "🚨 ALERTA CRÍTICO: WhatsApp Desconectado!",
      message: isTest 
        ? "Simulação de teste concluída com sucesso. O sistema de monitoramento está ativo e pronto para avisar sobre quedas da Z-API."
        : "A conexão do WhatsApp com a Z-API foi interrompida. Mensagens automáticas para hóspedes estão pausadas. Reconecte o QR Code imediatamente.",
      severity: "critical",
      targetUrl: "/zapi-connection",
      metadata: {
        source,
        reason,
        timestamp: nowIso,
        isTest
      }
    });
  }

  // 2. Disparo de E-mail Urgente
  const recipientEmail = db.zapiConfig?.alertEmail || db.settings?.adminEmail || "millerpessanha@gmail.com";
  if (db.zapiConfig?.alertEmailEnabled !== false && recipientEmail) {
    sendDisconnectionAlertEmail({
      db,
      recipient: recipientEmail,
      reason: isTest ? "Disparo de Teste / Simulação Manual pelo Painel" : reason,
      source,
      disconnectedAt: nowIso
    }).catch(() => {});
  }

  // 3. Disparo de Webhook Externo (Slack / Discord / n8n)
  const extWebhook = db.zapiConfig?.externalWebhookUrl;
  if (db.zapiConfig?.externalWebhookEnabled && extWebhook) {
    sendExternalAlertWebhook(extWebhook, {
      event: "disconnected",
      title: isTest ? "🔔 [TESTE] Z-API CorpFlats Desconectado" : "🚨 [URGENTE] Z-API CorpFlats Desconectado!",
      message: `WhatsApp perdeu conexão com a Z-API às ${now.toLocaleTimeString("pt-BR")}. Motivo: ${reason || 'Queda de sessão'}.`,
      targetUrl: "https://corpflats.onrender.com/zapi-connection",
      timestamp: nowIso,
      details
    }).catch(() => {});
  }
}

export async function handleConnectionEvent({ db, saveDatabase, createNotification, source, details }) {
  if (!db) return;
  const now = new Date();
  const nowIso = now.toISOString();

  const prevState = db.zapiConfig?.connectionState;
  db.zapiConfig.connectionState = "connected";
  db.zapiConfig.connectedAt = nowIso;
  db.zapiConfig.disconnectedAt = null;

  if (!db.zapiConnectionLogs) db.zapiConnectionLogs = [];
  db.zapiConnectionLogs.unshift({
    id: `conn_${Date.now()}`,
    event: "connected",
    timestamp: nowIso,
    source: source || "webhook",
    phone: details?.phone || details?.smartphone?.phone || "",
    details: details || null
  });
  if (db.zapiConnectionLogs.length > 50) {
    db.zapiConnectionLogs = db.zapiConnectionLogs.slice(0, 50);
  }
  if (typeof saveDatabase === "function") saveDatabase();

  // Se o estado anterior era "disconnected", emite notificação de resolução!
  if (prevState === "disconnected") {
    if (typeof createNotification === "function") {
      createNotification({
        category: "system",
        title: "✅ WhatsApp Reconectado com Sucesso!",
        message: "A conexão do WhatsApp com a Z-API foi restabelecida. O envio das mensagens automáticas aos hóspedes foi retomado.",
        severity: "normal",
        targetUrl: "/zapi-connection",
        metadata: {
          source,
          timestamp: nowIso
        }
      });
    }

    const recipientEmail = db.zapiConfig?.alertEmail || db.settings?.adminEmail || "millerpessanha@gmail.com";
    if (db.zapiConfig?.alertOnReconnect !== false && recipientEmail) {
      sendReconnectedAlertEmail({
        db,
        recipient: recipientEmail,
        connectedAt: nowIso,
        phone: details?.phone || details?.smartphone?.phone || ""
      }).catch(() => {});
    }

    const extWebhook = db.zapiConfig?.externalWebhookUrl;
    if (db.zapiConfig?.externalWebhookEnabled && extWebhook) {
      sendExternalAlertWebhook(extWebhook, {
        event: "connected",
        title: "✅ [RESTABELECIDO] Z-API WhatsApp Conectado",
        message: `A conexão do WhatsApp foi restabelecida com sucesso às ${now.toLocaleTimeString("pt-BR")}.`,
        targetUrl: "https://corpflats.onrender.com/zapi-connection",
        timestamp: nowIso,
        details
      }).catch(() => {});
    }
  }
}

// ── Monitoramento Inteligente do Grupo da Portaria (WhatsApp Concierge) ────────

export function getBrasiliaNow() {
  const offset = Number(global.__simulatedTimeOffsetMs || 0);
  const d = new Date(Date.now() + offset);
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const brl = new Date(utc - (3 * 3600000));
  const date = brl.toISOString().split("T")[0];
  const timeStr = brl.toTimeString().split(" ")[0].slice(0, 5);
  return { date, timeStr, fullDate: brl };
}

export function isTimeBefore(t1, t2) {
  if (!t1 || !t2) return false;
  return String(t1).localeCompare(String(t2)) < 0;
}

export function extractIncomingMessageInfo(body) {
  if (!body || typeof body !== "object") return null;

  const isGroup = Boolean(
    body.isGroup ||
    body.chatType === "group" ||
    String(body.phone || "").includes("@g.us") ||
    String(body.phone || "").includes("-group") ||
    String(body.chatId || "").includes("@g.us") ||
    String(body.data?.key?.remoteJid || "").includes("@g.us") ||
    String(body.key?.remoteJid || "").includes("@g.us")
  );

  const groupId = isGroup
    ? String(body.phone || body.chatId || body.data?.key?.remoteJid || body.key?.remoteJid || "").trim()
    : null;

  const groupName = String(
    body.chatName || body.groupName || body.chat?.name || body.name || ""
  ).trim();

  const senderPhone = String(
    body.participantPhone || body.participant || body.senderPhone || body.sender || body.data?.participant || ""
  ).replace(/\D/g, "");

  const fromMe = Boolean(
    body.fromMe || 
    body.isFromMe || 
    body.isMyMessage || 
    body.data?.fromMe || 
    body.data?.key?.fromMe || 
    body.key?.fromMe || 
    body.data?.isFromMe
  );

  const phone = String(
    body.phone || body.chatId || body.recipientPhone || body.recipient || body.to || ""
  ).replace(/\D/g, "");

  let senderName = String(
    body.senderName || body.pushName || body.notifyName || body.data?.senderName || ""
  ).trim();
  if (!senderName && fromMe) {
    senderName = "Você (CorpFlats)";
  }

  let text = "";
  if (typeof body.text === "string") {
    text = body.text;
  } else if (body.text && typeof body.text.message === "string") {
    text = body.text.message;
  } else if (body.message) {
    if (typeof body.message === "string") text = body.message;
    else if (body.message.conversation) text = body.message.conversation;
    else if (body.message.extendedTextMessage?.text) text = body.message.extendedTextMessage.text;
  } else if (body.data?.message) {
    if (typeof body.data.message === "string") text = body.data.message;
    else if (body.data.message.conversation) text = body.data.message.conversation;
    else if (body.data.message.extendedTextMessage?.text) text = body.data.message.extendedTextMessage.text;
  } else if (typeof body.body === "string") {
    text = body.body;
  } else if (typeof body.content === "string") {
    text = body.content;
  }

  let type = "text";
  let mediaUrl = null;
  let fileName = null;
  let caption = "";

  if (body.image || body.imageUrl || body.data?.message?.imageMessage) {
    type = "image";
    mediaUrl = body.image?.imageUrl || body.imageUrl || body.data?.message?.imageMessage?.url || body.data?.message?.imageMessage?.directPath || "";
    caption = body.image?.caption || body.caption || body.data?.message?.imageMessage?.caption || "";
  } else if (body.audio || body.audioUrl || body.data?.message?.audioMessage) {
    type = "audio";
    mediaUrl = body.audio?.audioUrl || body.audioUrl || body.data?.message?.audioMessage?.url || body.data?.message?.audioMessage?.directPath || "";
  } else if (body.document || body.documentUrl || body.data?.message?.documentMessage) {
    type = "document";
    mediaUrl = body.document?.documentUrl || body.documentUrl || body.data?.message?.documentMessage?.url || "";
    fileName = body.document?.fileName || body.fileName || body.data?.message?.documentMessage?.fileName || "Documento.pdf";
    caption = body.document?.caption || body.caption || "";
  } else if (body.video || body.videoUrl || body.data?.message?.videoMessage) {
    type = "video";
    mediaUrl = body.video?.videoUrl || body.videoUrl || body.data?.message?.videoMessage?.url || "";
    caption = body.video?.caption || body.caption || "";
  } else if (body.location || body.data?.message?.locationMessage) {
    type = "location";
  }

  const messageId = String(body.messageId || body.id || body.data?.key?.id || body.key?.id || `msg_${Date.now()}`);

  return {
    isGroup,
    groupId,
    groupName,
    phone,
    senderPhone,
    senderName,
    fromMe,
    text: text ? text.trim() : (caption ? caption.trim() : (type !== "text" ? `[${type}]` : "")),
    type,
    mediaUrl,
    fileName,
    caption,
    messageId,
    timestamp: body.momment || body.moment || body.timestamp || new Date().toISOString()
  };
}

export function parseConciergeCheckoutMessage(text, registeredFlats = []) {
  if (!text || typeof text !== "string") {
    return { matchedFlats: [], otherFlats: [], extractedNumbers: [] };
  }

  // Sanitiza o texto mascarando datas (ex: 15/09/2026), horários (ex: 11:30) e telefones/CPFs (ex: 5522997124021)
  let cleanText = text
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ") // Remove datas
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")       // Remove horários
    .replace(/\b\d{7,}\b/g, " ");                       // Remove telefones/documentos longos

  // Extrai candidatos numéricos com 2 a 4 dígitos
  const matches = cleanText.match(/\b\d{2,4}\b/g) || [];
  const uniqueCandidates = [...new Set(matches)];

  const matchedFlats = [];
  const otherFlats = [];
  const commonYears = new Set(["2024", "2025", "2026", "2027", "2028"]);

  for (const cand of uniqueCandidates) {
    const foundFlat = registeredFlats.find(f => {
      const numStr = String(f.number || "").replace(/\D/g, "");
      return numStr === cand;
    });

    if (foundFlat) {
      if (!matchedFlats.some(m => m.id === foundFlat.id)) {
        matchedFlats.push(foundFlat);
      }
    } else {
      // Flats de terceiros (somente 3 ou 4 dígitos e não ano comum)
      if (cand.length >= 3 && cand.length <= 4 && !commonYears.has(cand)) {
        if (!otherFlats.includes(cand)) {
          otherFlats.push(cand);
        }
      }
    }
  }

  return {
    matchedFlats,
    otherFlats,
    extractedNumbers: uniqueCandidates
  };
}

export async function handleConciergeGroupMessage({
  db,
  saveDatabase,
  createNotification,
  incomingInfo,
  isTest = false
}) {
  if (!db) return { success: false, error: "Database not available" };
  const config = db.zapiConfig || {};

  // Governança de canal: se canal reception estiver pausado (enabled === false) e não for teste
  const receptionChannel = config.channels?.reception;
  if (receptionChannel && receptionChannel.enabled === false && !isTest) {
    return { success: false, ignored: true, reason: "Monitoramento do grupo da portaria pausado pela governança do canal reception" };
  }

  // Se monitoramento estiver desativado nas configs e não for teste
  if (config.conciergeMonitoringEnabled === false && !isTest) {
    return { success: false, ignored: true, reason: "Monitoramento do grupo da portaria desativado" };
  }

  const registeredFlats = db.flats || [];

  // Se não for teste, valida se a mensagem é de grupo e do grupo correto
  if (!isTest) {
    if (!incomingInfo.isGroup) {
      return { success: false, ignored: true, reason: "Mensagem individual (não é de grupo)" };
    }

    const targetGroupId = config.conciergeGroupId?.trim();
    const targetGroupName = config.conciergeGroupName?.trim();

    if (targetGroupId) {
      const incomingGid = String(incomingInfo.groupId || "").toLowerCase();
      if (!incomingGid.includes(targetGroupId.toLowerCase()) && !targetGroupId.toLowerCase().includes(incomingGid)) {
        return { success: false, ignored: true, reason: "Mensagem de outro grupo (ID não corresponde ao configurado)" };
      }
    } else if (targetGroupName) {
      const incomingGname = String(incomingInfo.groupName || "").toLowerCase();
      if (incomingGname && !incomingGname.includes(targetGroupName.toLowerCase()) && !targetGroupName.toLowerCase().includes(incomingGname)) {
        return { success: false, ignored: true, reason: "Mensagem de outro grupo (Nome não corresponde ao da portaria/checkout)" };
      }
    } else {
      // Se nenhum grupo foi configurado ainda, aceita se o nome for relacionado a checkout/portaria ou se o payload não trouxe o chatName
      const gName = String(incomingInfo.groupName || "").toLowerCase();
      const isCheckoutRelatedGroup = !gName || /checkout|check-?out|portaria|recep[cç][aã]o|condom|sa[ií]da|limpeza|governan[cç]a|flat|quarto|apto|corpflats|hotel/i.test(gName);
      if (!isCheckoutRelatedGroup) {
        return { success: false, ignored: true, reason: "Grupo não configurado e nome não relacionado a check-out/portaria" };
      }
    }

    // Se estiver ativado exigir palavras-chave
    if (config.conciergeRequireKeywords) {
      const hasKeywords = /check-?out|sa[ií]da|desocupad|liberad|chave|entreg|saiu|livre|vago|quarto|flat|apt|apto/i.test(incomingInfo.text);
      if (!hasKeywords) {
        return { success: false, ignored: true, reason: "Mensagem sem palavras-chave de check-out" };
      }
    }
  }

  const { matchedFlats, otherFlats, extractedNumbers } = parseConciergeCheckoutMessage(incomingInfo.text, registeredFlats);

  if (matchedFlats.length === 0 && otherFlats.length === 0) {
    return { success: false, ignored: true, reason: "Nenhum número de apartamento identificado no texto", text: incomingInfo.text };
  }

  // Auto-vincula o grupo se ainda não estiver configurado e a mensagem contiver flats nossos
  if (!config.conciergeGroupId && incomingInfo.groupId && matchedFlats.length > 0) {
    config.conciergeGroupId = incomingInfo.groupId;
    if (incomingInfo.groupName) config.conciergeGroupName = incomingInfo.groupName;
    if (typeof saveDatabase === "function") saveDatabase();
    console.log(`[Z-API Portaria] Grupo de checkout vinculado automaticamente: ${config.conciergeGroupName || config.conciergeGroupId}`);
  }

  const now = new Date().toISOString();
  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;
  const timeStr = nowBrl.timeStr;
  const senderLabel = incomingInfo.senderName 
    ? `${incomingInfo.senderName}` 
    : (incomingInfo.fromMe ? "Você (CorpFlats)" : "Portaria");

  const updatedFlatsList = [];

  for (const flat of matchedFlats) {
    // 1. Marca o flat como desocupado
    flat.isOccupied = false;
    flat.updatedAt = now;

    // 2. Cria ou atualiza solicitação de limpeza no dashboard
    if (!db.cleaningRequests) db.cleaningRequests = [];
    let cleanReq = db.cleaningRequests.find(r =>
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.requestDate === todayStr &&
      !r.isInstructionOnly &&
      r.source !== "manual_instruction" &&
      r.type !== "bed_adjustment_only" &&
      r.type !== "instruction"
    );

    if (cleanReq) {
      if (cleanReq.isDeleted || cleanReq.status === "deleted") {
        cleanReq.isDeleted = false;
        cleanReq.status = "dirty";
        cleanReq.completedAt = null;
        cleanReq.cleaningStartedAt = null;
        cleanReq.willCleanAt = null;
        delete cleanReq.deletedAt;
        delete cleanReq.deletedBy;
        delete cleanReq.deletedReservationId;
      }
      cleanReq.isVacant = true; // Quarto desocupado informado pela portaria
      cleanReq.isVacantExplicitlySet = true;
      cleanReq.vacantSource = "reception_checkout";
      cleanReq.vacantSetAt = now;
      cleanReq.leavingGuest = cleanReq.leavingGuest || senderLabel;
      // Notas do card são reservadas estritamente para itens sem indicador dedicado na interface
      if (cleanReq.pendingObservation) {
        cleanReq.pendingObservation = sanitizeCardNote(cleanReq.pendingObservation);
      }
      cleanReq.updatedAt = now;
    } else {
      cleanReq = {
        id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => r.id)) + 1 : 1,
        flatId: flat.id,
        flatNumber: flat.number,
        requestDate: todayStr,
        source: "whatsapp_concierge",
        status: "dirty",
        assignedUserId: null,
        isVacant: true, // Já desocupado
        isVacantExplicitlySet: true,
        vacantSource: "reception_checkout",
        vacantSetAt: now,
        isPriority: false,
        leavingGuest: senderLabel,
        arrivingGuest: null,
        pendingObservation: null, // Sem nota redundante; o indicador visual do card já exibe "Desocupado"
        willCleanAt: null,
        cleaningStartedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      };
      db.cleaningRequests.unshift(cleanReq);
    }

    // 3. Atualiza reservas com saída prevista para hoje (nunca marca hóspedes entrando hoje ou em meio de estadia)
    const matchingResList = (db.reservations || []).filter(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkoutDate === todayStr
    );
    for (const r of matchingResList) {
      if (!r.actualCheckoutAt) {
        r.actualCheckoutAt = now;
        r.actualCheckoutTime = timeStr;
      }
      r.status = "completed";
      r.checkoutDone = true;
      r.checkoutMethod = r.checkoutMethod ? `${r.checkoutMethod} + portaria_whatsapp` : "portaria_whatsapp";
      r.updatedAt = now;

      // Dispara o gatilho pós check-out garantindo não-duplicação caso o hóspede já tenha informado
      await triggerCheckoutWhatsApp(db, saveDatabase, r, `portaria_whatsapp (${senderLabel})`).catch(e => {
        console.warn("[Concierge Checkout Trigger]:", e.message);
      });
    }

    // Garante o cancelamento de lembretes de estadia/check-out na fila para o flat mesmo se a reserva já estava como completed antes
    cancelPendingStayRemindersForCheckout(db, saveDatabase, {
      flatId: flat.id,
      flatNumber: flat.number,
      reason: `Cancelado: check-out informado na portaria via WhatsApp (${senderLabel})`
    });

    // 4. Reconciliação de café da manhã para hoje (cancela se checkout ocorreu antes do horário do café)
    if (!db.breakfastOrders) db.breakfastOrders = [];
    db.breakfastOrders.forEach(o => {
      const isMatch = String(o.roomNumber) === String(flat.number) || matchingResList.some(mr => mr.code === o.reservationCode || mr.id === o.reservationId);
      const deliveryTime = o.deliveryTime || "08:00";
      if (isMatch && o.date === todayStr && o.status !== "cancelled" && isTimeBefore(timeStr, deliveryTime)) {
        o.status = "cancelled";
        o.cancelReason = `Check-out Portaria (WhatsApp): Quarto desocupado às ${timeStr} antes do café (${deliveryTime})`;
      }
    });

    // 5. Notificação no sino do sistema
    if (typeof createNotification === "function") {
      createNotification({
        category: "checkout",
        title: `🚪 Check-out Portaria - Apt ${flat.number}`,
        message: `Saída do Apt ${flat.number} informada no WhatsApp por ${senderLabel}. Quarto desocupado e pronto para limpeza!`,
        severity: "info",
        metadata: { flatId: flat.id, flatNumber: flat.number, source: "whatsapp_concierge", sender: senderLabel, isTest },
        targetUrl: "/dashboard"
      });
    }

    updatedFlatsList.push(flat.number);
  }

  // 6. Registro no histórico de auditoria da portaria
  if (!db.conciergeWhatsappLogs) db.conciergeWhatsappLogs = [];
  const logEntry = {
    id: `concierge_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    timeStr,
    groupName: incomingInfo.groupName || (isTest ? "Simulação de Teste" : "Grupo da Portaria"),
    groupId: incomingInfo.groupId || "",
    senderName: senderLabel,
    senderPhone: incomingInfo.senderPhone || "",
    rawText: incomingInfo.text,
    matchedFlats: updatedFlatsList,
    otherFlats: otherFlats,
    extractedNumbers,
    isTest
  };
  db.conciergeWhatsappLogs.unshift(logEntry);
  if (db.conciergeWhatsappLogs.length > 100) {
    db.conciergeWhatsappLogs = db.conciergeWhatsappLogs.slice(0, 100);
  }

  if (typeof saveDatabase === "function") {
    saveDatabase();
  }

  return {
    success: true,
    processedCount: updatedFlatsList.length,
    updatedFlats: updatedFlatsList,
    otherFlatsIgnored: otherFlats,
    log: logEntry
  };
}

export async function getZapiGroups(config) {
  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  if (!instanceId || !token) {
    return { success: false, error: "Credenciais da Z-API incompletas.", groups: [] };
  }

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    let res = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/chats`, {
      method: "GET",
      headers
    });
    
    if (!res.ok && res.status === 404) {
      res = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/groups`, {
        method: "GET",
        headers
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.message || `Erro status ${res.status}`, groups: [] };
    }

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.chats || data.groups || data.value || []);
    
    const groups = list
      .filter(c => c.isGroup || String(c.phone || c.id || "").includes("@g.us") || String(c.phone || c.id || "").includes("-group"))
      .map(c => ({
        id: String(c.phone || c.id || c.chatId || "").trim(),
        name: String(c.name || c.chatName || c.title || c.phone || "Grupo sem nome").trim(),
        unread: c.unread || 0,
        participantsCount: c.participantsCount || c.participants?.length || null
      }));

    return { success: true, groups };
  } catch (err) {
    return { success: false, error: err.message, groups: [] };
  }
}

// ── Formatador de Telefone para Interface do Chat ──────────────────────────────
export function formatPhoneDisplay(phone = "") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return phone;
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

// ── Extrator e Localizador de Telefones de Reserva e Hóspede ──────────────────
export function getReservationPhones(r, db) {
  if (!r) return [];
  const phones = new Set();
  if (r.guestPhone) phones.add(String(r.guestPhone));
  if (r.phone) phones.add(String(r.phone));
  if (r.whatsapp) phones.add(String(r.whatsapp));
  if (r.contactPhone) phones.add(String(r.contactPhone));
  if (r.guestWhatsapp) phones.add(String(r.guestWhatsapp));
  if (r.requesterInfo?.phone) phones.add(String(r.requesterInfo.phone));
  if (r.requesterInfo?.whatsapp) phones.add(String(r.requesterInfo.whatsapp));
  if (r.requesterPhone) phones.add(String(r.requesterPhone));

  if (Array.isArray(r.guests)) {
    for (const g of r.guests) {
      if (typeof g === "string") {
        phones.add(g);
      } else if (g && typeof g === "object") {
        if (g.phone) phones.add(String(g.phone));
        if (g.whatsapp) phones.add(String(g.whatsapp));
      }
    }
  }

  if (db?.guests && Array.isArray(db.guests)) {
    let guest = null;
    if (r.guestId) {
      guest = db.guests.find(g => g.id === r.guestId || String(g.id) === String(r.guestId));
    }
    if (!guest && r.guestCode) {
      guest = db.guests.find(g => g.guestCode === r.guestCode);
    }
    if (!guest && r.guestName) {
      const norm = String(r.guestName).trim().toLowerCase();
      if (norm.length >= 3) {
        guest = db.guests.find(g => g.name && String(g.name).trim().toLowerCase() === norm);
      }
    }
    if (guest) {
      if (guest.phone) phones.add(String(guest.phone));
      if (guest.whatsapp) phones.add(String(guest.whatsapp));
    }
  }

  return Array.from(phones).filter(Boolean);
}

export function doesReservationMatchPhone(r, cleanTargetPhone, db) {
  if (!cleanTargetPhone || !r) return false;
  const targetLast8 = cleanTargetPhone.slice(-8);
  const targetLast9 = cleanTargetPhone.slice(-9);
  const candidatePhones = getReservationPhones(r, db);

  for (const p of candidatePhones) {
    const cleanCand = cleanWhatsAppPhone(p);
    if (!cleanCand) continue;
    if (cleanCand === cleanTargetPhone) return true;
    if (targetLast9 && cleanCand.endsWith(targetLast9)) return true;
    if (targetLast8 && cleanCand.endsWith(targetLast8)) return true;
  }
  return false;
}

export function findAllReservationsByPhone(db, phone) {
  if (!db?.reservations || !phone) return [];
  const cleanP = cleanWhatsAppPhone(phone);
  if (!cleanP) return [];

  return (db.reservations || []).filter(r => doesReservationMatchPhone(r, cleanP, db));
}

// ── Localizador da Melhor Reserva por Telefone (Classificação por Tiers) ────────
export function findReservationByPhone(db, phone) {
  const matched = findAllReservationsByPhone(db, phone);
  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0];

  const now = new Date();
  const brasiliaFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayStr = brasiliaFormatter.format(now);

  // TIER 1: Estadia Ativa Hoje (check-in <= hoje <= checkout, e status não cancelada)
  const activeToday = matched.filter(r => 
    r.status !== "cancelada" &&
    r.checkinDate && r.checkoutDate &&
    r.checkinDate <= todayStr && r.checkoutDate >= todayStr
  );
  if (activeToday.length > 0) {
    activeToday.sort((a, b) => {
      // a) Reservas confirmadas/reais sobre pré-reservas
      const aStatus = String(a.status || "").toLowerCase().trim();
      const bStatus = String(b.status || "").toLowerCase().trim();
      const aConfirmed = (aStatus !== "pre_reserva" && aStatus !== "pendente") ? 1 : 0;
      const bConfirmed = (bStatus !== "pre_reserva" && bStatus !== "pendente") ? 1 : 0;
      if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed;

      // b) Estadias que continuam além de hoje (checkoutDate > todayStr)
      const aStaysBeyond = (a.checkoutDate && a.checkoutDate > todayStr) ? 1 : 0;
      const bStaysBeyond = (b.checkoutDate && b.checkoutDate > todayStr) ? 1 : 0;
      if (bStaysBeyond !== aStaysBeyond) return bStaysBeyond - aStaysBeyond;

      // c) Maior checkoutDate
      const cmpCheckout = String(b.checkoutDate || "").localeCompare(String(a.checkoutDate || ""));
      if (cmpCheckout !== 0) return cmpCheckout;

      // d) Maior ID numérico ou recência de criação
      const aId = Number(a.id) || (typeof a.id === "string" ? parseInt(a.id.replace(/\D/g, ""), 10) || 0 : 0);
      const bId = Number(b.id) || (typeof b.id === "string" ? parseInt(b.id.replace(/\D/g, ""), 10) || 0 : 0);
      if (bId !== aId) return bId - aId;

      const aCreated = new Date(a.createdAt || a.created_at || 0).getTime() || 0;
      const bCreated = new Date(b.createdAt || b.created_at || 0).getTime() || 0;
      if (bCreated !== aCreated) return bCreated - aCreated;

      return String(b.code || "").localeCompare(String(a.code || ""));
    });
    return activeToday[0];
  }

  // TIER 2: Próxima Reserva Futura (checkin > hoje, não cancelada)
  const future = matched.filter(r => {
    const s = String(r.status || "").toLowerCase().trim();
    return s !== "cancelada" && s !== "cancelled" && s !== "cancelado" &&
      r.checkinDate && r.checkinDate > todayStr;
  });
  if (future.length > 0) {
    future.sort((a, b) => {
      const cmpDate = String(a.checkinDate).localeCompare(String(b.checkinDate));
      if (cmpDate !== 0) return cmpDate;
      const aStatus = String(a.status || "").toLowerCase().trim();
      const bStatus = String(b.status || "").toLowerCase().trim();
      const aConfirmed = (aStatus !== "pre_reserva" && aStatus !== "pendente") ? 1 : 0;
      const bConfirmed = (bStatus !== "pre_reserva" && bStatus !== "pendente") ? 1 : 0;
      if (bConfirmed !== aConfirmed) return bConfirmed - aConfirmed;
      const aId = Number(a.id) || (typeof a.id === "string" ? parseInt(a.id.replace(/\D/g, ""), 10) || 0 : 0);
      const bId = Number(b.id) || (typeof b.id === "string" ? parseInt(b.id.replace(/\D/g, ""), 10) || 0 : 0);
      return bId - aId;
    });
    return future[0];
  }

  // TIER 3: Estadias Passadas Mais Recentes (checkout < hoje)
  const past = matched.filter(r => 
    r.checkoutDate && r.checkoutDate < todayStr
  );
  if (past.length > 0) {
    past.sort((a, b) => String(b.checkoutDate).localeCompare(String(a.checkoutDate)));
    return past[0];
  }

  return matched[0];
}

// ── Inclusão de Mensagem na Conversa do WhatsApp ───────────────────────────────
export function appendMessageToConversation(db, {
  phone,
  senderName = "",
  senderPhone = "",
  fromMe = false,
  text = "",
  type = "text",
  mediaUrl = null,
  fileName = null,
  caption = null,
  buttons = [],
  triggerEvent = null,
  reservationCode = null,
  status = "delivered",
  timestamp = null,
  messageId = null,
  isGroup = false,
  groupId = null,
  groupName = null
}) {
  if (!db) return null;
  if (!db.whatsappConversations) db.whatsappConversations = [];

  const rawPhone = isGroup && groupId ? groupId : phone;
  const cleanPhone = isGroup ? rawPhone : (cleanWhatsAppPhone(rawPhone) || rawPhone);
  if (!cleanPhone) return null;

  let conv = db.whatsappConversations.find(c => c.phone === cleanPhone || c.id === cleanPhone);

  const matchedResv = reservationCode
    ? (db.reservations || []).find(r => r.code === reservationCode)
    : findReservationByPhone(db, cleanPhone);

  const nowIso = timestamp || new Date().toISOString();
  const isDev = isDeveloperPhone(cleanPhone, db);

  if (!conv) {
    conv = {
      id: cleanPhone,
      phone: cleanPhone,
      formattedPhone: isGroup ? groupName || cleanPhone : formatPhoneDisplay(cleanPhone),
      name: isGroup ? groupName || "Grupo WhatsApp" : (isDev ? "Miller Mendonça (Desenvolvedor)" : (matchedResv?.guestName || senderName || formatPhoneDisplay(cleanPhone))),
      avatarUrl: "",
      isGroup: Boolean(isGroup),
      groupId: groupId || null,
      groupName: groupName || null,
      unreadCount: fromMe ? 0 : 1,
      pinned: false,
      isDeveloper: isDev,
      aiPaused: false,
      aiPausedReason: null,
      reservationCode: matchedResv?.code || null,
      flatNumber: matchedResv?.flatNumber || "",
      checkinDate: matchedResv?.checkinDate || "",
      checkoutDate: matchedResv?.checkoutDate || "",
      status: matchedResv?.status || "confirmada",
      paymentStatus: matchedResv?.paymentStatus || "",
      totalAmount: matchedResv?.totalAmount || 0,
      lastMessage: null,
      updatedAt: nowIso,
      messages: []
    };
    db.whatsappConversations.unshift(conv);
  } else {
    if (isDev) {
      conv.isDeveloper = true;
      conv.aiPaused = false;
      conv.aiPausedReason = null;
      if (!conv.name || conv.name === conv.phone) {
        conv.name = "Miller Mendonça (Desenvolvedor)";
      }
    }
    if (!conv.reservationCode && matchedResv) {
      conv.reservationCode = matchedResv.code;
      conv.flatNumber = matchedResv.flatNumber;
      conv.checkinDate = matchedResv.checkinDate;
      conv.checkoutDate = matchedResv.checkoutDate;
      conv.status = matchedResv.status;
      conv.paymentStatus = matchedResv.paymentStatus;
      conv.totalAmount = matchedResv.totalAmount;
    }
    if (senderName && !fromMe && (!conv.name || conv.name === conv.phone)) {
      conv.name = senderName;
    }
  }

  const finalMsgId = messageId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const exists = conv.messages.some(m => 
    (m.messageId && m.messageId === finalMsgId) || 
    (m.id === finalMsgId) || 
    (m.timestamp === nowIso && m.text === text && m.fromMe === fromMe)
  );

  if (exists) {
    return conv;
  }

  const newMsg = {
    id: finalMsgId,
    messageId: finalMsgId,
    fromMe: Boolean(fromMe),
    senderName: fromMe ? "CorpFlats" : (senderName || conv.name),
    senderPhone: senderPhone || "",
    text: text || "",
    type: type || "text",
    mediaUrl: mediaUrl || null,
    fileName: fileName || null,
    caption: caption || null,
    buttons: Array.isArray(buttons) ? buttons : [],
    triggerEvent: triggerEvent || null,
    reservationCode: reservationCode || null,
    timestamp: nowIso,
    status: fromMe ? (status || "read") : "delivered"
  };

  conv.messages.push(newMsg);
  if (conv.messages.length > 300) {
    conv.messages = conv.messages.slice(-300);
  }

  conv.lastMessage = {
    text: newMsg.text || (newMsg.type === "document" ? `📄 ${newMsg.fileName || "Documento"}` : (newMsg.type === "image" ? "📷 Foto" : (newMsg.type === "audio" ? "🎵 Áudio" : "Mensagem"))),
    timestamp: nowIso,
    fromMe: newMsg.fromMe,
    status: newMsg.status,
    type: newMsg.type
  };
  conv.updatedAt = nowIso;

  if (!fromMe) {
    conv.unreadCount = (conv.unreadCount || 0) + 1;
  }

  return conv;
}

// ── Sincronização & Migração Inicial do Repositório de Conversas ────────────────
export function syncWhatsappConversationsStore(db) {
  if (!db) return;
  if (!db.whatsappConversations) db.whatsappConversations = [];

  for (const r of (db.reservations || [])) {
    const phones = getReservationPhones(r, db);
    for (const rawP of phones) {
      const cleanP = cleanWhatsAppPhone(rawP);
      if (!cleanP) continue;

      let conv = db.whatsappConversations.find(c => c.phone === cleanP);
      const bestRes = findReservationByPhone(db, cleanP) || r;

      if (!conv) {
        conv = {
          id: cleanP,
          phone: cleanP,
          formattedPhone: formatPhoneDisplay(cleanP),
          name: bestRes.guestName || r.guestName || "Hóspede",
          avatarUrl: "",
          isGroup: false,
          unreadCount: 0,
          pinned: false,
          reservationCode: bestRes.code || r.code,
          flatNumber: bestRes.flatNumber || r.flatNumber || "",
          checkinDate: bestRes.checkinDate || r.checkinDate || "",
          checkoutDate: bestRes.checkoutDate || r.checkoutDate || "",
          status: bestRes.status || r.status || "confirmada",
          paymentStatus: bestRes.paymentStatus || r.paymentStatus || "",
          totalAmount: bestRes.totalAmount || r.totalAmount || 0,
          lastMessage: null,
          updatedAt: r.createdAt || new Date().toISOString(),
          messages: []
        };
        db.whatsappConversations.push(conv);
      } else {
        if (bestRes) {
          conv.reservationCode = bestRes.code;
          conv.flatNumber = bestRes.flatNumber || "";
          conv.checkinDate = bestRes.checkinDate || "";
          conv.checkoutDate = bestRes.checkoutDate || "";
          conv.status = bestRes.status || "confirmada";
          conv.paymentStatus = bestRes.paymentStatus || "";
          conv.totalAmount = bestRes.totalAmount || 0;
          if (!conv.name || conv.name === "Hóspede" || conv.name === conv.phone) {
            conv.name = bestRes.guestName;
          }
        }
      }
    }
  }

  for (const hist of (db.whatsappHistory || [])) {
    if (!hist.guestPhone) continue;
    const cleanP = cleanWhatsAppPhone(hist.guestPhone);
    if (!cleanP) continue;

    let conv = db.whatsappConversations.find(c => c.phone === cleanP);
    if (!conv) {
      conv = {
        id: cleanP,
        phone: cleanP,
        formattedPhone: formatPhoneDisplay(cleanP),
        name: hist.guestName || formatPhoneDisplay(cleanP),
        avatarUrl: "",
        isGroup: false,
        unreadCount: 0,
        pinned: false,
        reservationCode: hist.reservationCode || null,
        flatNumber: "",
        checkinDate: "",
        checkoutDate: "",
        status: "confirmada",
        paymentStatus: "",
        totalAmount: 0,
        lastMessage: null,
        updatedAt: hist.sentAt || new Date().toISOString(),
        messages: []
      };
      db.whatsappConversations.push(conv);
    }

    const msgId = hist.id || `msg_hist_${hist.sentAt}`;
    const alreadyExists = conv.messages.some(m => m.id === msgId || (m.timestamp === hist.sentAt && m.text === hist.message));
    if (!alreadyExists) {
      conv.messages.push({
        id: msgId,
        messageId: msgId,
        fromMe: true,
        senderName: "CorpFlats",
        senderPhone: "",
        text: hist.message || "",
        type: hist.documentUrl ? "document" : "text",
        mediaUrl: hist.documentUrl || null,
        fileName: hist.documentName || null,
        caption: null,
        buttons: hist.buttons || [],
        triggerEvent: hist.triggerEvent || null,
        timestamp: hist.sentAt || new Date().toISOString(),
        status: hist.status === "sent" ? "read" : "failed"
      });
    }
  }

  for (const conv of db.whatsappConversations) {
    if (conv.messages && conv.messages.length > 0) {
      conv.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const last = conv.messages[conv.messages.length - 1];
      conv.lastMessage = {
        text: last.text || (last.type === "document" ? `📄 ${last.fileName || "Documento"}` : (last.type === "image" ? "📷 Foto" : (last.type === "audio" ? "🎵 Áudio" : "Mensagem"))),
        timestamp: last.timestamp,
        fromMe: last.fromMe,
        status: last.status,
        type: last.type
      };
      conv.updatedAt = last.timestamp;
    }
  }

  db.whatsappConversations.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

// ── Gerenciador da Fila & Background Scheduler ────────────────────────────────
export function initWhatsAppEngine(app, dbOrGetter, saveDatabase, createNotification, analyzeSentimentFn = null) {
  const getDb = typeof dbOrGetter === "function" ? dbOrGetter : () => dbOrGetter;
  globalDbGetter = getDb;

  function ensureDbDefaults() {
    const db = getDb();
    if (!db) return;
    if (!db.whatsappAiSettings) {
      db.whatsappAiSettings = {
        developerPhone: "22998505276",
        developerGuidelines: [],
        toneSettings: {
          conciseness: "normal",
          emojiUsage: "moderate",
          formality: "casual_professional",
          customRules: [],
          updatedAt: new Date().toISOString()
        }
      };
    }
    if (!Array.isArray(db.whatsappAiSettings.developerGuidelines)) {
      db.whatsappAiSettings.developerGuidelines = [];
    }
    if (!db.whatsappAiSettings.toneSettings) {
      db.whatsappAiSettings.toneSettings = {
        conciseness: "normal",
        emojiUsage: "moderate",
        formality: "casual_professional",
        customRules: [],
        updatedAt: new Date().toISOString()
      };
    }
    if (!Array.isArray(db.faqItems)) {
      db.faqItems = [];
    }
    if (!db.zapiConfig) {
      db.zapiConfig = {
        instanceId: "",
        token: "",
        clientToken: "",
        enabled: false,
        deliveryMode: "buttons",
        fallbackToText: true,
        wifiNetwork: "apto {quarto}",
        wifiPassword: "1234567890123",
        googleReviewUrl: "https://share.google/LHu3541d5lhkdvbL2",
        guestGuidePdfUrl: "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf",
        guestGuidePdfName: "Manual_do_Hospede_CorpFlats.pdf",
        alertEmail: "millerpessanha@gmail.com",
        alertEmailEnabled: true,
        alertOnReconnect: true,
        externalWebhookUrl: "",
        externalWebhookEnabled: false,
        connectionState: "unknown",
        disconnectedAt: null,
        connectedAt: null,
        lastDisconnectReason: null,
        lastAlertSentAt: null,
        webhookDisconnectedUrl: "https://corpflats.onrender.com/api/whatsapp/webhook/disconnected",
        webhookConnectedUrl: "https://corpflats.onrender.com/api/whatsapp/webhook/connected",
        webhookReceivedUrl: "https://corpflats.onrender.com/api/whatsapp/webhook/received",
        conciergeMonitoringEnabled: true,
        conciergeGroupId: "",
        conciergeGroupName: "",
        conciergeRequireKeywords: false,
        testModeOnly: true,
        testAllowedPhones: "22998505276",
        allowMaidsInTestMode: true,
        channels: JSON.parse(JSON.stringify(DEFAULT_ZAPI_CHANNELS))
      };
    } else {
      if (!db.zapiConfig.googleReviewUrl || db.zapiConfig.googleReviewUrl.includes("maps.google.com/?q=") || db.zapiConfig.googleReviewUrl.includes("g.page/r/corpflats") || db.zapiConfig.googleReviewUrl.includes("maps.app.goo.gl")) {
        db.zapiConfig.googleReviewUrl = "https://share.google/LHu3541d5lhkdvbL2";
      }
      if (!db.zapiConfig.deliveryMode || db.zapiConfig.deliveryMode === "text_links") {
        db.zapiConfig.deliveryMode = "buttons";
      }
      if (!db.zapiConfig.guestGuidePdfName) {
        db.zapiConfig.guestGuidePdfName = "Manual_do_Hospede_CorpFlats.pdf";
      }
      if (db.zapiConfig.guestGuidePdfUrl === undefined) {
        db.zapiConfig.guestGuidePdfUrl = "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf";
      }
      if (db.zapiConfig.alertEmail === undefined) {
        db.zapiConfig.alertEmail = "millerpessanha@gmail.com";
      }
      if (db.zapiConfig.alertEmailEnabled === undefined) {
        db.zapiConfig.alertEmailEnabled = true;
      }
      if (db.zapiConfig.alertOnReconnect === undefined) {
        db.zapiConfig.alertOnReconnect = true;
      }
      if (db.zapiConfig.externalWebhookUrl === undefined) {
        db.zapiConfig.externalWebhookUrl = "";
      }
      if (db.zapiConfig.externalWebhookEnabled === undefined) {
        db.zapiConfig.externalWebhookEnabled = false;
      }
      if (!db.zapiConfig.connectionState) {
        db.zapiConfig.connectionState = "unknown";
      }
      if (!db.zapiConfig.webhookDisconnectedUrl) {
        db.zapiConfig.webhookDisconnectedUrl = "https://corpflats.onrender.com/api/whatsapp/webhook/disconnected";
      }
      if (!db.zapiConfig.webhookConnectedUrl) {
        db.zapiConfig.webhookConnectedUrl = "https://corpflats.onrender.com/api/whatsapp/webhook/connected";
      }
      if (!db.zapiConfig.webhookReceivedUrl) {
        db.zapiConfig.webhookReceivedUrl = "https://corpflats.onrender.com/api/whatsapp/webhook/received";
      }
      if (db.zapiConfig.conciergeMonitoringEnabled === undefined) {
        db.zapiConfig.conciergeMonitoringEnabled = true;
      }
      if (db.zapiConfig.conciergeGroupId === undefined) {
        db.zapiConfig.conciergeGroupId = "";
      }
      if (db.zapiConfig.conciergeGroupName === undefined) {
        db.zapiConfig.conciergeGroupName = "";
      }
      if (db.zapiConfig.conciergeRequireKeywords === undefined) {
        db.zapiConfig.conciergeRequireKeywords = false;
      }
      if (db.zapiConfig.testModeOnly === undefined) {
        db.zapiConfig.testModeOnly = true;
      }
      if (db.zapiConfig.testAllowedPhones === undefined) {
        db.zapiConfig.testAllowedPhones = "22998505276";
      }
      if (db.zapiConfig.allowMaidsInTestMode === undefined) {
        db.zapiConfig.allowMaidsInTestMode = true;
      }
    }

    ensureZapiChannels(db);
    syncChannelsBidirectional(db, "channels");

    if (!db.zapiConnectionLogs) {
      db.zapiConnectionLogs = [];
    }

    if (!db.conciergeWhatsappLogs) {
      db.conciergeWhatsappLogs = [];
    }

    getWhatsAppAiConfig(db);

    if (!db.whatsappTemplates || db.whatsappTemplates.length === 0) {
      db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES;
    } else {
      for (const defTpl of DEFAULT_WHATSAPP_TEMPLATES) {
        if (!db.whatsappTemplates.some(t => t.id === defTpl.id)) {
          db.whatsappTemplates.push(defTpl);
        }
      }
            // Garante que templates existentes possuam a propriedade channels, recipientTarget e documentName inicializadas
      for (const tpl of db.whatsappTemplates) {
        if (!tpl.recipientTarget) {
          tpl.recipientTarget = "guest";
        }
        if (!tpl.channels || !Array.isArray(tpl.channels) || tpl.channels.length === 0) {
          if (tpl.id === "tpl_breakfast_reminder") {
            tpl.channels = ["site", "whatsapp"];
          } else {
            tpl.channels = ["site", "whatsapp", "booking", "airbnb", "outros"];
          }
        }
        if (tpl.id === "tpl_pre_reserva") {
          tpl.recipientTarget = "requester";
          tpl.channels = ["site", "whatsapp", "outros"];
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix") || tpl.buttons?.some(b => b.url && b.url.includes("whatsapp.com/otp")) || tpl.message.includes("Para agilizar sua estadia") || tpl.message.includes("sem filas") || !tpl.message.includes("status_cafe")) {
            const defPre = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_reserva");
            if (defPre) {
              tpl.title = defPre.title;
              tpl.description = defPre.description;
              tpl.message = defPre.message;
              tpl.buttons = defPre.buttons;
            }
          }
        }
        if (tpl.id === "tpl_payment_pending") {
          tpl.recipientTarget = "requester";
          tpl.triggerTiming = "after_creation";
          tpl.offsetValue = 1;
          tpl.offsetUnit = "hours";
          tpl.channels = ["site", "whatsapp", "outros"];
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix") || tpl.buttons?.some(b => b.url && b.url.includes("whatsapp.com/otp"))) {
            const defPend = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_pending");
            if (defPend) {
              tpl.title = defPend.title;
              tpl.description = defPend.description;
              tpl.message = defPend.message;
              tpl.buttons = defPend.buttons;
            }
          }
        }
        if (tpl.id === "tpl_additional_daily_pending") {
          tpl.recipientTarget = "requester";
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix") || tpl.buttons?.some(b => b.url && b.url.includes("whatsapp.com/otp"))) {
            const defAdd = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_additional_daily_pending");
            if (defAdd) {
              tpl.title = defAdd.title;
              tpl.description = defAdd.description;
              tpl.message = defAdd.message;
              tpl.buttons = defAdd.buttons;
            }
          }
        }
        // Sanitização geral de botões: erradica qualquer resquício do link quebrado do whatsapp.com/otp/code/
        if (Array.isArray(tpl.buttons)) {
          for (const b of tpl.buttons) {
            if (b.url && b.url.includes("whatsapp.com/otp")) {
              b.url = "{{link_copiar_pix}}";
            }
          }
        }
        if (tpl.id === "tpl_payment_confirmed") {
          tpl.channels = ["site", "whatsapp"];
          tpl.recipientTarget = "both";
          if (!tpl.message.includes("status_cafe") || tpl.message.includes("sem filas")) {
            const defPay = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_confirmed");
            if (defPay) {
              tpl.message = defPay.message;
              tpl.buttons = defPay.buttons;
            }
          }
        }
        if (tpl.id === "tpl_checkin_day_instructions") {
          tpl.fixedTime = "07:00";
          if (!tpl.message.includes("instrucao_checkin_ou_chegada")) {
            const defChk = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkin_day_instructions");
            if (defChk) {
              tpl.title = defChk.title;
              tpl.description = defChk.description;
              tpl.message = defChk.message;
              tpl.buttons = defChk.buttons;
            }
          }
        }
        if (tpl.id === "tpl_pre_checkin_reminder") {
          if (!tpl.message.includes("mensagem_pendencia_hospedes") || tpl.message.includes("sem filas")) {
            const defRem = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_checkin_reminder");
            if (defRem) {
              tpl.message = defRem.message;
              tpl.description = defRem.description;
            }
          }
        }
        if (tpl.id === "tpl_express_checkin_summary") {
          if (tpl.message.includes("sem filas")) {
            const defExp = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_express_checkin_summary");
            if (defExp) {
              tpl.message = defExp.message;
            }
          }
        }
        if (tpl.id === "tpl_nps_satisfaction_check") {
          tpl.offsetValue = 24;
          tpl.offsetUnit = "hours";
          tpl.title = "Pós Check-out (24h) • Pesquisa de Satisfação (Filtro NPS)";
        }
        if (tpl.id === "tpl_new_reservation_direct") {
          const defDir = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_new_reservation_direct");
          if (defDir) {
            tpl.hasAttachment = defDir.hasAttachment;
            tpl.documentUrl = defDir.documentUrl;
            tpl.documentName = defDir.documentName;
            tpl.documentCaption = defDir.documentCaption;
            if (!tpl.message.includes("status_cafe") || tpl.message.includes("sem filas") || !tpl.message.includes("ESTRITAMENTE MEDIANTE DISPONIBILIDADE")) {
              tpl.message = defDir.message;
              tpl.description = defDir.description;
              tpl.buttons = defDir.buttons;
            }
          }
        }
        if (tpl.id === "tpl_checkin_completed") {
          if (!tpl.message.includes("Como está tudo por aí")) {
            const defChk = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkin_completed");
            if (defChk) {
              tpl.message = defChk.message;
            }
          }
        }
        if (tpl.id === "tpl_new_reservation_ota") {
          if (tpl.message.includes("{{valor_total}}") || !tpl.message.includes("12:00")) {
            const defOta = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_new_reservation_ota");
            if (defOta) {
              tpl.message = defOta.message;
              tpl.title = defOta.title;
              tpl.description = defOta.description;
            }
          }
        }
        if (tpl.id === "tpl_new_reservation") {
          // Desativa o template genérico legado para evitar envio duplicado com tpl_new_reservation_direct e tpl_new_reservation_ota
          tpl.enabled = false;
          tpl.channels = ["outros"];
          tpl.title = "Nova Reserva • Confirmação & Resumo (Legado / Desativado)";
        }
        if (tpl.id === "tpl_post_checkout_review") {
          tpl.triggerEvent = "nps_approved";
          tpl.triggerTiming = "immediate";
          tpl.title = "Pós Check-out • Link Google Review (apenas nota 5) ⭐";
        }
        if (tpl.id === "tpl_payment_confirmed") {
          tpl.channels = ["site", "whatsapp"];
          tpl.recipientTarget = "both";
        }
        if (tpl.id === "tpl_room_ready_regular") {
          tpl.channels = ["site", "whatsapp", "booking", "airbnb", "outros"];
          tpl.triggerEvent = "room_ready_regular";
          tpl.recipientTarget = "guest";
        }
        if (tpl.id === "tpl_sameday_reservation_instructions") {
          if (!tpl.message.includes("instrucao_checkin_ou_chegada") || tpl.message.includes("Como sua reserva foi confirmada") || !tpl.message.includes("status_pagamento")) {
            const defSame = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_sameday_reservation_instructions");
            if (defSame) {
              tpl.title = defSame.title;
              tpl.description = defSame.description;
              tpl.message = defSame.message;
              tpl.buttons = defSame.buttons;
            }
          }
        }
        if (tpl.id === "tpl_checkin_cleaning_delay") {
          tpl.channels = ["site", "whatsapp", "booking", "airbnb", "outros"];
          tpl.triggerEvent = "checkin_cleaning_delay";
          tpl.recipientTarget = "guest";
          if (!tpl.fixedTime || tpl.fixedTime === "14:00") {
            tpl.fixedTime = "13:45";
          }
          if (tpl.title && tpl.title.includes("14:00")) {
            tpl.title = tpl.title.replace("14:00", "13:45");
          }
          if (tpl.description && tpl.description.includes("14:00")) {
            tpl.description = tpl.description.replace("14:00", "13:45");
          }
        }
        if (tpl.id === "tpl_breakfast_reminder") {
          if (tpl.footer?.includes("Artesanal") || tpl.footer?.includes("artesanal")) {
            const defBf = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_breakfast_reminder");
            if (defBf) {
              tpl.footer = defBf.footer;
            }
          }
        }
        if (tpl.id === "tpl_reservation_updated") {
          const defUpdated = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_reservation_updated");
          if (defUpdated) {
            if (tpl.message.includes("permanecem inalterados")) {
              tpl.message = defUpdated.message;
            }
            if (!tpl.buttons?.some(b => b.id === "btn_checkin" || b.url === "{{link_checkin_digital}}")) {
              tpl.buttons = defUpdated.buttons;
            }
          }
        }
      }
    }

    if (!db.whatsappQuickMessages || db.whatsappQuickMessages.length === 0) {
      db.whatsappQuickMessages = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_QUICK_MESSAGES));
    } else {
      for (const defQm of DEFAULT_WHATSAPP_QUICK_MESSAGES) {
        if (!db.whatsappQuickMessages.some(q => q.id === defQm.id)) {
          db.whatsappQuickMessages.push(JSON.parse(JSON.stringify(defQm)));
        }
      }
      for (const qm of db.whatsappQuickMessages) {
        if (!qm.recipientTarget) {
          qm.recipientTarget = "guest";
        }
        if (qm.id === "qm_payment_pending" || qm.id === "qm_payment_confirmed") {
          qm.recipientTarget = "requester";
        }
        if (qm.id === "qm_breakfast") {
          const defBreakfast = DEFAULT_WHATSAPP_QUICK_MESSAGES.find(q => q.id === "qm_breakfast");
          if (defBreakfast) {
            if (qm.footer?.includes("Artesanal") || qm.footer?.includes("artesanal") || (qm.buttons && qm.buttons.length > 0) || !qm.message.includes("{{link_cafe_manha}}")) {
              qm.message = defBreakfast.message;
              qm.footer = defBreakfast.footer;
              qm.buttons = [];
            }
          }
        }
      }
    }

    if (!db.whatsappQueue) {
      db.whatsappQueue = [];
    } else {
      const now = new Date();
      const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const threeDaysAgo = new Date(nowUtc - (3 * 24 + 3) * 3600000);
      const threeDaysAgoStr = threeDaysAgo.toISOString().substring(0, 10);
      const nowIso = now.toISOString();

      let cleanedOldCount = 0;
      let sanitizedQueueCafeCount = 0;
      for (const item of db.whatsappQueue) {
        if (item) {
          const qContext = `${item.triggerEvent || ""} ${item.templateId || ""} ${item.title || ""} ${item.renderedMessage || ""}`.toLowerCase();
          const isCheckoutOrCancel = qContext.includes("checkout") || 
                                     qContext.includes("check-out") || 
                                     qContext.includes("cancel") || 
                                     qContext.includes("review") || 
                                     qContext.includes("saida") || 
                                     qContext.includes("saída") || 
                                     qContext.includes("avaliação");
          if (isCheckoutOrCancel && Array.isArray(item.renderedButtons)) {
            const beforeLen = item.renderedButtons.length;
            item.renderedButtons = item.renderedButtons.filter(b => b && b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
            if (item.renderedButtons.length < beforeLen) {
              sanitizedQueueCafeCount++;
            }
          }
        }
        if (item.status === "scheduled" || item.status === "pending") {
          if (item.triggerEvent === "checkin_cleaning_delay" || item.templateId === "tpl_checkin_cleaning_delay") {
            item.status = "cancelled";
            item.error = "Cancelado: alerta de limpeza em andamento é avaliado dinamicamente às 13:45 apenas para flats ainda sendo limpos";
            item.updatedAt = nowIso;
            cleanedOldCount++;
            continue;
          }
        }
        if (item.status === "scheduled") {
          const resv = (db.reservations || []).find(r => r.id === item.reservationId || r.code === item.reservationCode);
          const isOldResv = resv && resv.checkoutDate && resv.checkoutDate < threeDaysAgoStr;
          const isOverdue = item.scheduledFor && (now.getTime() - new Date(item.scheduledFor).getTime()) > 2 * 3600 * 1000;
          const isTestBlocked = db.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(item.guestPhone, db.zapiConfig);
          if (isOldResv || isOverdue || isTestBlocked) {
            item.status = "cancelled";
            item.error = isTestBlocked 
              ? "Cancelado na inicialização: destinatário não autorizado no Modo de Teste (Sandbox)" 
              : "Cancelado na inicialização: agendamento retroativo ou reserva antiga";
            item.updatedAt = nowIso;
            cleanedOldCount++;
          }
        }
      }
      if (cleanedOldCount > 0) {
        console.log(`[Z-API Init] Cancelados ${cleanedOldCount} agendamentos antigos ou bloqueados pelo Modo de Teste.`);
      }
      if (sanitizedQueueCafeCount > 0) {
        console.log(`[Z-API Init] Sanitizados ${sanitizedQueueCafeCount} agendamentos na fila removendo botões/links indevidos de café.`);
      }
    }

    if (!db.whatsappHistory) {
      db.whatsappHistory = [];
    }

    if (!db.whatsappConversations) {
      db.whatsappConversations = [];
    }
    syncWhatsappConversationsStore(db);
  }

  ensureDbDefaults();

  // ── Rotas Express do WhatsApp ───────────────────────────────────────────────

  // 1. Obter Configurações
  app.get("/api/whatsapp/config", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db?.zapiConfig || {});
  });

  // 1.1 Listar os 7 Canais Independentes Z-API
  app.get("/api/whatsapp/channels", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json({
      success: true,
      channels: db?.zapiConfig?.channels || DEFAULT_ZAPI_CHANNELS
    });
  });

  // 1.2 Atualizar Canal Específico
  app.put("/api/whatsapp/channels/:channelId", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const { channelId } = req.params;
    if (!VALID_ZAPI_CHANNEL_IDS.includes(channelId)) {
      return res.status(404).json({ success: false, error: `Canal '${channelId}' não encontrado.` });
    }
    const currentChannel = db.zapiConfig.channels[channelId] || { ...DEFAULT_ZAPI_CHANNELS[channelId] };
    const { enabled, testMode, redirectToWhitelistOnTest, whitelist, blacklist } = req.body || {};

    if (enabled !== undefined) currentChannel.enabled = Boolean(enabled);
    if (testMode !== undefined) currentChannel.testMode = Boolean(testMode);
    if (redirectToWhitelistOnTest !== undefined) currentChannel.redirectToWhitelistOnTest = Boolean(redirectToWhitelistOnTest);

    if (Array.isArray(whitelist)) {
      currentChannel.whitelist = whitelist
        .map(p => cleanWhatsAppPhone(p))
        .filter(Boolean);
    }
    if (Array.isArray(blacklist)) {
      currentChannel.blacklist = blacklist
        .map(p => cleanWhatsAppPhone(p))
        .filter(Boolean);
    }
    currentChannel.updatedAt = new Date().toISOString();
    db.zapiConfig.channels[channelId] = currentChannel;

    syncChannelsBidirectional(db, "channels");
    saveDatabase();

    res.json({
      success: true,
      channel: currentChannel
    });
  });

  // 2. Salvar Configurações (POST e PUT)
  const saveWhatsappConfigHandler = (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const incoming = req.body || {};

    if (incoming.channels && typeof incoming.channels === "object") {
      ensureZapiChannels(db);
      for (const [chId, chData] of Object.entries(incoming.channels)) {
        if (VALID_ZAPI_CHANNEL_IDS.includes(chId) && chData && typeof chData === "object") {
          db.zapiConfig.channels[chId] = {
            ...(db.zapiConfig.channels[chId] || DEFAULT_ZAPI_CHANNELS[chId]),
            ...chData,
            updatedAt: new Date().toISOString()
          };
          if (Array.isArray(chData.whitelist)) {
            db.zapiConfig.channels[chId].whitelist = chData.whitelist.map(p => cleanWhatsAppPhone(p)).filter(Boolean);
          }
          if (Array.isArray(chData.blacklist)) {
            db.zapiConfig.channels[chId].blacklist = chData.blacklist.map(p => cleanWhatsAppPhone(p)).filter(Boolean);
          }
        }
      }
      syncChannelsBidirectional(db, "channels");
    }

    db.zapiConfig = {
      ...(db.zapiConfig || {}),
      ...incoming,
      channels: db.zapiConfig.channels
    };

    if (incoming.enabled !== undefined || incoming.testModeOnly !== undefined) {
      syncChannelsBidirectional(db, incoming.channels ? "channels" : "root");
    }

    if (db.zapiConfig.testModeOnly !== false) {
      cancelRealGuestsFromQueue(db, saveDatabase);
    }
    saveDatabase();
    res.json({ success: true, config: db.zapiConfig });
  };

  app.post("/api/whatsapp/config", saveWhatsappConfigHandler);
  app.put("/api/whatsapp/config", saveWhatsappConfigHandler);

  // 3. Status Z-API (com suporte a force=true para refresh manual)
  app.get("/api/whatsapp/status", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const force = req.query.force === "true" || req.query.refresh === "true";
    const status = await getZapiStatus(db?.zapiConfig, { force });
    res.json(status);
  });

  // 4. QR Code Z-API
  app.get("/api/whatsapp/qr-code", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const qr = await getZapiQrCode(db?.zapiConfig);
    res.json(qr);
  });

  // 4.1 Consulta Existência de Conta no WhatsApp (Validação no Cadastro/Edição)
  app.get("/api/whatsapp/phone-exists/:phone", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const result = await checkZapiPhoneExists(req.params.phone, db?.zapiConfig);
    res.json(result);
  });

  // 5. Listar Templates
  app.get("/api/whatsapp/templates", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db?.whatsappTemplates || []);
  });

  // 6. Salvar / Atualizar Templates (com cancelamento automático de agendamentos para canais removidos)
  app.post("/api/whatsapp/templates", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const incoming = req.body;
    let modifiedTemplates = [];

    if (Array.isArray(incoming)) {
      db.whatsappTemplates = incoming;
      modifiedTemplates = incoming;
    } else if (incoming && incoming.id) {
      const idx = (db.whatsappTemplates || []).findIndex(t => t.id === incoming.id);
      if (idx >= 0) {
        db.whatsappTemplates[idx] = incoming;
      } else {
        db.whatsappTemplates.push(incoming);
      }
      modifiedTemplates = [incoming];
    }

    // Se o template teve canais configurados, cancela agendamentos futuros na fila de canais não permitidos
    for (const utpl of modifiedTemplates) {
      if (utpl && utpl.id && utpl.channels && Array.isArray(utpl.channels) && !utpl.channels.includes("all")) {
        for (const qItem of (db.whatsappQueue || [])) {
          if (qItem.templateId === utpl.id && qItem.status === "scheduled") {
            const itemChannel = qItem.channel || (db.reservations || []).find(r => r.id === qItem.reservationId || r.code === qItem.reservationCode)?.channel;
            if (itemChannel && !isTemplateAllowedForChannel(utpl, itemChannel)) {
              console.log(`[Auto-WhatsApp] Cancelando agendamento na fila para ${qItem.guestName} (Canal '${itemChannel}') pois canal foi desabilitado no template '${utpl.title || utpl.id}'`);
              qItem.status = "cancelled";
              qItem.error = `Canal '${itemChannel}' desativado nas configurações do template`;
              qItem.updatedAt = new Date().toISOString();
            }
          }
        }
      }
    }

    saveDatabase();
    res.json({ success: true, templates: db.whatsappTemplates });
  });

  // 7. Restaurar Templates Originais
  app.post("/api/whatsapp/reset-templates", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES;
    saveDatabase();
    res.json({ success: true, templates: db.whatsappTemplates });
  });

  // ── Rotas de Mensagens Rápidas (Manuais - PMS / Card da Reserva) ────────────

  // 7.1. Listar Mensagens Rápidas
  app.get("/api/whatsapp/quick-messages", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db?.whatsappQuickMessages || []);
  });

  // 7.2. Salvar / Atualizar Mensagens Rápidas (em lote ou individual)
  app.post("/api/whatsapp/quick-messages", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const incoming = req.body;
    if (Array.isArray(incoming)) {
      db.whatsappQuickMessages = incoming;
    } else if (incoming && incoming.id) {
      if (!db.whatsappQuickMessages) db.whatsappQuickMessages = [];
      const idx = db.whatsappQuickMessages.findIndex(q => q.id === incoming.id);
      if (idx >= 0) {
        db.whatsappQuickMessages[idx] = { ...db.whatsappQuickMessages[idx], ...incoming };
      } else {
        db.whatsappQuickMessages.push(incoming);
      }
    }
    saveDatabase();
    res.json({ success: true, quickMessages: db.whatsappQuickMessages });
  });

  // 7.3. Excluir Mensagem Rápida
  app.delete("/api/whatsapp/quick-messages/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const id = req.params.id;
    if (!db.whatsappQuickMessages) db.whatsappQuickMessages = [];
    db.whatsappQuickMessages = db.whatsappQuickMessages.filter(q => q.id !== id);
    saveDatabase();
    res.json({ success: true, quickMessages: db.whatsappQuickMessages });
  });

  // 7.4. Restaurar Mensagens Rápidas de Fábrica
  app.post("/api/whatsapp/reset-quick-messages", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    db.whatsappQuickMessages = JSON.parse(JSON.stringify(DEFAULT_WHATSAPP_QUICK_MESSAGES));
    saveDatabase();
    res.json({ success: true, quickMessages: db.whatsappQuickMessages });
  });

  // 7.5. Upload de Documento / PDF para Automação WhatsApp
  app.post("/api/whatsapp/upload-document", async (req, res) => {
    try {
      const { fileBase64, fileName = "documento.pdf", templateId } = req.body || {};
      if (!fileBase64) {
        return res.status(400).json({ error: "Arquivo em Base64 é obrigatório." });
      }

      const cleanFileName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = path.extname(cleanFileName).toLowerCase() || ".pdf";
      const baseName = path.basename(cleanFileName, ext);
      const uniqueFileName = `${baseName}_${Date.now()}${ext}`;
      
      const docPath = path.join(DOCUMENTS_DIR, uniqueFileName);
      
      // Extrai dados binários do base64
      const matches = fileBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const rawBase64 = matches ? matches[2] : fileBase64;
      const buffer = Buffer.from(rawBase64, "base64");
      
      fs.writeFileSync(docPath, buffer);
      
      const fileUrl = `/api/storage/files/documents/${uniqueFileName}`;
      
      // Vincula ao template se informado
      const db = getDb();
      if (templateId && db?.whatsappTemplates) {
        const tpl = db.whatsappTemplates.find(t => t.id === templateId);
        if (tpl) {
          tpl.hasAttachment = true;
          tpl.documentUrl = fileUrl;
          tpl.documentName = cleanFileName;
        }
      }
      
      // Atualiza também nas configurações gerais se for o manual do hóspede
      if (db?.zapiConfig && (templateId === "tpl_checkin_completed" || cleanFileName.toLowerCase().includes("manual") || cleanFileName.toLowerCase().includes("guia"))) {
        db.zapiConfig.guestGuidePdfUrl = fileUrl;
        db.zapiConfig.guestGuidePdfName = cleanFileName;
      }

      saveDatabase();

      console.log(`[WhatsApp] Documento salvo: ${docPath} (${buffer.length} bytes) -> URL: ${fileUrl}`);
      res.json({
        success: true,
        url: fileUrl,
        fileName: cleanFileName,
        uniqueFileName,
        size: buffer.length
      });
    } catch (err) {
      console.error("[WhatsApp] Erro no upload de documento:", err);
      res.status(500).json({ error: err.message });
    }
  });


  // 8. Fila de Envios Agendados & Histórico
  app.get("/api/whatsapp/queue", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const queue = (db?.whatsappQueue || []).slice(-150).reverse();
    const history = (db?.whatsappHistory || []).slice(-100).reverse();
    res.json({ queue, history });
  });

  // 9. Ação "Enviar Agora" (Antecipar Disparo Manual)
  app.post("/api/whatsapp/queue/:id/send-now", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const id = req.params.id;
    const item = (db?.whatsappQueue || []).find(q => q.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item da fila não encontrado." });
    }

    console.log(`[WhatsApp] Disparo manual solicitado para fila ${id} (${item.guestName})...`);

    let queueButtons = item.renderedButtons || [];
    const queueContext = `${item.triggerEvent || ""} ${item.templateId || ""} ${item.title || ""} ${item.renderedMessage || ""}`.toLowerCase();
    if (queueContext.includes("checkout") || queueContext.includes("check-out") || queueContext.includes("cancel") || queueContext.includes("review") || queueContext.includes("saida") || queueContext.includes("saída") || queueContext.includes("avaliação")) {
      queueButtons = queueButtons.filter(b => b && b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
      item.renderedButtons = queueButtons;
    }

    const delivery = await deliverQueueItem(db, saveDatabase, item, {
      method: "manual",
      historyPrefix: "hist",
      includeDocument: true,
      buttons: queueButtons
    });

    saveDatabase();
    res.json({ success: delivery.success, result: delivery.waResult || { success: delivery.success, method: item.method, error: item.error }, emailSent: Boolean(delivery.emailLog), queueItem: item });
  });

  // 10. Cancelar Agendamento na Fila
  app.delete("/api/whatsapp/queue/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const id = req.params.id;
    const item = (db?.whatsappQueue || []).find(q => q.id === id);
    if (!item) {
      return res.status(404).json({ error: "Item não encontrado." });
    }
    item.status = "cancelled";
    item.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ success: true, message: "Agendamento cancelado com sucesso." });
  });

  // 10.1. Cancelar Agendamentos de Hóspedes Reais (Purgar fila em Modo de Teste)
  app.post("/api/whatsapp/queue/cancel-real-guests", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const result = cancelRealGuestsFromQueue(db, saveDatabase);
    res.json({ 
      success: true, 
      ...result, 
      message: `${result.cancelledCount} agendamento(s) de hóspedes reais cancelados com sucesso.` 
    });
  });

  // 10.2. Cancelar Todos os Agendamentos Pendentes da Fila
  app.post("/api/whatsapp/queue/cancel-all", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    let cancelledCount = 0;
    const nowIso = new Date().toISOString();
    for (const item of (db?.whatsappQueue || [])) {
      if (item.status === "scheduled") {
        item.status = "cancelled";
        item.error = "Cancelado manualmente pelo usuário administrador";
        item.updatedAt = nowIso;
        cancelledCount++;
      }
    }
    if (cancelledCount > 0) saveDatabase();
    res.json({ 
      success: true, 
      cancelledCount, 
      message: `${cancelledCount} agendamento(s) cancelados com sucesso.` 
    });
  });

  // 11. Disparo de Teste Imediato (Avulso)
  app.post("/api/whatsapp/send-test", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const { 
      phone, 
      message, 
      title = "", 
      footer = "", 
      buttons = [], 
      reservationId = null,
      sendMode = "buttons",
      sendDocument = false,
      documentUrl = "",
      documentName = "",
      documentCaption = ""
    } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Informe o número de telefone para o teste." });
    }

    let finalMessage = message || "Mensagem de teste CorpFlats Z-API";
    let finalButtons = Array.isArray(buttons) && buttons.length > 0 ? buttons : [];

    // Se o modo selecionado for botões e nenhum botão foi enviado, provê botões de teste interativos oficiais
    if (sendMode === "buttons" && finalButtons.length === 0) {
      finalButtons = [
        { id: "btn_test_chk", type: "URL", label: "📝 Ficha Check-in", url: "{{link_checkin_digital}}" },
        { id: "btn_test_res", type: "URL", label: "🏨 Ver Reserva", url: "{{link_portal_hospede}}" },
        { id: "btn_test_call", type: "CALL", label: "📞 Ligar Administração", phone: "{{telefone_hotel}}" }
      ];
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Se vinculou uma reserva para o teste, resolve as tags reais; senão preenche com dados simulados realistas
    if (reservationId && reservationId !== "none") {
      const resv = (db?.reservations || []).find(r => r.id === Number(reservationId) || r.code === String(reservationId));
      if (resv) {
        finalMessage = resolveWhatsAppTags(finalMessage, resv, db, baseUrl);
        finalButtons = finalButtons.map(b => ({
          ...b,
          url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl) : undefined,
          phone: b.phone ? resolveWhatsAppTags(b.phone, resv, db, baseUrl) : undefined
        }));
      }
    } else {
      const sampleResv = {
        guestName: req.body?.recipientName || "Miller Mendonça",
        guestPhone: phone,
        code: req.body?.reservationCode || "RES-113-0034",
        flatNumber: req.body?.flatNumber || "113",
        checkinDate: new Date().toISOString().substring(0, 10),
        checkoutDate: new Date(Date.now() + 86400000 * 2).toISOString().substring(0, 10),
        guestsCount: 2,
        totalAmount: 480,
        paid: true,
        paymentStatus: "paid",
        source: "Site Oficial"
      };
      finalMessage = resolveWhatsAppTags(finalMessage, sampleResv, db, baseUrl);
      finalButtons = finalButtons.map(b => ({
        ...b,
        url: b.url ? resolveWhatsAppTags(b.url, sampleResv, db, baseUrl) : undefined,
        phone: b.phone ? resolveWhatsAppTags(b.phone, sampleResv, db, baseUrl) : undefined
      }));
    }

    const hasDocTest = Boolean(sendDocument || documentUrl);
    const finalDocUrl = hasDocTest ? (documentUrl || db?.zapiConfig?.guestGuidePdfUrl || "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf") : undefined;
    const finalDocName = hasDocTest ? (documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined;

    const result = await sendZapiMessage(db?.zapiConfig, {
      phone,
      message: finalMessage,
      title,
      footer,
      buttons: finalButtons,
      sendMode,
      documentUrl: finalDocUrl,
      documentName: finalDocName,
      documentCaption: hasDocTest ? documentCaption : undefined,
      channelId: "transactional_chat",
      recipientRole: "operator",
      triggerEvent: "manual_test_send"
    });

    const resolvedTrigger = req.body?.triggerEvent || "manual_button_dispatch";
    const resolvedName = req.body?.recipientName || "Envio Direto";

    // Grava log do disparo
    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `test_${Date.now()}`,
      guestName: resolvedName,
      guestPhone: phone,
      reservationCode: req.body?.reservationCode || null,
      triggerEvent: resolvedTrigger,
      message: finalMessage,
      buttons: finalButtons,
      documentUrl: finalDocUrl || null,
      documentName: finalDocName || null,
      status: result.success ? "sent" : "failed",
      method: result.method || (sendMode === "text" ? "text_links" : "buttons"),
      error: result.error || null,
      sentAt: new Date().toISOString()
    });

    appendMessageToConversation(db, {
      phone: phone,
      senderName: "CorpFlats",
      senderPhone: db?.zapiConfig?.instanceId || "",
      fromMe: true,
      text: finalMessage,
      type: hasDocTest ? "document" : "text",
      mediaUrl: finalDocUrl || null,
      fileName: finalDocName || null,
      buttons: finalButtons,
      triggerEvent: resolvedTrigger,
      status: result.success ? "read" : "failed",
      timestamp: new Date().toISOString(),
      messageId: result.messageId || `msg_test_${Date.now()}`
    });
    saveDatabase();

    res.json(result);
  });

    // 12. Disparo de Template para Reserva Específica (ex: do PMS ou CRM)
  app.post("/api/whatsapp/dispatch-reservation", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const { templateId, reservationCode, reservationId } = req.body;
    let template = (db?.whatsappQuickMessages || []).find(t => t.id === templateId);
    if (!template) {
      template = (db?.whatsappTemplates || []).find(t => t.id === templateId);
    }
    // Mapeamento de compatibilidade caso venha ID antigo ou novo
    if (!template) {
      if (templateId === "tpl_payment_confirmed" || templateId === "qm_payment_confirmed") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_payment_confirmed") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_payment_confirmed");
      } else if (templateId === "tpl_payment_pending" || templateId === "qm_payment_pending") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_payment_pending") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_payment_pending");
      } else if (templateId === "tpl_new_reservation" || templateId === "qm_summary_checkin" || templateId === "tpl_new_reservation_direct") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_summary_checkin") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_new_reservation_direct") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_new_reservation");
      } else if (templateId === "tpl_breakfast_reminder" || templateId === "qm_breakfast") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_breakfast") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_breakfast_reminder");
      } else if (templateId === "tpl_checkin_day_instructions" || templateId === "qm_access_wifi") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_access_wifi") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_checkin_day_instructions");
      } else if (templateId === "tpl_checkout_reminder" || templateId === "qm_checkout_reminder") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_checkout_reminder") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_checkout_reminder");
      } else if (templateId === "tpl_post_checkout_review" || templateId === "qm_review_request" || templateId === "qm_review") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_review_request" || t.id === "qm_review") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_post_checkout_review");
      } else if (templateId === "qm_guest_manual") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_guest_manual");
      }
    }
    // Fallback caso o cliente envie o objeto template diretamente
    if (!template && req.body.template) {
      template = req.body.template;
    }
    if (!template) {
      return res.status(404).json({ error: "Modelo de mensagem não encontrado." });
    }

    const searchTarget = String(reservationCode || reservationId || req.body.code || req.body.id || "").trim();
    const cleanSearchDigits = searchTarget.replace(/\D/g, "");

    let reservation = (db?.reservations || []).find(r => {
      if (!r) return false;
      const rCode = String(r.code || "").trim();
      const rResCode = String(r.reservationCode || "").trim();
      const rId = String(r.id || "").trim();
      const rLoc = String(r.localizador || "").trim();
      const rPhone = String(r.guestPhone || "").replace(/\D/g, "");

      if (searchTarget && rCode.toUpperCase() === searchTarget.toUpperCase()) return true;
      if (searchTarget && rResCode.toUpperCase() === searchTarget.toUpperCase()) return true;
      if (searchTarget && rId === searchTarget) return true;
      if (searchTarget && rLoc.toUpperCase() === searchTarget.toUpperCase()) return true;
      if (cleanSearchDigits && cleanSearchDigits.length >= 8 && rPhone && rPhone === cleanSearchDigits) return true;
      return false;
    });

    if (!reservation) {
      if (req.body.reservation) {
        reservation = req.body.reservation;
      } else {
        return res.status(404).json({ error: "Reserva não encontrada." });
      }
    } else if (req.body.reservation && typeof req.body.reservation === "object") {
      const dbGuests = Array.isArray(reservation.guests) ? reservation.guests : [];
      const bodyGuests = Array.isArray(req.body.reservation.guests) ? req.body.reservation.guests : [];
      reservation = {
        ...reservation,
        ...req.body.reservation,
        guests: bodyGuests.length >= dbGuests.length ? bodyGuests : dbGuests
      };
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const recipients = getReservationRecipients(reservation, db);
    const isPureBilling = isPureBillingTemplateOrEvent(template);
    let targetMode = req.body.recipientTarget || template.recipientTarget || "guest"; // "guest" | "requester" | "both" | "all_guests" | "all" | "guest_2" | "guest_3" | "custom"
    const companionModeMatch = /^(?:guest|companion)_(\d+)$/.exec(String(targetMode || ""));
    const isCompanionTarget = Boolean(companionModeMatch || (targetMode === "custom" && Number(req.body.guestIndex) > 1));
    if (recipients.requester?.isDifferentFromGuest && isPureBilling && targetMode !== "custom" && !isCompanionTarget) {
      targetMode = "requester";
    }
    const requestedPhone = req.body.customPhone ? String(req.body.customPhone).trim() : (req.body.phone ? String(req.body.phone).trim() : null);
    if (requestedPhone && recipients.guest && targetMode === "guest") {
      recipients.guest.phone = requestedPhone;
      recipients.guest.cleanDigits = requestedPhone.replace(/\D/g, "");
    }
    const fallbackPhone = requestedPhone || reservation.guestPhone || reservation.phone || "";

    const dispatches = [];

    if (isCompanionTarget) {
      const rawIdx = companionModeMatch
        ? (String(targetMode).startsWith("companion_") ? Number(companionModeMatch[1]) + 1 : Number(companionModeMatch[1]))
        : Number(req.body.guestIndex);
      const compIndex = rawIdx > 1 ? rawIdx : 2;
      const matchedComp = (recipients.companions || []).find(c => Number(c.index) === compIndex);
      const compPhone = requestedPhone || matchedComp?.phone || "";
      const compName = req.body.customName || matchedComp?.name || `Acompanhante ${compIndex}`;
      dispatches.push({
        type: `guest_${compIndex}`,
        guestIndex: compIndex,
        name: compName,
        phone: compPhone
      });
    } else if (targetMode === "all_guests" || targetMode === "all") {
      const seenPhones = new Set();
      const mainPhone = recipients.guest.phone || fallbackPhone;
      const mainDigits = String(mainPhone || "").replace(/\D/g, "");
      if (mainDigits.length >= 8) {
        seenPhones.add(mainDigits.slice(-8));
        dispatches.push({
          type: "guest",
          guestIndex: 1,
          name: recipients.guest.name,
          phone: mainPhone
        });
      }
      for (const comp of (recipients.companions || [])) {
        const compDigits = String(comp.phone || "").replace(/\D/g, "");
        const compKey = compDigits.slice(-8);
        if (compDigits.length >= 8 && !seenPhones.has(compKey)) {
          seenPhones.add(compKey);
          dispatches.push({
            type: comp.type || `guest_${comp.index}`,
            guestIndex: comp.index,
            name: comp.name,
            phone: comp.phone
          });
        }
      }
      if (targetMode === "all" && recipients.requester?.isDifferentFromGuest && recipients.requester?.phone) {
        const reqDigits = String(recipients.requester.phone || "").replace(/\D/g, "");
        const reqKey = reqDigits.slice(-8);
        if (reqDigits.length >= 8 && !seenPhones.has(reqKey)) {
          seenPhones.add(reqKey);
          dispatches.push({
            type: "requester",
            guestIndex: null,
            name: recipients.requester.name,
            phone: recipients.requester.phone
          });
        }
      }
    } else if (targetMode === "custom" && requestedPhone) {
      const reqCleanKey = requestedPhone.replace(/\D/g, "").slice(-8);
      const matchedCompByPhone = reqCleanKey
        ? (recipients.companions || []).find(c => String(c.cleanDigits || "").slice(-8) === reqCleanKey)
        : null;
      if (matchedCompByPhone) {
        dispatches.push({
          type: matchedCompByPhone.type || `guest_${matchedCompByPhone.index}`,
          guestIndex: matchedCompByPhone.index,
          name: req.body.customName || matchedCompByPhone.name,
          phone: requestedPhone
        });
      } else {
        dispatches.push({
          type: isPureBilling && recipients.requester?.isDifferentFromGuest ? "requester" : "guest",
          guestIndex: 1,
          name: req.body.customName || (isPureBilling && recipients.requester?.isDifferentFromGuest ? recipients.requester.name : recipients.guest.name),
          phone: requestedPhone
        });
      }
    } else {
      if (targetMode === "guest" || targetMode === "both") {
        dispatches.push({
          type: "guest",
          guestIndex: 1,
          name: recipients.guest.name,
          phone: (targetMode === "guest" && requestedPhone) ? requestedPhone : (recipients.guest.phone || fallbackPhone)
        });
      }

      if (targetMode === "requester" || targetMode === "both") {
        if (targetMode === "requester" || recipients.requester.isDifferentFromGuest) {
          const reqPhone = (targetMode === "requester" && req.body.customPhone) ? String(req.body.customPhone).trim() : recipients.requester.phone;
          if (reqPhone) {
            dispatches.push({
              type: "requester",
              guestIndex: null,
              name: recipients.requester.name,
              phone: reqPhone
            });
          } else if (targetMode === "requester" && (!recipients.requester.isDifferentFromGuest || !recipients.requester.hasOwnContact)) {
            dispatches.push({
              type: "guest",
              guestIndex: 1,
              name: recipients.guest.name,
              phone: requestedPhone || recipients.guest.phone || fallbackPhone
            });
          }
        }
      }
    }

    if (dispatches.length === 0) {
      if (targetMode === "requester" && recipients.requester?.isDifferentFromGuest && recipients.requester?.hasOwnContact) {
        return res.status(400).json({
          success: false,
          error: "O solicitante desta reserva não possui telefone/WhatsApp cadastrado (apenas e-mail). Mensagens financeiras não são enviadas ao hóspede quando há outro solicitante."
        });
      }
      dispatches.push({
        type: "guest",
        guestIndex: 1,
        name: req.body.customName || recipients.guest.name,
        phone: requestedPhone || recipients.guest.phone || fallbackPhone
      });
    }

    const hasAttachment = Boolean(template.hasAttachment || template.documentUrl);
    const docUrl = hasAttachment ? (template.documentUrl || db?.zapiConfig?.guestGuidePdfUrl) : undefined;
    const docName = hasAttachment ? (template.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined;

    const results = [];
    if (!db.whatsappHistory) db.whatsappHistory = [];

    for (const d of dispatches) {
      const baseMsgText = (typeof req.body.customMessage === "string" && req.body.customMessage.trim())
        ? req.body.customMessage
        : template.message;
      const targetContext = d.guestIndex && Number(d.guestIndex) > 1
        ? {
            type: d.type,
            index: Number(d.guestIndex),
            guestIndex: Number(d.guestIndex),
            name: d.name,
            firstName: String(d.name || "Hóspede").trim().split(" ")[0] || "Hóspede",
            phone: d.phone
          }
        : d.type;
      const renderedMessage = resolveWhatsAppTags(baseMsgText, reservation, db, baseUrl, targetContext, template);
      const renderedButtons = renderTemplateButtons(template.buttons, reservation, db, baseUrl, targetContext, template);

      // Disparo de template da régua de comunicação com hóspedes
      const sendRes = await sendZapiMessage(db?.zapiConfig, {
        phone: d.phone,
        message: renderedMessage,
        title: template.title,
        footer: template.footer,
        buttons: renderedButtons,
        documentUrl: docUrl,
        documentName: docName,
        channelId: "guest_schedule",
        recipientRole: "guest",
        triggerEvent: "manual_template_dispatch"
      });

      results.push({
        recipientType: d.type,
        recipientName: d.name,
        phone: d.phone,
        ...sendRes
      });

      db.whatsappHistory.push({
        id: `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reservationCode: reservation.code || reservation.reservationCode || String(reservation.id),
        reservationId: reservation.id || null,
        title: template.title || template.name || null,
        guestName: reservation.guestName,
        guestPhone: d.phone,
        recipientType: d.type,
        recipientName: d.name,
        triggerEvent: template.triggerEvent || template.id,
        message: renderedMessage,
        buttons: renderedButtons,
        status: sendRes.success ? "sent" : "failed",
        method: sendRes.method || "manual",
        error: sendRes.error || null,
        sentAt: new Date().toISOString()
      });

      appendMessageToConversation(db, {
        phone: d.phone,
        senderName: "CorpFlats",
        senderPhone: db?.zapiConfig?.instanceId || "",
        fromMe: true,
        text: renderedMessage,
        type: (docUrl || hasAttachment) ? "document" : "text",
        mediaUrl: docUrl || null,
        fileName: docName || null,
        buttons: renderedButtons,
        triggerEvent: template.triggerEvent || template.id,
        reservationCode: reservation.code || reservation.reservationCode || String(reservation.id),
        status: sendRes.success ? "read" : "failed",
        timestamp: new Date().toISOString(),
        messageId: sendRes.messageId || `msg_disp_${Date.now()}`
      });

      if (dispatches.length > 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    saveDatabase();

    const anySuccess = results.some(r => r.success);
    const allSuccess = results.every(r => r.success);
    const allSimulated = results.length > 0 && results.every(r => Boolean(r.simulated));
    const firstError = results.find(r => !r.success && r.error)?.error || null;

    res.json({
      success: anySuccess,
      allSuccess,
      simulated: allSimulated,
      method: results[0]?.method || "manual",
      dispatchesCount: results.length,
      recipients: results.map(r => ({ type: r.recipientType, name: r.recipientName, phone: r.phone, success: r.success, simulated: Boolean(r.simulated) })),
      results,
      error: !anySuccess ? (firstError || "Não foi possível disparar mensagem via Z-API.") : null
    });
  });

  // 13. Enviar Localização Fixa no Mapa (/api/whatsapp/send-location)
  app.post("/api/whatsapp/send-location", async (req, res) => {
    const db = getDb();
    const { phone, title, address, latitude, longitude } = req.body;
    const result = await sendZapiLocation(db?.zapiConfig, { phone, title, address, latitude, longitude });
    res.json(result);
  });

  // 14. Enviar Botão OTP de Cópia com 1 Toque (/api/whatsapp/send-otp)
  app.post("/api/whatsapp/send-otp", async (req, res) => {
    const db = getDb();
    const { phone, message, code, buttonText } = req.body;
    const result = await sendZapiOtpButton(db?.zapiConfig, { phone, message, code, buttonText });
    res.json(result);
  });

  // 15. Enviar Botão Nativo de Chave PIX (/api/whatsapp/send-pix)
  app.post("/api/whatsapp/send-pix", async (req, res) => {
    const db = getDb();
    const { phone, pixKey, type, merchantName } = req.body;
    const result = await sendZapiPixButton(db?.zapiConfig, { phone, pixKey, type, merchantName });
    res.json(result);
  });

  // 16. Enviar Lista Interativa de Opções / Dropdown (/api/whatsapp/send-option-list)
  app.post("/api/whatsapp/send-option-list", async (req, res) => {
    const db = getDb();
    const { phone, message, title, buttonLabel, options } = req.body;
    const result = await sendZapiOptionList(db?.zapiConfig, { phone, message, title, buttonLabel, options });
    res.json(result);
  });

  // ── Processador Automático de Sentimento e NPS de Mensagens Inbound ──────────
  async function processInboundSentimentAndNps(params) {
    return processInboundNpsAndSentiment(params);
  }

  // 17. Webhook Z-API: Mensagem Recebida (/api/whatsapp/webhook/received)
  app.post("/api/whatsapp/webhook/received", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const expectedSecret = process.env.ZAPI_WEBHOOK_SECRET || db.zapiConfig?.webhookSecret;
    if (expectedSecret) {
      const providedToken = req.headers["client-token"] || req.headers["x-webhook-secret"] || req.query?.secret || "";
      if (providedToken !== expectedSecret) {
        console.warn("[Z-API Webhook] Requisição bloqueada: Client-Token/Secret inválido.");
        return res.status(401).json({ error: "Unauthorized webhook request." });
      }
    }
    console.log("[Z-API Webhook] Mensagem recebida:", JSON.stringify(req.body));

    // Auditoria dos últimos 30 webhooks brutos recebidos da Z-API
    if (!db.zapiRawWebhookLogs) db.zapiRawWebhookLogs = [];
    db.zapiRawWebhookLogs.unshift({
      id: `raw_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      endpoint: "/api/whatsapp/webhook/received",
      body: req.body
    });
    if (db.zapiRawWebhookLogs.length > 30) {
      db.zapiRawWebhookLogs = db.zapiRawWebhookLogs.slice(0, 30);
    }

    const incomingInfo = extractIncomingMessageInfo(req.body);
    if (!incomingInfo || (!incomingInfo.text && !incomingInfo.mediaUrl && incomingInfo.type === "text")) {
      return res.status(200).json({ success: true, message: "Mensagem vazia ignorada" });
    }

    // 1. Grava no Chat WhatsApp Web
    const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
      ? incomingInfo.groupId
      : (incomingInfo.fromMe
          ? (incomingInfo.phone || req.body?.phone || req.body?.chatId || incomingInfo.senderPhone)
          : (incomingInfo.senderPhone || req.body?.phone || incomingInfo.phone));
    const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);

    let updatedConv = null;
    if (cleanTarget) {
      updatedConv = appendMessageToConversation(db, {
        phone: cleanTarget,
        senderName: incomingInfo.senderName,
        senderPhone: incomingInfo.senderPhone,
        fromMe: incomingInfo.fromMe,
        text: incomingInfo.text,
        type: incomingInfo.type,
        mediaUrl: incomingInfo.mediaUrl,
        fileName: incomingInfo.fileName,
        caption: incomingInfo.caption,
        status: "delivered",
        timestamp: incomingInfo.timestamp || new Date().toISOString(),
        messageId: incomingInfo.messageId,
        isGroup: incomingInfo.isGroup,
        groupId: incomingInfo.groupId,
        groupName: incomingInfo.groupName
      });

      // Se for mensagem recebida de cliente (!fromMe), cria notificação visual e sonora
      if (!incomingInfo.fromMe && typeof createNotification === "function") {
        const preview = incomingInfo.text || (incomingInfo.type === "audio" ? "🎵 Áudio recebido" : (incomingInfo.type === "image" ? "📷 Foto recebida" : (incomingInfo.type === "document" ? "📄 Documento recebido" : "Nova mensagem")));
        createNotification({
          category: "whatsapp",
          title: `WhatsApp: ${incomingInfo.senderName || updatedConv?.name || cleanTarget}`,
          message: preview.substring(0, 120),
          type: "whatsapp_message",
          targetUrl: `/whatsapp-chat?phone=${cleanTarget}`,
          link: `/whatsapp-chat?phone=${cleanTarget}`
        });
      }

      // Se for mensagem enviada pelo operador (fromMe: true) no WhatsApp móvel ou desktop:
      if (incomingInfo.fromMe && !incomingInfo.isGroup && cleanTarget) {
        const isBot = isBotMessage(incomingInfo.text) ||
                      /^(?:sofia|ai|ia|bot|system|sistema)$/i.test(String(incomingInfo.senderName || "").trim()) ||
                      isRecentBotSentMessage({ messageId: incomingInfo.messageId, phone: cleanTarget, text: incomingInfo.text });

        if (!isBot) {
          // 1. Pausa a IA nesta conversa para assegurar controle humano total
          const conv = updatedConv || (db.whatsappConversations || []).find(c => matchClientPhone(c.phone, cleanTarget));
          if (conv) {
            if (!isDeveloperPhone(cleanTarget, db)) {
              conv.aiPaused = true;
              conv.aiPausedAt = incomingInfo.timestamp || new Date().toISOString();
              conv.aiPausedReason = "operator_manual_reply";
            } else {
              conv.isDeveloper = true;
              conv.aiPaused = false;
              conv.aiPausedReason = null;
            }
          }

          // 2. Auto-aprendizado: vincula a resposta do operador se houver pergunta pendente nas últimas 24h
          if (incomingInfo.text) {
            const linkedFaq = linkOperatorResponseToPendingFaq(db, {
              clientPhone: cleanTarget,
              text: incomingInfo.text,
              answeredBy: "operador",
              senderName: incomingInfo.senderName || "operador"
            });

            if (linkedFaq) {
              console.log(`[Z-API Webhook fromMe] Resposta do operador vinculada ao FAQ [${linkedFaq.id}] ("${linkedFaq.question.substring(0, 40)}...") -> aguardando aprovação.`);
              if (typeof createNotification === "function") {
                createNotification({
                  category: "whatsapp",
                  title: "💡 Sugestão de FAQ Capturada",
                  message: `Resposta do operador para "${linkedFaq.question.substring(0, 60)}" aguardando aprovação no painel de FAQ.`,
                  type: "faq_suggestion",
                  targetUrl: "/whatsapp-automation?tab=faq",
                  link: "/whatsapp-automation?tab=faq"
                });
              }
            }

            // 3. Assistente Ativa de Pré-Reservas:
            // Se o operador enviou mensagem na conversa com o hóspede (ex: passou o orçamento que faltava)
            // ou respondeu no próprio número do gestor para confirmar/editar uma proposta pendente
            try {
              if (isDeveloperPhone(cleanTarget, db)) {
                await handleManagerPreReservationReply({
                  db,
                  cleanTarget,
                  messageText: incomingInfo.text,
                  conv,
                  sendZapiMessage,
                  appendMessageFn: appendMessageToConversation,
                  saveDatabase,
                  createNotification
                });
              } else if (conv) {
                await evaluateAndNotifyActivePreReservation({
                  db,
                  conv,
                  cleanTarget,
                  incomingInfo,
                  saveDatabase,
                  createNotification,
                  sendZapiMessage,
                  appendMessageFn: appendMessageToConversation
                });
              }
            } catch (preResErr) {
              console.warn("[Z-API Webhook fromMe] Erro ao processar Assistente Ativa de Pré-Reservas:", preResErr.message);
            }
          }
        }
      }

      if (typeof saveDatabase === "function") saveDatabase();
    }

    // 2. Se for grupo de portaria/concierge, processa checkout automático
    let result = null;
    if (incomingInfo.isGroup && incomingInfo.text) {
      result = await handleConciergeGroupMessage({
        db,
        saveDatabase,
        createNotification,
        incomingInfo,
        isTest: false
      });
    }

    // 3. Processamento em Tempo Real de Sentimento e NPS de Hóspedes
    let npsInboundResult = null;
    if (!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget) {
      try {
        npsInboundResult = await processInboundSentimentAndNps({
          db,
          phone: cleanTarget,
          senderName: incomingInfo.senderName || updatedConv?.name || "Hóspede",
          text: incomingInfo.text,
          messageId: incomingInfo.messageId,
          timestamp: incomingInfo.timestamp || new Date().toISOString(),
          updatedConv,
          saveDatabase,
          createNotification,
          analyzeSentimentFn
        });
      } catch (err) {
        console.warn("[Z-API Webhook AI] Erro ao processar sentimento:", err.message);
      }
    }

    // Função auxiliar: Analisa o texto da mensagem para extrair previsão de chegada e verificar se é cedo/próximo das 14h
    function parseArrivalFromWhatsAppText(text) {
      if (!text || typeof text !== "string") return null;
      const t = text.trim();
      const lower = t.toLowerCase();

      // 1. Termos de chegada imediata ou no hotel
      if (/\b(j[aá]\s+(estou|cheguei|no\s+hotel)|chegando\s+agora|chegando|estou\s+aqui|na\s+porta|j[aá]\s+no\s+hotel)\b/i.test(lower)) {
        return { raw: t, formatted: "Chegando agora", isEarly: true };
      }
      if (/\b(meio\s*dia|12h|12:00)\b/i.test(lower)) {
        return { raw: t, formatted: "12:00", isEarly: true };
      }

      // 2. Extração de horário com contexto ou isolado
      const timeRegex = /(?:previs[aã]o|cheg(?:o|ar|aremos|ada)?|por\s+volta\s+d[ea]|umas?|[aà]s?|\b)\s*([0-2]?\d)(?:[:hH](\d{2})?|\s*h(?:oras?)?)\b/i;
      const colonMatch = /\b([0-2]?\d):(\d{2})\b/.exec(t);
      const match = colonMatch || t.match(timeRegex);

      if (match) {
        const hour = parseInt(match[1], 10);
        const min = parseInt(match[2] || "0", 10);
        if (!isNaN(hour) && hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
          // Descarta se não houver contexto de chegada ou horário e mensagem for longa (evita números soltos)
          const hasArrivalContext = /(?:previs[aã]o|cheg|hor[aá]rio|[aà]s|umas?|volta|tarde|noite|manh[aã]|h\b)/i.test(lower) || /^\s*[aà]s?\s*[0-2]?\d(?:[:hH]\d{2}|\s*h)?\s*$/i.test(t);
          if (!hasArrivalContext && t.length > 15) {
            return null;
          }
          const totalMinutes = hour * 60 + min;
          // Cedo ou próximo das 14h: das 06:00 (360) até 15:00 (900)
          const isEarly = totalMinutes >= 360 && totalMinutes <= 900;
          const formatted = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
          return { raw: t, formatted, isEarly };
        }
      }

      return null;
    }

    // 4. Detecção de Previsão de Chegada para Check-in de Hoje (Priorização Automática de Limpeza apenas se for cedo / próximo das 14h)
    if (!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget) {
      try {
        const { todayStr, timeStr } = getBrasiliaDateParts();
        const todayRes = (db.reservations || []).find(r => {
          if (r.status === "cancelada" || r.status === "cancelled" || r.status === "checkout" || r.checkedInAt) return false;
          if (r.checkinDate !== todayStr) return false;
          const rP = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
          return rP && (cleanTarget.endsWith(rP.slice(-8)) || rP.endsWith(cleanTarget.slice(-8)));
        });

        if (todayRes) {
          // Extrai horário/previsão de chegada real da mensagem (evita mensagens genéricas como 'ok', 'obrigado', etc.)
          const arrivalInfo = parseArrivalFromWhatsAppText(incomingInfo.text);
          if (arrivalInfo) {
            const flatNum = String(todayRes.flatNumber || "");
            const flatId = todayRes.flatId;
            const cleanReq = (db.cleaningRequests || []).find(c =>
              (c.flatId === flatId || String(c.flatNumber) === flatNum) &&
              (c.requestDate === todayStr || c.effectiveDate === todayStr)
            );

            let wasPrioritized = false;
            // Se o horário for cedo ou muito próximo das 14:00 (<= 15:00) e o flat ainda não estiver limpo, marca prioridade
            if (arrivalInfo.isEarly && cleanReq && cleanReq.status !== "clean") {
              cleanReq.isPriority = true;
              cleanReq.priorityReason = `Hóspede informou chegada cedo (${arrivalInfo.formatted}) via WhatsApp às ${brDate.toLocaleTimeString("pt-BR")}`;
              cleanReq.updatedAt = new Date().toISOString();
              wasPrioritized = true;
            }

            todayRes.guestArrivalResponse = incomingInfo.text.trim();
            todayRes.guestArrivalResponseAt = new Date().toISOString();
            todayRes.estimatedArrivalTime = arrivalInfo.formatted;
            todayRes.updatedAt = new Date().toISOString();

            if (typeof saveDatabase === "function") saveDatabase();

            if (typeof createNotification === "function") {
              createNotification({
                category: wasPrioritized ? "cleaning_priority" : "cleaning_info",
                title: wasPrioritized
                  ? `🚨 PRIORIDADE: Flat ${flatNum} - Chegada ${arrivalInfo.formatted}`
                  : `🕒 Previsão Chegada: Flat ${flatNum} - ${arrivalInfo.formatted}`,
                message: wasPrioritized
                  ? `${todayRes.guestName} informou via WhatsApp chegada para ${arrivalInfo.formatted}. Flat ${flatNum} marcado como PRIORIDADE no quadro!`
                  : `${todayRes.guestName} informou via WhatsApp previsão de chegada para ${arrivalInfo.formatted}.`,
                type: wasPrioritized ? "cleaning_priority" : "cleaning_info",
                targetUrl: "/limpeza",
                link: "/limpeza"
              });
            }
          }
        }
      } catch (arrivalErr) {
        console.warn("[Arrival Estimate Inbound Error]:", arrivalErr.message);
      }
    }

    // 5. Agente de IA para WhatsApp (Atuação Híbrida / Resposta Autônoma / Transbordo Humano / Assistente Fiscal)
    let aiProcessResult = null;
    if (npsInboundResult?.npsHandled) {
      aiProcessResult = {
        skipped: true,
        reason: "nps_flow_handled",
        action: npsInboundResult.action,
        score: npsInboundResult.score
      };
    } else if (!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget) {
      try {
        aiProcessResult = await processAiInboundMessage({
          db,
          incomingInfo,
          cleanTarget,
          saveDatabase,
          createNotification,
          sendZapiMessage,
          appendMessageFn: appendMessageToConversation
        });
      } catch (aiErr) {
        console.warn("[WhatsApp AI Processing Error]:", aiErr.message);
      }
    }

    res.status(200).json({ success: true, result, aiProcessResult, npsInboundResult, chatUpdated: Boolean(updatedConv) });
  });

  // 18. Webhook Z-API: WhatsApp Desconectado (/api/whatsapp/webhook/disconnected)
  app.post("/api/whatsapp/webhook/disconnected", async (req, res) => {
    const db = getDb();
    console.log("[Z-API Webhook] Recebido evento de Desconexão:", JSON.stringify(req.body));
    const reason = req.body?.reason || req.body?.error || req.body?.message || "Desconexão reportada pelo Webhook da Z-API";
    await handleDisconnectionEvent({
      db,
      saveDatabase,
      createNotification,
      reason,
      source: "webhook",
      details: req.body
    });
    res.status(200).json({ success: true, message: "Evento de desconexão processado com sucesso" });
  });

  // 19. Webhook Z-API: WhatsApp Conectado (/api/whatsapp/webhook/connected)
  app.post("/api/whatsapp/webhook/connected", async (req, res) => {
    const db = getDb();
    console.log("[Z-API Webhook] Recebido evento de Conexão:", JSON.stringify(req.body));
    await handleConnectionEvent({
      db,
      saveDatabase,
      createNotification,
      source: "webhook",
      details: req.body
    });
    res.status(200).json({ success: true, message: "Evento de conexão processado com sucesso" });
  });

  // 20. Webhook Z-API: Genérico / Fallback (/api/whatsapp/webhook)
  app.post("/api/whatsapp/webhook", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const eventType = String(req.body?.event || req.body?.type || "").toLowerCase();
    console.log(`[Z-API Webhook Geral] Evento '${eventType}':`, JSON.stringify(req.body));

    if (eventType.includes("disconnect") || req.body?.connected === false || req.body?.status === "disconnected") {
      await handleDisconnectionEvent({
        db,
        saveDatabase,
        createNotification,
        reason: req.body?.reason || req.body?.error || "Queda reportada via webhook geral",
        source: "webhook",
        details: req.body
      });
    } else if (eventType.includes("connect") || req.body?.connected === true || req.body?.status === "connected") {
      await handleConnectionEvent({
        db,
        saveDatabase,
        createNotification,
        source: "webhook",
        details: req.body
      });
    } else {
      const incomingInfo = extractIncomingMessageInfo(req.body);
      if (incomingInfo && (incomingInfo.text || incomingInfo.mediaUrl || incomingInfo.type !== "text")) {
        const rawTarget = incomingInfo.isGroup && incomingInfo.groupId
          ? incomingInfo.groupId
          : (incomingInfo.senderPhone || req.body?.phone || req.body?.participantPhone);
        const cleanTarget = incomingInfo.isGroup ? rawTarget : cleanWhatsAppPhone(rawTarget);

        if (cleanTarget) {
          appendMessageToConversation(db, {
            phone: cleanTarget,
            senderName: incomingInfo.senderName,
            senderPhone: incomingInfo.senderPhone,
            fromMe: incomingInfo.fromMe,
            text: incomingInfo.text,
            type: incomingInfo.type,
            mediaUrl: incomingInfo.mediaUrl,
            fileName: incomingInfo.fileName,
            caption: incomingInfo.caption,
            status: "delivered",
            timestamp: incomingInfo.timestamp || new Date().toISOString(),
            messageId: incomingInfo.messageId,
            isGroup: incomingInfo.isGroup,
            groupId: incomingInfo.groupId,
            groupName: incomingInfo.groupName
          });
          if (!incomingInfo.fromMe && typeof createNotification === "function") {
            createNotification({
              category: "whatsapp",
              title: `WhatsApp: ${incomingInfo.senderName || cleanTarget}`,
              message: (incomingInfo.text || "Nova mensagem recebida").substring(0, 100),
              type: "whatsapp_message",
              targetUrl: `/whatsapp-chat?phone=${cleanTarget}`,
              link: `/whatsapp-chat?phone=${cleanTarget}`
            });
          }
          if (typeof saveDatabase === "function") saveDatabase();
        }

        if (incomingInfo.isGroup && incomingInfo.text) {
          await handleConciergeGroupMessage({
            db,
            saveDatabase,
            createNotification,
            incomingInfo,
            isTest: false
          });
        }
      }
    }
    res.status(200).json({ success: true, message: "Webhook processado" });
  });

  // 21. Sincronizar Webhooks com a Z-API via API (/api/whatsapp/sync-webhooks)
  app.post("/api/whatsapp/sync-webhooks", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const host = req.get("host") || "corpflats.onrender.com";
    const protocol = req.protocol || "https";
    const appBaseUrl = req.body?.baseUrl || (host.includes("localhost") ? "https://corpflats.onrender.com" : `${protocol}://${host}`);

    const result = await syncZapiWebhooks(db.zapiConfig, appBaseUrl);
    if (result.success) {
      db.zapiConfig.webhookDisconnectedUrl = result.disconnectedUrl;
      db.zapiConfig.webhookConnectedUrl = result.connectedUrl;
      db.zapiConfig.webhookReceivedUrl = result.receivedUrl;
      db.zapiConfig.webhooksSyncedAt = new Date().toISOString();
      saveDatabase();
    }
    res.json(result);
  });

  // 22. Listar Grupos do WhatsApp (/api/whatsapp/groups)
  app.get("/api/whatsapp/groups", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const result = await getZapiGroups(db?.zapiConfig);
    res.json(result);
  });

  // 23. Disparo de Simulação / Teste de Mensagem da Portaria (/api/whatsapp/test-concierge-message)
  app.post("/api/whatsapp/test-concierge-message", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const { message, groupName, senderName } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Informe o texto da mensagem para simular." });
    }
    const incomingInfo = {
      isGroup: true,
      groupId: db?.zapiConfig?.conciergeGroupId || "120363000000000000@g.us",
      groupName: groupName || db?.zapiConfig?.conciergeGroupName || "Grupo Portaria (Simulação)",
      senderPhone: "5522999990000",
      senderName: senderName || "Porteiro de Plantão",
      text: message.trim()
    };
    const result = await handleConciergeGroupMessage({
      db,
      saveDatabase,
      createNotification,
      incomingInfo,
      isTest: true
    });
    res.json(result);
  });

  // 24. Histórico de Check-outs Recebidos pela Portaria (/api/whatsapp/concierge-logs)
  app.get("/api/whatsapp/concierge-logs", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db?.conciergeWhatsappLogs || []);
  });

  // 25. Limpar Histórico de Check-outs da Portaria (/api/whatsapp/concierge-logs)
  app.delete("/api/whatsapp/concierge-logs", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    db.conciergeWhatsappLogs = [];
    saveDatabase();
    res.json({ success: true });
  });

  // 21. Consultar Histórico de Conexões (/api/whatsapp/connection-logs)
  app.get("/api/whatsapp/connection-logs", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db.zapiConnectionLogs || []);
  });

  // 22. Disparo de Teste de Alerta de Desconexão (/api/whatsapp/test-disconnection-alert)
  app.post("/api/whatsapp/test-disconnection-alert", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    console.log("[Z-API Alert Test] Iniciando simulação de alerta de desconexão...");
    await handleDisconnectionEvent({
      db,
      saveDatabase,
      createNotification,
      reason: "Simulação de teste manual solicitada pelo administrador",
      source: "manual_test",
      details: { testedBy: req.body?.user || "admin", testAt: new Date().toISOString() },
      isTest: true
    });
    res.json({ success: true, message: "Simulação de alerta disparada com sucesso!" });
  });

  // 23. Consultar Webhooks Brutos Recebidos (/api/whatsapp/raw-webhook-logs)
  app.get("/api/whatsapp/raw-webhook-logs", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json(db?.zapiRawWebhookLogs || []);
  });

  // ── Rotas do WhatsApp Web / Live Chat ───────────────────────────────────────

  // A. Listar Conversas (/api/whatsapp/chat/conversations)
  app.get("/api/whatsapp/chat/conversations", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const { search = "", tab = "all", limit = 50, offset = 0 } = req.query;
    let list = [...(db.whatsappConversations || [])];

    const today = new Date();
    const todayStr = new Date(today.getTime() - 3 * 3600000).toISOString().substring(0, 10);

    if (tab === "unread") {
      list = list.filter(c => (c.unreadCount || 0) > 0);
    } else if (tab === "active") {
      list = list.filter(c => c.checkoutDate && c.checkoutDate >= todayStr && c.status !== "cancelada");
    } else if (tab === "today") {
      list = list.filter(c => (c.checkinDate === todayStr || c.checkoutDate === todayStr) && c.status !== "cancelada");
    } else if (tab === "groups") {
      list = list.filter(c => c.isGroup);
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.formattedPhone && c.formattedPhone.toLowerCase().includes(q)) ||
        (c.flatNumber && String(c.flatNumber).toLowerCase().includes(q)) ||
        (c.reservationCode && c.reservationCode.toLowerCase().includes(q)) ||
        (c.lastMessage?.text && c.lastMessage.text.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

    const total = list.length;
    const paginated = list.slice(Number(offset), Number(offset) + Number(limit));
    const totalUnread = (db.whatsappConversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
    const isConnected = db.zapiConfig?.connectionState === "connected";

    res.json({
      conversations: paginated,
      total,
      totalUnread,
      connected: isConnected,
      instanceId: db.zapiConfig?.instanceId || null,
      phone: db.zapiConfig?.phone || null
    });
  });

  // B. Obter Conversa Específica com Mensagens (/api/whatsapp/chat/conversations/:phone)
  app.get("/api/whatsapp/chat/conversations/:phone", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const rawPhone = req.params.phone;
    const cleanPhone = cleanWhatsAppPhone(rawPhone) || rawPhone;
    const conv = (db.whatsappConversations || []).find(c => c.phone === cleanPhone || c.id === cleanPhone || c.phone === rawPhone);

    if (!conv) {
      return res.status(404).json({ error: "Conversa não encontrada." });
    }

    const reqReservationCode = req.query?.reservationCode ? String(req.query.reservationCode).trim() : null;
    const allReservations = findAllReservationsByPhone(db, conv.phone || cleanPhone);
    let bestRes = null;
    if (reqReservationCode) {
      bestRes = (allReservations || []).find(r => r.code === reqReservationCode) || 
                (db.reservations || []).find(r => r.code === reqReservationCode) || null;
    }
    if (!bestRes) {
      bestRes = findReservationByPhone(db, conv.phone || cleanPhone);
    }

    if (bestRes) {
      conv.reservationCode = bestRes.code;
      conv.flatNumber = bestRes.flatNumber || conv.flatNumber;
      conv.checkinDate = bestRes.checkinDate || conv.checkinDate;
      conv.checkoutDate = bestRes.checkoutDate || conv.checkoutDate;
      conv.status = bestRes.status || conv.status;
      conv.paymentStatus = bestRes.paymentStatus || conv.paymentStatus;
      conv.totalAmount = bestRes.totalAmount || conv.totalAmount;
    }

    let reservationDetails = bestRes;
    if (!reservationDetails && conv.reservationCode) {
      reservationDetails = (db.reservations || []).find(r => r.code === conv.reservationCode);
    }

    conv.reservation = reservationDetails || null;
    const otherReservations = allReservations.filter(r => r.code !== reservationDetails?.code);
    otherReservations.sort((a, b) => {
      const cmp = String(b.checkinDate || "").localeCompare(String(a.checkinDate || ""));
      if (cmp !== 0) return cmp;
      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      return bId - aId;
    });

    res.json({
      conversation: conv,
      reservation: reservationDetails || null,
      otherReservations: otherReservations || []
    });
  });

  // C. Enviar Mensagem pelo Chat (/api/whatsapp/chat/send e /api/whatsapp/chats/:phone/messages)
  const handleChatSend = async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const { 
      phone: bodyPhone, 
      message = "", 
      text = "",
      mediaUrl: rawMediaUrl = "", 
      fileBase64 = "",
      fileName = "", 
      mediaType = "text", 
      type: bodyType = "",
      buttons = [], 
      reservationCode = null,
      quickMessageId = null
    } = req.body || {};
    const effectiveMediaType = (mediaType && mediaType !== "text") ? mediaType : (bodyType || "text");
    let mediaUrl = rawMediaUrl;
    if (fileBase64 && typeof fileBase64 === "string" && fileBase64.startsWith("data:")) {
      try {
        const chatUploadsDir = path.join(UPLOADS_DIR, "chat");
        if (!fs.existsSync(chatUploadsDir)) fs.mkdirSync(chatUploadsDir, { recursive: true });
        const m = /^data:([^;]+);base64,(.+)$/.exec(fileBase64);
        if (m) {
          const mime = m[1];
          const b64 = m[2];
          const extFromName = fileName && fileName.includes(".") ? fileName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
          const extFromMime = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("ogg") ? "ogg" : mime.includes("mp3") || mime.includes("mpeg") ? "mp3" : mime.includes("webm") ? "webm" : mime.includes("mp4") ? "mp4" : "jpg";
          const safeExt = extFromName || extFromMime;
          const storedFile = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${safeExt}`;
          fs.writeFileSync(path.join(chatUploadsDir, storedFile), Buffer.from(b64, "base64"));
          mediaUrl = `/api/storage/files/chat/${storedFile}`;
        }
      } catch (uploadErr) {
        console.warn("[WhatsApp Live Chat] Falha ao salvar arquivo base64:", uploadErr.message);
      }
    }

    const rawPhone = String(req.params?.phone || bodyPhone || "").trim();
    const isGroup = rawPhone.includes("@g.us");
    const cleanPhone = isGroup ? rawPhone : cleanWhatsAppPhone(rawPhone);

    if (!cleanPhone) {
      return res.status(400).json({ error: "Número de telefone ou grupo inválido." });
    }

    let targetRes = null;
    if (reservationCode) {
      targetRes = (db.reservations || []).find(r => r.code === reservationCode);
    } else if (!isGroup) {
      targetRes = findReservationByPhone(db, cleanPhone);
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    let finalMessage = message || text;
    if (targetRes && finalMessage) {
      finalMessage = resolveWhatsAppTags(finalMessage, targetRes, db, baseUrl);
    }

    const sendOptions = {
      phone: cleanPhone,
      message: finalMessage,
      buttons: Array.isArray(buttons) ? buttons : [],
      channelId: "transactional_chat",
      recipientRole: "operator",
      triggerEvent: "live_chat_manual_message"
    };

    if (effectiveMediaType === "document" || (fileName && effectiveMediaType !== "image" && effectiveMediaType !== "audio") || (mediaUrl && mediaUrl.endsWith(".pdf"))) {
      sendOptions.documentUrl = mediaUrl || db.zapiConfig?.guestGuidePdfUrl || "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf";
      sendOptions.documentName = fileName || db.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf";
      sendOptions.documentCaption = finalMessage || "";
      if (fileBase64) sendOptions.fileBase64 = fileBase64;
    } else if (effectiveMediaType === "image" && (mediaUrl || fileBase64)) {
      sendOptions.documentUrl = mediaUrl;
      sendOptions.documentName = fileName || "foto.jpg";
      sendOptions.documentCaption = finalMessage || "";
      if (fileBase64) sendOptions.fileBase64 = fileBase64;
    } else if (effectiveMediaType === "audio" && (mediaUrl || fileBase64)) {
      sendOptions.documentUrl = mediaUrl;
      sendOptions.documentName = fileName || "audio.ogg";
      sendOptions.documentCaption = finalMessage || "";
      if (fileBase64) sendOptions.fileBase64 = fileBase64;
    }

    console.log(`[WhatsApp Live Chat] Enviando mensagem (${effectiveMediaType}) para ${cleanPhone}...`);
    const result = await sendZapiMessage(db.zapiConfig, sendOptions);

    const nowIso = new Date().toISOString();
    const msgType = effectiveMediaType === "document" ? "document" : (effectiveMediaType === "image" ? "image" : (effectiveMediaType === "audio" ? "audio" : "text"));

    const updatedConv = appendMessageToConversation(db, {
      phone: cleanPhone,
      senderName: "CorpFlats",
      senderPhone: db.zapiConfig?.instanceId || "",
      fromMe: true,
      text: finalMessage,
      type: msgType,
      mediaUrl: sendOptions.documentUrl || null,
      fileName: sendOptions.documentName || null,
      buttons: sendOptions.buttons,
      triggerEvent: quickMessageId ? `qm_${quickMessageId}` : "chat_direct",
      reservationCode: targetRes?.code || null,
      status: result.success ? "read" : "failed",
      timestamp: nowIso,
      messageId: result.messageId || `msg_${Date.now()}`,
      isGroup,
      groupId: isGroup ? cleanPhone : null
    });

    if (updatedConv) {
      if (!isDeveloperPhone(cleanPhone, db)) {
        updatedConv.aiPaused = true;
        updatedConv.aiPausedAt = nowIso;
        updatedConv.aiPausedReason = "operator_manual_reply";
      } else {
        updatedConv.isDeveloper = true;
        updatedConv.aiPaused = false;
        updatedConv.aiPausedReason = null;
      }
    }

    // Auto-aprendizado: vincula a resposta do operador se houver pergunta pendente nas últimas 24h
    let linkedFaq = null;
    if (!isGroup && cleanPhone && finalMessage) {
      linkedFaq = linkOperatorResponseToPendingFaq(db, {
        clientPhone: cleanPhone,
        text: finalMessage,
        answeredBy: "operador"
      });

      if (linkedFaq) {
        console.log(`[WhatsApp Live Chat] Resposta do operador vinculada ao FAQ [${linkedFaq.id}] ("${linkedFaq.question.substring(0, 40)}...") -> aguardando aprovação.`);
        if (typeof createNotification === "function") {
          createNotification({
            category: "whatsapp",
            title: "💡 Sugestão de FAQ Capturada",
            message: `Resposta do operador para "${linkedFaq.question.substring(0, 60)}" aguardando aprovação no painel de FAQ.`,
            type: "faq_suggestion",
            targetUrl: "/whatsapp-automation?tab=faq",
            link: "/whatsapp-automation?tab=faq"
          });
        }
      }

      // Assistente Ativa de Pré-Reservas: avalia a conversa após envio manual pelo Live Chat
      try {
        if (isDeveloperPhone(cleanPhone, db)) {
          await handleManagerPreReservationReply({
            db,
            cleanTarget: cleanPhone,
            messageText: finalMessage,
            conv: updatedConv,
            sendZapiMessage,
            appendMessageFn: appendMessageToConversation,
            saveDatabase,
            createNotification
          });
        } else if (updatedConv) {
          await evaluateAndNotifyActivePreReservation({
            db,
            conv: updatedConv,
            cleanTarget: cleanPhone,
            incomingInfo: {
              fromMe: true,
              text: finalMessage,
              phone: cleanPhone,
              senderName: "Operador",
              timestamp: nowIso
            },
            saveDatabase,
            createNotification,
            sendZapiMessage,
            appendMessageFn: appendMessageToConversation
          });
        }
      } catch (preResChatErr) {
        console.warn("[WhatsApp Live Chat] Erro ao processar Assistente Ativa de Pré-Reservas:", preResChatErr.message);
      }
    }

    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      guestName: updatedConv?.name || targetRes?.guestName || "Hóspede",
      guestPhone: cleanPhone,
      reservationCode: targetRes?.code || null,
      triggerEvent: quickMessageId ? `qm_${quickMessageId}` : "chat_direct",
      message: finalMessage,
      buttons: sendOptions.buttons || [],
      documentUrl: sendOptions.documentUrl || null,
      documentName: sendOptions.documentName || null,
      status: result.success ? "sent" : "failed",
      method: "chat_web",
      error: result.error || null,
      sentAt: nowIso
    });

    saveDatabase();

    res.json({
      success: result.success,
      result,
      conversation: updatedConv,
      linkedFaq: linkedFaq ? {
        id: linkedFaq.id,
        question: linkedFaq.question,
        status: linkedFaq.status,
        suggestedAnswer: linkedFaq.suggestedAnswer
      } : null
    });
  };

  app.post("/api/whatsapp/chat/send", handleChatSend);
  app.post("/api/whatsapp/chats/:phone/messages", handleChatSend);
  app.post("/api/whatsapp/chat/:phone/messages", handleChatSend);

  // D. Marcar Conversa como Lida (/api/whatsapp/chat/:phone/read)
  app.post("/api/whatsapp/chat/:phone/read", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = req.params.phone;
    const cleanPhone = cleanWhatsAppPhone(rawPhone) || rawPhone;
    const conv = (db.whatsappConversations || []).find(c => c.phone === cleanPhone || c.id === cleanPhone || c.phone === rawPhone);

    if (conv) {
      conv.unreadCount = 0;
      if (conv.messages) {
        for (const m of conv.messages) {
          if (!m.fromMe) m.status = "read";
        }
      }
      saveDatabase();
    }
    res.json({ success: true });
  });

  // E. Fixar/Desafixar Conversa (/api/whatsapp/chat/:phone/pin)
  app.post("/api/whatsapp/chat/:phone/pin", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = req.params.phone;
    const cleanPhone = cleanWhatsAppPhone(rawPhone) || rawPhone;
    const conv = (db.whatsappConversations || []).find(c => c.phone === cleanPhone || c.id === cleanPhone || c.phone === rawPhone);

    if (conv) {
      conv.pinned = !conv.pinned;
      saveDatabase();
      return res.json({ success: true, pinned: conv.pinned });
    }
    res.status(404).json({ error: "Conversa não encontrada" });
  });

  // F. Criar / Abrir Nova Conversa (/api/whatsapp/chat/new)
  app.post("/api/whatsapp/chat/new", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const { phone, name = "", reservationCode = null } = req.body;
    const cleanPhone = cleanWhatsAppPhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ error: "Número de telefone inválido." });
    }

    let conv = (db.whatsappConversations || []).find(c => c.phone === cleanPhone);
    const targetRes = reservationCode
      ? (db.reservations || []).find(r => r.code === reservationCode)
      : findReservationByPhone(db, cleanPhone);

    if (!conv) {
      conv = {
        id: cleanPhone,
        phone: cleanPhone,
        formattedPhone: formatPhoneDisplay(cleanPhone),
        name: name || targetRes?.guestName || formatPhoneDisplay(cleanPhone),
        avatarUrl: "",
        isGroup: false,
        unreadCount: 0,
        pinned: false,
        reservationCode: targetRes?.code || null,
        flatNumber: targetRes?.flatNumber || "",
        checkinDate: targetRes?.checkinDate || "",
        checkoutDate: targetRes?.checkoutDate || "",
        status: targetRes?.status || "confirmada",
        paymentStatus: targetRes?.paymentStatus || "",
        totalAmount: targetRes?.totalAmount || 0,
        lastMessage: null,
        updatedAt: new Date().toISOString(),
        messages: []
      };
      db.whatsappConversations.unshift(conv);
      saveDatabase();
    }
    res.json({ success: true, conversation: conv });
  });

  // G. Sincronizar Chats Ativos da Z-API (/api/whatsapp/chat/sync-contacts)
  app.post("/api/whatsapp/chat/sync-contacts", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const instanceId = db.zapiConfig?.instanceId?.trim();
    const token = db.zapiConfig?.token?.trim();
    const clientToken = db.zapiConfig?.clientToken?.trim();

    let importedCount = 0;
    if (instanceId && token) {
      try {
        const baseUrl = db.zapiConfig?.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
        const headers = { "Content-Type": "application/json" };
        if (clientToken) headers["Client-Token"] = clientToken;

        const resChats = await fetch(`${baseUrl}/instances/${instanceId}/token/${token}/chats`, { headers });
        if (resChats.ok) {
          const chats = await resChats.json();
          if (Array.isArray(chats)) {
            for (const chat of chats) {
              const rawP = chat.phone || chat.id || "";
              const isGrp = Boolean(chat.isGroup || String(rawP).includes("@g.us"));
              const cleanP = isGrp ? rawP : cleanWhatsAppPhone(rawP);
              if (!cleanP) continue;

              let conv = db.whatsappConversations.find(c => c.phone === cleanP);
              if (!conv) {
                const targetRes = findReservationByPhone(db, cleanP);
                conv = {
                  id: cleanP,
                  phone: cleanP,
                  formattedPhone: isGrp ? chat.name || cleanP : formatPhoneDisplay(cleanP),
                  name: chat.name || targetRes?.guestName || formatPhoneDisplay(cleanP),
                  avatarUrl: chat.profilePicUrl || chat.photo || "",
                  isGroup: isGrp,
                  unreadCount: chat.unread || 0,
                  pinned: Boolean(chat.pinned),
                  reservationCode: targetRes?.code || null,
                  flatNumber: targetRes?.flatNumber || "",
                  checkinDate: targetRes?.checkinDate || "",
                  checkoutDate: targetRes?.checkoutDate || "",
                  status: targetRes?.status || "confirmada",
                  paymentStatus: targetRes?.paymentStatus || "",
                  totalAmount: targetRes?.totalAmount || 0,
                  lastMessage: chat.lastMessage ? {
                    text: chat.lastMessage.message || chat.lastMessage.text || "Mensagem",
                    timestamp: chat.lastMessage.time || new Date().toISOString(),
                    fromMe: Boolean(chat.lastMessage.fromMe),
                    status: "delivered"
                  } : null,
                  updatedAt: chat.lastMessage?.time || new Date().toISOString(),
                  messages: []
                };
                db.whatsappConversations.push(conv);
                importedCount++;
              } else {
                if (chat.photo && !conv.avatarUrl) conv.avatarUrl = chat.photo;
                if (chat.name && (!conv.name || conv.name === conv.phone)) conv.name = chat.name;
              }
            }
            saveDatabase();
          }
        }
      } catch (err) {
        console.warn("[WhatsApp Sync] Erro ao buscar chats da Z-API:", err.message);
      }
    }

    res.json({
      success: true,
      importedCount,
      totalConversations: db.whatsappConversations.length
    });
  });

  // ─── Agente de IA para WhatsApp Endpoints ─────────────────────────────────

  // 1. Obter Configurações do Agente de IA
  app.get("/api/whatsapp/ai-config", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const aiConfig = getWhatsAppAiConfig(db);
    const geminiKey = process.env.GEMINI_API_KEY || db.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
    const aiCh = db.zapiConfig?.channels?.ai_agent;
    const resolvedModel = aiConfig.preferredModel || db.whatsappAiSettings?.preferredModel || db.settings?.geminiModel || "gemini-2.5-pro";
    res.json({
      success: true,
      aiConfig: {
        ...aiConfig,
        preferredModel: resolvedModel,
        testModeOnly: aiCh ? Boolean(aiCh.testMode) : (aiConfig.testModeOnly ?? true),
        testAllowedPhones: aiCh && Array.isArray(aiCh.whitelist) ? aiCh.whitelist.join(", ") : (aiConfig.testAllowedPhones || "22998505276")
      },
      geminiConfigured: Boolean(geminiKey),
      geminiModel: resolvedModel,
      preferredModel: resolvedModel,
      testModeOnly: aiCh ? Boolean(aiCh.testMode) : (aiConfig.testModeOnly ?? true),
      testAllowedPhones: aiCh && Array.isArray(aiCh.whitelist) ? aiCh.whitelist.join(", ") : (aiConfig.testAllowedPhones || "22998505276")
    });
  });

  // 2. Atualizar Configurações do Agente de IA
  app.post("/api/whatsapp/ai-config", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const current = getWhatsAppAiConfig(db);
    const updates = req.body || {};

    if (updates.enabled !== undefined) {
      current.enabled = Boolean(updates.enabled);
      if (db.whatsappAiSettings) db.whatsappAiSettings.enabled = Boolean(updates.enabled);
      if (db.zapiConfig?.channels?.ai_agent) {
        db.zapiConfig.channels.ai_agent.enabled = Boolean(updates.enabled);
      }
    }
    if (updates.mode) current.mode = updates.mode;
    if (updates.agentName) current.agentName = String(updates.agentName).trim();
    if (updates.agentRole) current.agentRole = String(updates.agentRole).trim();
    if (updates.responseDelaySeconds !== undefined) current.responseDelaySeconds = Number(updates.responseDelaySeconds) || 3;
    if (updates.offHoursStart) current.offHoursStart = String(updates.offHoursStart);
    if (updates.offHoursEnd) current.offHoursEnd = String(updates.offHoursEnd);
    if (Array.isArray(updates.handoverKeywords)) current.handoverKeywords = updates.handoverKeywords;
    if (updates.systemPrompt) current.systemPrompt = String(updates.systemPrompt);
    if (updates.preferredModel || updates.geminiModel) {
      const modelVal = String(updates.preferredModel || updates.geminiModel).trim();
      current.preferredModel = modelVal;
      if (!db.whatsappAiSettings) db.whatsappAiSettings = {};
      db.whatsappAiSettings.preferredModel = modelVal;
      db.whatsappAiSettings.geminiModel = modelVal;
      if (db.settings) db.settings.geminiModel = modelVal;
    }
    if (updates.knowledgeBase && typeof updates.knowledgeBase === "object") {
      current.knowledgeBase = { ...current.knowledgeBase, ...updates.knowledgeBase };
    }

    // Atualiza EXCLUSIVAMENTE o canal ai_agent, sem sobrescrever o testModeOnly da Régua (guest_schedule)
    if (updates.testModeOnly !== undefined) {
      current.testModeOnly = Boolean(updates.testModeOnly);
      if (!db.whatsappAiSettings) db.whatsappAiSettings = {};
      db.whatsappAiSettings.testModeOnly = Boolean(updates.testModeOnly);
      ensureZapiChannels(db);
      if (db.zapiConfig?.channels?.ai_agent) {
        db.zapiConfig.channels.ai_agent.testMode = Boolean(updates.testModeOnly);
      }
    }
    if (updates.testAllowedPhones !== undefined) {
      current.testAllowedPhones = String(updates.testAllowedPhones);
      if (!db.whatsappAiSettings) db.whatsappAiSettings = {};
      db.whatsappAiSettings.testAllowedPhones = String(updates.testAllowedPhones);
      ensureZapiChannels(db);
      if (db.zapiConfig?.channels?.ai_agent) {
        const parsedPhones = String(updates.testAllowedPhones)
          .split(/[,;\s\n]+/)
          .map(p => cleanWhatsAppPhone(p))
          .filter(Boolean);
        db.zapiConfig.channels.ai_agent.whitelist = parsedPhones.length > 0 ? parsedPhones : ["22998505276"];
      }
    }

    saveDatabase();
    res.json({ success: true, aiConfig: current });
  });

  // 3. Simular resposta do Agente de IA (para testes no painel)
  app.post("/api/whatsapp/ai-simulate", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const { message, phone = "22998505276", history } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Mensagem obrigatória para simulação." });
    }

    try {
      const result = await generateAiWhatsAppResponse({
        db,
        phone,
        messageText: message,
        history: Array.isArray(history) ? history : [],
        isCopilot: true
      });
      res.json({
        success: true,
        replyText: result.replyText,
        guestContext: result.guestContext,
        shouldHandover: result.shouldHandover,
        matchedKeyword: result.matchedKeyword,
        source: result.source,
        modelUsed: result.modelUsed
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Alternar Ativação/Pausa da IA para uma conversa específica (/api/whatsapp/chat/:phone/ai-toggle)
  app.post("/api/whatsapp/chat/:phone/ai-toggle", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = String(req.params.phone || "");
    const cleanPhone = cleanWhatsAppPhone(rawPhone);

    const conv = (db.whatsappConversations || []).find(c => {
      const p = cleanWhatsAppPhone(c.phone);
      return p && (p.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(p.slice(-8)));
    });

    if (!conv) {
      return res.status(404).json({ error: "Conversa não encontrada." });
    }

    if (isDeveloperPhone(cleanPhone, db) && req.body.aiPaused === undefined) {
      conv.isDeveloper = true;
      conv.aiPaused = false;
      conv.aiPausedAt = null;
      conv.aiPausedReason = null;
      saveDatabase();
      return res.json({
        success: true,
        phone: cleanPhone,
        isDeveloper: true,
        aiPaused: false,
        aiPausedReason: null,
        message: "O número do desenvolvedor possui imunidade permanente contra pausa de IA."
      });
    }

    const currentPaused = Boolean(conv.aiPaused);
    const newPaused = req.body.aiPaused !== undefined ? Boolean(req.body.aiPaused) : !currentPaused;

    conv.aiPaused = newPaused;
    conv.aiPausedAt = newPaused ? new Date().toISOString() : null;
    conv.aiPausedReason = newPaused ? (req.body.reason || "operator_toggle") : null;

    saveDatabase();
    res.json({
      success: true,
      phone: cleanPhone,
      aiPaused: conv.aiPaused,
      aiPausedReason: conv.aiPausedReason
    });
  });

  // 5. Sugerir resposta com IA (Copiloto) para o operador (/api/whatsapp/chat/:phone/ai-suggest)
  app.post("/api/whatsapp/chat/:phone/ai-suggest", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = String(req.params.phone || "");
    const cleanPhone = cleanWhatsAppPhone(rawPhone);

    const conv = (db.whatsappConversations || []).find(c => {
      const p = cleanWhatsAppPhone(c.phone);
      return p && (p.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(p.slice(-8)));
    });

    const lastIncoming = (conv?.messages || []).slice().reverse().find(m => !m.fromMe);
    const messageText = req.body.message || lastIncoming?.text || "Olá, tudo bem?";

    try {
      const result = await generateAiWhatsAppResponse({
        db,
        phone: cleanPhone,
        messageText,
        history: conv?.messages || [],
        isCopilot: true
      });

      res.json({
        success: true,
        suggestion: result.replyText,
        guestContext: result.guestContext,
        shouldHandover: result.shouldHandover,
        source: result.source,
        modelUsed: result.modelUsed
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5.0.5 Assistente Ativa Sofia em Tempo Real (/api/whatsapp/chat/:phone/sofia-assist e /execute-action)
  app.post("/api/whatsapp/chat/:phone/sofia-assist", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = String(req.params.phone || "");
    const cleanPhone = cleanWhatsAppPhone(rawPhone);
    const { draftText = "", reservationCode = null, skipLlm = false } = req.body || {};

    try {
      const assistance = await generateSofiaRealtimeAssistance({
        db,
        phone: cleanPhone,
        draftText,
        reservationCode,
        skipLlm: Boolean(skipLlm)
      });
      res.json(assistance);
    } catch (err) {
      console.error("[Sofia Realtime Assist] Erro:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/chat/:phone/execute-action", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = String(req.params.phone || "");
    const cleanPhone = cleanWhatsAppPhone(rawPhone);
    const { actionType, payload = {}, sendConfirmReply = false, confirmReplyText = "" } = req.body || {};

    const targetRes = payload.reservationCode
      ? (db.reservations || []).find(r => r.code === payload.reservationCode || String(r.id) === String(payload.reservationId))
      : findReservationByPhone(db, cleanPhone);

    const nowIso = new Date().toISOString();
    let executionResult = { success: false, message: "Ação não reconhecida." };

    try {
      if (actionType === "register_vehicle_plate") {
        const plate = String(payload.plate || "").toUpperCase().trim();
        if (!targetRes) {
          return res.status(404).json({ error: "Reserva ativa não localizada para vincular a placa." });
        }
        targetRes.vehiclePlate = plate;
        if (payload.vehicleModel && !targetRes.vehicleModel) targetRes.vehicleModel = payload.vehicleModel;
        if (Array.isArray(targetRes.guests) && targetRes.guests[0]) {
          targetRes.guests[0].vehiclePlate = plate;
        }
        targetRes.updatedAt = nowIso;
        executionResult = {
          success: true,
          actionType,
          message: `Placa ${plate} vinculada com sucesso à reserva ${targetRes.code} (Flat ${targetRes.flatNumber}).`,
          reservation: targetRes
        };
      } else if (actionType === "prioritize_cleaning_arrival") {
        const flatNumber = String(payload.flatNumber || targetRes?.flatNumber || "");
        const room = (db.rooms || []).find(rm => String(rm.number || rm.flatNumber) === flatNumber);
        if (room) {
          room.priority = "high";
          room.guestWaiting = true;
          room.guestWaitingSince = nowIso;
          room.notes = [room.notes, `⚡ Prioridade solicitada via Chat WhatsApp (${payload.guestName || targetRes?.guestName || "Hóspede"})`].filter(Boolean).join(" • ");
        }
        if (targetRes) {
          targetRes.arrivalNotifiedAt = nowIso;
        }
        executionResult = {
          success: true,
          actionType,
          message: `Flat ${flatNumber} marcado como PRIORIDADE MÁXIMA (Hóspede Aguardando) no painel de Governança!`,
          room
        };
      } else if (actionType === "create_maintenance_ticket") {
        const flatNumber = String(payload.flatNumber || targetRes?.flatNumber || "S/N");
        if (!Array.isArray(db.serviceOrders)) db.serviceOrders = [];
        const newOrder = {
          id: `os_chat_${Date.now()}`,
          code: `OS-${Math.floor(1000 + Math.random() * 9000)}`,
          flatNumber,
          roomNumber: flatNumber,
          category: "manutencao",
          priority: "urgente",
          status: "aberta",
          title: `Manutenção Flat ${flatNumber} (via WhatsApp)`,
          description: payload.description || "Relato recebido via chat WhatsApp.",
          reportedBy: payload.guestName || targetRes?.guestName || "Hóspede (WhatsApp)",
          guestPhone: cleanPhone,
          reservationCode: targetRes?.code || null,
          createdAt: nowIso,
          updatedAt: nowIso
        };
        db.serviceOrders.unshift(newOrder);
        executionResult = {
          success: true,
          actionType,
          message: `Ordem de Serviço ${newOrder.code} aberta para o Flat ${flatNumber}!`,
          serviceOrder: newOrder
        };
      } else if (actionType === "create_housekeeping_request") {
        const flatNumber = String(payload.flatNumber || targetRes?.flatNumber || "S/N");
        if (!Array.isArray(db.housekeepingRequests)) db.housekeepingRequests = [];
        const reqItem = {
          id: `hk_chat_${Date.now()}`,
          flatNumber,
          guestName: payload.guestName || targetRes?.guestName || "Hóspede",
          guestPhone: cleanPhone,
          reservationCode: targetRes?.code || null,
          description: payload.description || "Solicitação de enxoval/governança via WhatsApp",
          status: "pending",
          priority: "high",
          createdAt: nowIso
        };
        db.housekeepingRequests.unshift(reqItem);
        const room = (db.rooms || []).find(rm => String(rm.number || rm.flatNumber) === flatNumber);
        if (room) {
          room.hasPendingRequest = true;
          room.lastRequestText = reqItem.description;
        }
        executionResult = {
          success: true,
          actionType,
          message: `Pedido de governança registrado para o Flat ${flatNumber}!`,
          request: reqItem
        };
      } else if (actionType === "confirm_guest_checkout") {
        const outResult = await handleInformCheckout(db, {
          reservationCode: targetRes?.code,
          flatNumber: payload.flatNumber || targetRes?.flatNumber,
          phone: cleanPhone,
          guestName: targetRes?.guestName || payload.guestName,
          notes: "Check-out confirmado em 1 clique via Sofia Assist no Chat"
        });
        const checkedOutRes = outResult?.reservation || targetRes || null;
        cancelPendingStayRemindersForCheckout(db, saveDatabase, {
          reservation: checkedOutRes,
          flatNumber: outResult?.flatNumber || payload.flatNumber || targetRes?.flatNumber,
          reason: "Cancelado: check-out confirmado via WhatsApp / Sofia Assist"
        });
        if (checkedOutRes) {
          await triggerCheckoutWhatsApp(db, saveDatabase, checkedOutRes, "whatsapp_sofia_assist").catch(e => {
            console.warn("[Sofia Assist Checkout Trigger Error]:", e.message);
          });
        }
        executionResult = {
          success: Boolean(outResult?.success),
          actionType,
          message: outResult?.message || `Check-out do Flat ${payload.flatNumber || targetRes?.flatNumber} registrado e liberado para governança!`,
          details: outResult
        };
      } else if (actionType === "send_pix_charge") {
        executionResult = {
          success: true,
          actionType,
          message: `Link de pagamento / PIX preparado para envio.`
        };
      } else {
        executionResult = {
          success: true,
          actionType,
          message: `Ação ${actionType} processada com sucesso.`
        };
      }

      saveDatabase();

      let sentReplyResult = null;
      const replyToSend = String(confirmReplyText || payload.confirmReply || "").trim();
      if (sendConfirmReply && replyToSend && cleanPhone) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const resolvedReply = targetRes ? resolveWhatsAppTags(replyToSend, targetRes, db, baseUrl) : replyToSend;
        sentReplyResult = await sendZapiMessage(db.zapiConfig, {
          phone: cleanPhone,
          message: resolvedReply,
          channelId: "transactional_chat",
          recipientRole: "operator",
          triggerEvent: `sofia_action_${actionType}`
        });
        appendMessageToConversation(db, {
          phone: cleanPhone,
          senderName: "CorpFlats",
          senderPhone: db.zapiConfig?.instanceId || "",
          fromMe: true,
          text: resolvedReply,
          type: "text",
          triggerEvent: `sofia_action_${actionType}`,
          reservationCode: targetRes?.code || null,
          status: sentReplyResult.success ? "read" : "failed",
          timestamp: nowIso,
          messageId: sentReplyResult.messageId || `msg_act_${Date.now()}`
        });
        saveDatabase();
      }

      res.json({
        ...executionResult,
        sentReply: sentReplyResult
      });
    } catch (err) {
      console.error("[Sofia Execute Action] Erro:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.1. Retificar Mensagem e Ensinar a Sofia (/api/whatsapp/chat/:phone/correct-message)
  app.post("/api/whatsapp/chat/:phone/correct-message", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const rawPhone = String(req.params.phone || "");
    const cleanPhone = cleanWhatsAppPhone(rawPhone);

    const {
      correctionText,
      correction,
      rectificationMessage,
      sendToGuest = true,
      learnGuideline = true,
      category,
      flatNumber,
      targetFlat,
      source = "web_chat_rectification"
    } = req.body || {};

    const finalCorrection = (correctionText || correction || "").trim();
    if (!finalCorrection) {
      return res.status(400).json({ error: "O texto da correção/diretriz é obrigatório." });
    }

    let savedGuideline = null;
    if (learnGuideline !== false) {
      savedGuideline = saveDeveloperGuideline(db, {
        text: finalCorrection,
        category: category || inferFaqCategory(finalCorrection) || "geral",
        targetFlat: flatNumber || targetFlat || null,
        active: true,
        source
      });
    }

    let sentMessage = null;
    let sendResult = null;

    if (sendToGuest !== false && cleanPhone) {
      const messageToSend = rectificationMessage ||
        `Olá! Gostaria de retificar uma informação sobre sua estadia: ${finalCorrection}. Qualquer dúvida, estamos à disposição! ✨`;

      try {
        sendResult = await sendZapiMessage(db.zapiConfig, {
          phone: cleanPhone,
          message: messageToSend,
          channelId: "ai_agent",
          recipientRole: "guest",
          triggerEvent: "ai_rectification_message"
        });
      } catch (sendErr) {
        console.warn("[Z-API Rectification] Falha ao enviar mensagem de retificação:", sendErr.message);
        sendResult = { success: false, error: sendErr.message };
      }

      appendMessageToConversation(db, {
        phone: cleanPhone,
        senderName: db.zapiConfig?.aiAgent?.agentName || "Sofia (Retificação)",
        fromMe: true,
        text: messageToSend,
        status: sendResult?.success ? "sent" : "failed",
        messageId: sendResult?.messageId || `rect_${Date.now()}`
      });

      sentMessage = messageToSend;
    }

    saveDatabase();

    res.json({
      success: true,
      phone: cleanPhone,
      guideline: savedGuideline,
      sentMessage,
      sendResult
    });
  });

  // 5.2. Listar Diretrizes do Desenvolvedor (/api/whatsapp/developer-guidelines e /api/whatsapp/ai-guidelines)
  app.get(["/api/whatsapp/developer-guidelines", "/api/whatsapp/ai/developer-guidelines", "/api/whatsapp/ai-guidelines"], (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    let list = Array.isArray(db.whatsappAiSettings?.developerGuidelines) ? [...db.whatsappAiSettings.developerGuidelines] : [];
    const { active, category, search } = req.query || {};
    if (active !== undefined) {
      const isActive = active === "true" || active === true;
      list = list.filter(g => Boolean(g.active) === isActive);
    }
    if (category) {
      list = list.filter(g => g.category === category);
    }
    if (search) {
      const s = String(search).toLowerCase();
      list = list.filter(g => (g.text || "").toLowerCase().includes(s));
    }
    res.json({ success: true, guidelines: list });
  });

  // 5.3. Criar Diretriz do Desenvolvedor Manualmente (/api/whatsapp/developer-guidelines e /api/whatsapp/ai-guidelines)
  app.post(["/api/whatsapp/developer-guidelines", "/api/whatsapp/ai/developer-guidelines", "/api/whatsapp/ai-guidelines"], (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const text = (req.body.text || req.body.correctionText || "").trim();
    if (!text) {
      return res.status(400).json({ error: "O texto da diretriz é obrigatório." });
    }
    const newGuideline = saveDeveloperGuideline(db, {
      text,
      category: req.body.category || inferFaqCategory(text) || "factual",
      targetFlat: req.body.targetFlat || req.body.flatNumber || null,
      active: req.body.active !== undefined ? Boolean(req.body.active) : true,
      source: req.body.source || "manual_admin"
    });
    saveDatabase();
    res.status(201).json({ success: true, guideline: newGuideline });
  });

  // 5.4. Atualizar Diretriz do Desenvolvedor (/api/whatsapp/developer-guidelines/:id e /api/whatsapp/ai-guidelines/:id)
  const handleUpdateGuideline = (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const id = req.params.id;
    const list = db.whatsappAiSettings?.developerGuidelines || [];
    const item = list.find(g => g.id === id);
    if (!item) {
      return res.status(404).json({ error: "Diretriz não encontrada." });
    }
    if (req.body.text !== undefined) item.text = String(req.body.text).trim();
    if (req.body.category !== undefined) item.category = req.body.category;
    if (req.body.targetFlat !== undefined) item.targetFlat = req.body.targetFlat;
    if (req.body.active !== undefined) item.active = Boolean(req.body.active);
    item.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ success: true, guideline: item });
  };
  if (typeof app.patch === "function") {
    app.patch(["/api/whatsapp/developer-guidelines/:id", "/api/whatsapp/ai/developer-guidelines/:id", "/api/whatsapp/ai-guidelines/:id"], handleUpdateGuideline);
  }
  app.put(["/api/whatsapp/developer-guidelines/:id", "/api/whatsapp/ai/developer-guidelines/:id", "/api/whatsapp/ai-guidelines/:id"], handleUpdateGuideline);

  // 5.5. Excluir Diretriz do Desenvolvedor (/api/whatsapp/developer-guidelines/:id e /api/whatsapp/ai-guidelines/:id)
  app.delete(["/api/whatsapp/developer-guidelines/:id", "/api/whatsapp/ai/developer-guidelines/:id", "/api/whatsapp/ai-guidelines/:id"], (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const id = req.params.id;
    const beforeLen = (db.whatsappAiSettings?.developerGuidelines || []).length;
    db.whatsappAiSettings.developerGuidelines = (db.whatsappAiSettings?.developerGuidelines || []).filter(g => g.id !== id);
    if (db.whatsappAiSettings.developerGuidelines.length === beforeLen) {
      return res.status(404).json({ error: "Diretriz não encontrada." });
    }
    saveDatabase();
    res.json({ success: true, deletedId: id });
  });

  // 5.6. Consultar e Atualizar Calibração de Tom (/api/whatsapp/tone-settings)
  app.get(["/api/whatsapp/tone-settings", "/api/whatsapp/ai/tone-settings"], (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    res.json({
      success: true,
      toneSettings: db.whatsappAiSettings?.toneSettings || {
        conciseness: "normal",
        emojiUsage: "moderate",
        formality: "casual_professional"
      }
    });
  });

  app.post(["/api/whatsapp/tone-settings", "/api/whatsapp/ai/tone-settings"], (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const updated = applyToneCalibration(db, req.body || {});
    saveDatabase();
    res.json({ success: true, toneSettings: updated });
  });

  // ─── Base de Conhecimento & FAQ Dinâmico Endpoints ─────────────────────────

  // 6. Listar FAQs (com filtros opcionais por categoria, status, escopo e busca)
  app.get("/api/whatsapp/faq", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    let items = Array.isArray(db.faqItems) ? [...db.faqItems] : [];
    const { category, status, scope, search } = req.query || {};

    if (category) {
      items = items.filter(i => i.category === category);
    }
    if (status) {
      items = items.filter(i => i.status === status);
    }
    if (scope) {
      items = items.filter(i => i.scope === scope);
    }
    if (search) {
      const q = String(search).toLowerCase().trim();
      items = items.filter(i =>
        (i.question && i.question.toLowerCase().includes(q)) ||
        (i.answer && i.answer.toLowerCase().includes(q)) ||
        (Array.isArray(i.keywords) && i.keywords.some(k => String(k).toLowerCase().includes(q))) ||
        (Array.isArray(i.variations) && i.variations.some(v => String(v).toLowerCase().includes(q)))
      );
    }

    res.json({ success: true, count: items.length, items });
  });

  // 7. Criar FAQ
  app.post("/api/whatsapp/faq", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const body = req.body || {};
    const question = String(body.question || "").trim();
    if (!question) {
      return res.status(400).json({ error: "Pergunta é obrigatória." });
    }

    const answer = String(body.answer || "").trim();
    const category = body.category || "estrutura_flat";
    const status = body.status || (answer ? "ativo" : "pendente");
    const scope = body.scope || "all";

    const parseList = (val) => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (typeof val === "string") return val.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
      return [];
    };

    const keywords = parseList(body.keywords);
    const variations = parseList(body.variations);
    const rawPhones = parseList(body.clientPhones);
    const clientPhones = rawPhones.map(p => cleanWhatsAppPhone(p) || p.replace(/\D/g, "")).filter(Boolean);

    const now = new Date().toISOString();
    const newItem = {
      id: body.id || `faq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      question,
      answer,
      category,
      keywords,
      variations,
      status,
      scope,
      clientPhones,
      suggestedAnswer: body.suggestedAnswer ? String(body.suggestedAnswer).trim() : undefined,
      sourceClientPhone: body.sourceClientPhone ? String(body.sourceClientPhone).trim() : undefined,
      sourceClientName: body.sourceClientName ? String(body.sourceClientName).trim() : undefined,
      createdAt: now,
      updatedAt: now
    };

    db.faqItems.push(newItem);
    if (typeof saveDatabase === "function") saveDatabase();
    res.status(201).json({ success: true, item: newItem });
  });

  // 8. Atualizar FAQ
  app.put("/api/whatsapp/faq/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const item = (db.faqItems || []).find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const body = req.body || {};
    if (body.question !== undefined) item.question = String(body.question).trim();
    if (body.answer !== undefined) item.answer = String(body.answer).trim();
    if (body.category !== undefined) item.category = body.category;
    if (body.status !== undefined) item.status = body.status;
    if (body.scope !== undefined) item.scope = body.scope;

    const parseList = (val) => {
      if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
      if (typeof val === "string") return val.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
      return [];
    };

    if (body.keywords !== undefined) item.keywords = parseList(body.keywords);
    if (body.variations !== undefined) item.variations = parseList(body.variations);
    if (body.clientPhones !== undefined) {
      const rawPhones = parseList(body.clientPhones);
      item.clientPhones = rawPhones.map(p => cleanWhatsAppPhone(p) || p.replace(/\D/g, "")).filter(Boolean);
    }
    if (body.suggestedAnswer !== undefined) item.suggestedAnswer = String(body.suggestedAnswer).trim();

    item.updatedAt = new Date().toISOString();
    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, item });
  });

  // 9. Excluir FAQ
  app.delete("/api/whatsapp/faq/:id", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const idx = (db.faqItems || []).findIndex(i => i.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const deleted = db.faqItems.splice(idx, 1)[0];
    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, id: deleted.id });
  });

  // 10. Aprovar Sugestão em 1 Clique
  app.post("/api/whatsapp/faq/:id/approve", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const item = (db.faqItems || []).find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    const body = req.body || {};
    const finalAnswer = body.answer !== undefined && String(body.answer).trim() !== ""
      ? String(body.answer).trim()
      : (item.suggestedAnswer || item.answer);

    if (!finalAnswer) {
      return res.status(400).json({ error: "Não é possível aprovar sem uma resposta definida ou sugerida." });
    }

    item.answer = finalAnswer;
    if (body.category) item.category = body.category;
    if (body.question) item.question = String(body.question).trim();

    item.status = "ativo";
    item.approvedAt = new Date().toISOString();
    item.updatedAt = new Date().toISOString();

    const gText = item.distilledGuideline || finalAnswer;
    const newG = saveDeveloperGuideline(db, {
      id: item.guidelineId || undefined,
      text: gText,
      category: item.category || "geral",
      sample: finalAnswer,
      sampleResponse: finalAnswer,
      source: "faq_approval",
      question: item.question,
      synthesized: true,
      active: true
    });
    if (newG && !item.guidelineId) item.guidelineId = newG.id;

    if (typeof saveDatabase === "function") saveDatabase();
    res.json({ success: true, item });
  });

  // 11. Refinar / Gerar Sugestões de Respostas com IA (Ad-hoc ou Pré-salvamento)
  app.post("/api/whatsapp/faq/refine-suggestion", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    try {
      const { question, currentAnswer, instruction, category } = req.body || {};
      const result = await generateFaqResponseSuggestions({
        question: question || "",
        currentAnswer: currentAnswer || "",
        instruction: instruction || "",
        category: category || "estrutura_flat",
        db,
        aiConfig: db?.whatsappAiConfig
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[FAQ Refine Suggestion Error]", err);
      res.status(500).json({ error: "Falha ao gerar sugestões com IA.", details: err.message });
    }
  });

  // 12. Refinar / Gerar Sugestões de Respostas para Item Existente do FAQ
  app.post("/api/whatsapp/faq/:id/refine-suggestion", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const item = (db.faqItems || []).find(i => i.id === req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item do FAQ não encontrado." });
    }

    try {
      const body = req.body || {};
      const instruction = body.instruction || body.directive || body.prompt || "";
      const question = (body.question && String(body.question).trim()) || item.question || "";
      const currentAnswer = (body.currentAnswer !== undefined ? String(body.currentAnswer).trim() : "") || item.suggestedAnswer || item.answer || "";
      const category = body.category || item.category || "estrutura_flat";

      const result = await generateFaqResponseSuggestions({
        question,
        currentAnswer,
        instruction,
        category,
        db,
        aiConfig: db?.whatsappAiConfig
      });

      // Se solicitado aplicar automaticamente a sugestão como suggestedAnswer:
      if (body.applySuggestion !== undefined && result.suggestions && result.suggestions.length > 0) {
        const selectedIndex = typeof body.applySuggestion === "number" ? body.applySuggestion : 0;
        const selected = result.suggestions[selectedIndex] || result.suggestions[0];
        item.suggestedAnswer = selected.text;
        item.status = "aguardando_aprovacao";
        item.updatedAt = new Date().toISOString();
        if (typeof saveDatabase === "function") saveDatabase();
      }

      res.json({ success: true, item, ...result });
    } catch (err) {
      console.error("[FAQ Item Refine Suggestion Error]", err);
      res.status(500).json({ error: "Falha ao refinar sugestões para o item do FAQ.", details: err.message });
    }
  });

  // Auto-sincronização de webhooks e notifySentByMe na inicialização + higienização NPS / disparo de hoje < 5
  const syncTimeout = setTimeout(async () => {
    try {
      const db = getDb();
      if (db) {
        await sanitizeAndDispatchTodaySub5Nps(db, saveDatabase);
      }
      if (db?.zapiConfig?.instanceId && db?.zapiConfig?.token && db?.zapiConfig?.enabled !== false) {
        console.log("[Z-API Init] Sincronizando webhooks e notifySentByMe com a Z-API...");
        const syncRes = await syncZapiWebhooks(db.zapiConfig, process.env.APP_BASE_URL || "https://corpflats.onrender.com");
        if (syncRes?.success) {
          db.zapiConfig.webhooksSyncedAt = new Date().toISOString();
          if (typeof saveDatabase === "function") saveDatabase();
          console.log("[Z-API Init] Webhooks e notifySentByMe sincronizados com sucesso!");
        }
      }
    } catch (e) {
      console.warn("[Z-API Init] Aviso na sincronização automática de webhooks:", e.message);
    }
  }, 4000);
  if (syncTimeout && typeof syncTimeout.unref === "function") syncTimeout.unref();

  // ── Background Runner Contínuo (Verifica e Dispara a Cada 60 Segundos) ──────
  let cronCounter = 0;
  const runnerInterval = setInterval(async () => {
    try {
      const db = getDb();
      if (!db || !db.zapiConfig?.enabled) return;

      const now = new Date();
      const nowIso = now.toISOString();
      cronCounter++;

      // A cada 6 minutos (6 ciclos de 60s): re-garante sincronização dos webhooks e notifySentByMe
      if (cronCounter % 6 === 0 && db.zapiConfig.instanceId && db.zapiConfig.token && db.zapiConfig.enabled !== false) {
        syncZapiWebhooks(db.zapiConfig, process.env.APP_BASE_URL || "https://corpflats.onrender.com")
          .then(res => {
            if (res?.success) {
              db.zapiConfig.webhooksSyncedAt = new Date().toISOString();
              saveDatabase();
            }
          })
          .catch(() => {});
      }

      // A cada 3 minutos (3 ciclos de 60s): Watchdog Heartbeat Proativo da Conexão Z-API
      if (cronCounter % 3 === 0 && db.zapiConfig.instanceId && db.zapiConfig.token) {
        try {
          const status = await getZapiStatus(db.zapiConfig);
          const prevState = db.zapiConfig.connectionState;
          // Só dispara alerta de desconexão se houve transição real: estava "connected" e agora não está.
          // Estado "unknown" (boot inicial) NUNCA deve gerar alerta para evitar loop de notificações.
          if (!status.connected && prevState === "connected") {
            console.log("[Z-API Watchdog] Queda de conexão detectada pelo heartbeat proativo!");
            await handleDisconnectionEvent({
              db,
              saveDatabase,
              createNotification,
              reason: status.error || "Desconexão detectada pelo watchdog de integridade da Z-API",
              source: "watchdog_heartbeat",
              details: status
            });
          } else if (!status.connected && prevState === "unknown") {
            // Apenas atualiza o estado silenciosamente, sem disparar alertas
            db.zapiConfig.connectionState = "disconnected";
            if (typeof saveDatabase === "function") saveDatabase();
            console.log("[Z-API Watchdog] Estado inicial 'unknown' → marcado como 'disconnected' silenciosamente (sem alerta).");
          } else if (status.connected && prevState === "disconnected") {
            console.log("[Z-API Watchdog] Reconexão detectada pelo heartbeat proativo!");
            await handleConnectionEvent({
              db,
              saveDatabase,
              createNotification,
              source: "watchdog_heartbeat",
              details: status
            });
          }
        } catch (watchdogErr) {
          console.warn("[Z-API Watchdog Error]:", watchdogErr.message);
        }
      }

      const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const brDate = new Date(nowUtc - (3 * 3600000));
      const todayStr = brDate.toISOString().substring(0, 10);

      // 1. Processa itens da fila que atingiram o horário de disparo
      const pendingItems = (db.whatsappQueue || []).filter(item => 
        item.status === "scheduled" && item.scheduledFor <= nowIso
      );

      for (const item of pendingItems) {
        // Validação de segurança: NUNCA disparar se a reserva terminou há mais de 3 dias ou se o agendamento está atrasado há mais de 2 horas
        const resv = (db.reservations || []).find(r => r.id === item.reservationId || r.code === item.reservationCode);
        const threeDaysAgo = new Date(nowUtc - (3 * 24 + 3) * 3600000);
        const threeDaysAgoStr = threeDaysAgo.toISOString().substring(0, 10);
        const isOldCompleted = resv && resv.checkoutDate && resv.checkoutDate < threeDaysAgoStr;
        const isOverdue = (now.getTime() - new Date(item.scheduledFor).getTime()) > 2 * 3600 * 1000;

        if (isOldCompleted || isOverdue) {
          console.log(`[Auto-WhatsApp] Descartando disparo retroativo/antigo para ${item.guestName} (${item.triggerEvent})`);
          item.status = "cancelled";
          item.error = "Cancelado: reserva antiga ou agendamento retroativo";
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        // Se a reserva estiver cancelada no sistema, descarta qualquer disparo pendente na fila
        if (resv && (resv.status === "cancelada" || resv.status === "cancelled" || resv.status === "cancelado")) {
          console.log(`[Auto-WhatsApp] Descartando disparo para ${item.guestName} (${item.triggerEvent}): reserva cancelada no sistema.`);
          item.status = "cancelled";
          item.error = "Cancelado: reserva cancelada no sistema";
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        // Checagem dinâmica: se o flat ou reserva já teve check-out informado por qualquer canal
        // (portaria WhatsApp, painel recepção, link digital, WhatsApp do hóspede ou card de limpeza desocupado/limpando),
        // cancela imediatamente qualquer lembrete de check-out, café da manhã ou estadia pendente!
        if (!POST_CHECKOUT_ALLOWED_EVENTS.has(item.triggerEvent)) {
          if (isReservationOrFlatCheckedOut(db, resv, item.flatId, item.flatNumber)) {
            console.log(`[Auto-WhatsApp] Descartando disparo de '${item.triggerEvent}' para ${item.recipientName || item.guestName}: check-out já realizado no flat.`);
            item.status = "cancelled";
            item.error = "Cancelado: check-out já realizado no flat";
            item.updatedAt = nowIso;
            cancelPendingStayRemindersForCheckout(db, null, {
              reservation: resv,
              reservationId: item.reservationId,
              reservationCode: item.reservationCode,
              flatId: item.flatId || resv?.flatId,
              flatNumber: item.flatNumber || resv?.flatNumber,
              reason: "Cancelado: check-out já realizado no flat"
            });
            saveDatabase();
            continue;
          }
        }

        // Checagem dinâmica: se for lembrete de pagamento pendente (+1h) e a reserva já foi paga ou confirmada
        if (item.triggerEvent === "payment_pending") {
          const isPaidOrConfirmed = resv && (
            resv.paymentStatus === "pago" || 
            resv.paymentStatus === "pago_total" || 
            resv.status === "confirmada" ||
            resv.status === "checkin" ||
            resv.status === "cancelada"
          );
          if (isPaidOrConfirmed) {
            console.log(`[Auto-WhatsApp] Descartando cobrança para ${item.guestName}: reserva já foi quitada ou confirmada.`);
            item.status = "cancelled";
            item.error = "Cancelado: reserva já paga ou confirmada";
            item.updatedAt = nowIso;
            saveDatabase();
            continue;
          }
        }

        // Checagem dinâmica de privacidade financeira: nunca enviar cobrança/PIX ao hóspede quando há solicitante distinto
        if (resv && isPureBillingTemplateOrEvent(item.triggerEvent || item.templateId) && (item.recipientType || "guest") !== "requester") {
          const itemRecipients = getReservationRecipients(resv, db);
          if (itemRecipients.requester?.isDifferentFromGuest) {
            console.log(`[Auto-WhatsApp] Cancelando cobrança agendada para o hóspede (${item.recipientName || item.guestName}): reserva possui solicitante distinto (${itemRecipients.requester.name}).`);
            item.status = "cancelled";
            item.error = "Cancelado: reserva possui solicitante distinto responsável pelo pagamento";
            item.updatedAt = nowIso;
            saveDatabase();
            continue;
          }
        }

        // Checagem dinâmica: se for lembrete de pré-checkin e todos os hóspedes já preencheram
        // (para acompanhantes: se aquele acompanhante já preencheu a própria ficha)
        if (item.triggerEvent === "pre_checkin_reminder") {
          const companionMatch = /^guest_(\d+)$/.exec(String(item.recipientType || ""));
          const companionGuest = companionMatch && Array.isArray(resv?.guests)
            ? resv.guests.find((g, idx) => (Number(g?.index) || idx + 1) === Number(companionMatch[1]))
            : null;
          const isCheckinDone = resv && (
            resv.checkedInAt || 
            (companionGuest && (companionGuest.hasCompletedCheckin || companionGuest.status === "CHECKED_IN")) ||
            (Array.isArray(resv.guests) && resv.guests.length > 0 && resv.guests.every(g => g.hasCompletedCheckin))
          );
          if (isCheckinDone) {
            console.log(`[Auto-WhatsApp] Descartando lembrete de pré-checkin para ${item.recipientName || item.guestName}: ficha já preenchida.`);
            item.status = "cancelled";
            item.error = "Cancelado: check-in digital já preenchido";
            item.updatedAt = nowIso;
            saveDatabase();
            continue;
          }
        }

        // Checagem dinâmica: alerta de limpeza em andamento (13:45) NUNCA deve ser disparado pela fila estática
        // ou para quem já entrou / está em flat já limpo
        if (item.triggerEvent === "checkin_cleaning_delay" || item.templateId === "tpl_checkin_cleaning_delay") {
          console.log(`[Auto-WhatsApp] Cancelando item estático de 'checkin_cleaning_delay' na fila para ${item.recipientName || item.guestName}: avaliação deve ocorrer exclusivamente em tempo real às 13:45.`);
          item.status = "cancelled";
          item.error = "Cancelado: alerta de limpeza em andamento é avaliado dinamicamente às 13:45 apenas para flats ainda sendo limpos";
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        // Checagem dinâmica: se for lembrete de café da manhã e o hóspede já fez o pedido de amanhã
        if (item.triggerEvent === "breakfast_reminder") {
          const tomorrowDate = new Date(brDate);
          tomorrowDate.setDate(tomorrowDate.getDate() + 1);
          const tomorrowStr = tomorrowDate.toISOString().substring(0, 10);
          const alreadyOrdered = (db.breakfastOrders || []).some(o =>
            (o.reservationId === resv?.id || o.reservationCode === resv?.code) &&
            o.date === tomorrowStr &&
            o.status !== "cancelled"
          );
          if (alreadyOrdered) {
            console.log(`[Auto-WhatsApp] Descartando lembrete de café da manhã para ${item.guestName}: pedido de amanhã já realizado.`);
            item.status = "cancelled";
            item.error = "Cancelado: pedido de café de amanhã já realizado";
            item.updatedAt = nowIso;
            saveDatabase();
            continue;
          }
        }

        // Trava de Segurança: Política do Canal guest_schedule (bloqueia apenas o WhatsApp; o e-mail espelho segue)
        const queuePolicy = item.guestPhone
          ? evaluateZapiChannelPolicy(db.zapiConfig, {
              channelId: "guest_schedule",
              phone: item.guestPhone,
              message: item.renderedMessage || "",
              db
            })
          : { allowed: false, reason: "no_phone" };
        const waBlockedByTestMode = Boolean(item.guestPhone) && !queuePolicy.allowed;
        if ((!item.guestPhone || waBlockedByTestMode) && !item.guestEmail) {
          console.log(`[Auto-WhatsApp Sandbox] Agendamento para ${item.guestPhone} (${item.recipientName || item.guestName}) CANCELADO da fila: ${queuePolicy.error || "Modo de Teste ativo"}.`);
          item.status = "cancelled";
          item.error = item.guestPhone
            ? (queuePolicy.error || "Cancelado pelo Modo de Teste: destinatário não está na lista autorizada.")
            : "Cancelado: destinatário sem WhatsApp ou e-mail.";
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        // Revalidação de segurança: se o template desautorizou este canal após o agendamento
        const tpl = (db.whatsappTemplates || []).find(t => t.id === item.templateId);
        const itemChannel = item.channel || resv?.channel || resv?.source;
        if (tpl && itemChannel && !isTemplateAllowedForChannel(tpl, itemChannel)) {
          console.log(`[Auto-WhatsApp] Cancelando disparo agendado de ${item.guestName}: canal '${itemChannel}' desativado no template '${tpl.title}'`);
          item.status = "cancelled";
          item.error = `Canal '${itemChannel}' desativado nas regras do template`;
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        let queueButtons = item.renderedButtons || [];
        const queueContext = `${item.triggerEvent || ""} ${item.templateId || ""} ${item.title || ""} ${item.renderedMessage || ""}`.toLowerCase();
        if (queueContext.includes("checkout") || queueContext.includes("check-out") || queueContext.includes("cancel") || queueContext.includes("review") || queueContext.includes("saida") || queueContext.includes("saída") || queueContext.includes("avaliação")) {
          queueButtons = queueButtons.filter(b => b && b.id !== "btn_cafe" && (!b.url || !String(b.url).includes("/cafe/")));
          item.renderedButtons = queueButtons;
        }

        console.log(`[Auto-WhatsApp] Disparando agendamento automático para ${item.recipientName || item.guestName} (${getRecipientTypeLabel(item.recipientType)} / ${item.triggerEvent} / Canal: ${itemChannel || 'Padrão'}${item.guestEmail ? ' / +E-mail' : ''}${waBlockedByTestMode ? ' / WhatsApp bloqueado pelo Modo de Teste' : ''})...`);
        await deliverQueueItem(db, saveDatabase, item, {
          method: "automated",
          historyPrefix: "cron",
          skipWhatsApp: waBlockedByTestMode,
          buttons: queueButtons
        });

        saveDatabase();
        // Pequena pausa entre mensagens para segurança anti-bloqueio
        await new Promise(r => setTimeout(r, 1500));
      }

      // 2. Garante que reservas confirmadas tenham suas réguas agendadas
      scheduleUpcomingReservationTriggers(db, saveDatabase);

      // 3. Verifica flats de check-in hoje ainda não limpos após as 13:45 e dispara solicitação de previsão
      await checkAndTriggerCleaningDelayAlerts(db, saveDatabase, createNotification, process.env.APP_BASE_URL || "https://corpflats.onrender.com");

      // 4. Higieniza falsos positivos de NPS e garante disparo das notas < 5 de hoje + alerta de fallback 15m ao gestor (22998505276)
      await sanitizeAndDispatchTodaySub5Nps(db, saveDatabase);
      await checkPendingNpsManagerAlerts(db, saveDatabase, createNotification);

    } catch (err) {
      console.error("[Auto-WhatsApp Cron Error]:", err.message);
    }
  }, 60 * 1000);
  if (runnerInterval && typeof runnerInterval.unref === "function") runnerInterval.unref();

  console.log("✓ [Z-API WhatsApp Engine] Inicializado e monitorando réguas de mensagens.");
}

// ── Controle de Concorrência (In-Flight Lock) e Desduplicação Global ───────────
const inFlightDispatches = new Set();
const inFlightPdfAttachments = new Set();

export const MUTUALLY_EXCLUSIVE_CONFIRMATION_EVENTS = new Set([
  "reservation_created",
  "payment_confirmed",
  "sameday_reservation"
]);

const ROOM_READY_GROUP_EVENTS = new Set([
  "room_ready",
  "room_ready_ota",
  "room_ready_regular"
]);

const CHECKOUT_GROUP_EVENTS = new Set([
  "checkout_completed",
  "on_checkout"
]);

const SINGLE_DISPATCH_EVENTS = new Set([
  "reservation_created",
  "payment_confirmed",
  "sameday_reservation",
  "pre_reservation_created",
  "pre_checkin_completed",
  "checkin_completed",
  "checkout_completed",
  "on_checkout",
  "room_ready",
  "room_ready_ota",
  "room_ready_regular",
  "reservation_cancelled",
  "checkin_cleaning_delay"
]);

function normalizePhoneForDedup(phone) {
  return String(phone || "").replace(/\D/g, "").replace(/^55/, "");
}

function getReservationDedupKey(reservation) {
  if (!reservation) return "";
  const code = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
  if (code) return code;
  if (reservation.id) return `ID_${reservation.id}`;
  return "";
}

function getEventGroupKey(eventName) {
  if (MUTUALLY_EXCLUSIVE_CONFIRMATION_EVENTS.has(eventName)) return "INITIAL_CONFIRMATION";
  if (ROOM_READY_GROUP_EVENTS.has(eventName)) return "ROOM_READY_GROUP";
  if (CHECKOUT_GROUP_EVENTS.has(eventName)) return "CHECKOUT_GROUP";
  return eventName;
}

function isSameEventGroup(evA, evB) {
  return getEventGroupKey(evA) === getEventGroupKey(evB);
}

export function isInitialConfirmationInFlightOrSent(db, reservation) {
  if (!reservation) return false;
  const resKey = getReservationDedupKey(reservation);
  const rCode = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
  const rId = reservation.id ? String(reservation.id) : "";

  for (const key of inFlightDispatches) {
    if (resKey && key.startsWith(`${resKey}:INITIAL_CONFIRMATION:`)) {
      return true;
    }
  }

  const history = db?.whatsappHistory || [];
  return history.some(h => {
    const hCode = String(h.reservationCode || "").trim().toUpperCase();
    const hId = h.reservationId ? String(h.reservationId) : "";
    const isSameRes = (rCode && hCode === rCode) || (rId && (hId === rId || hCode === rId));
    return isSameRes && MUTUALLY_EXCLUSIVE_CONFIRMATION_EVENTS.has(h.triggerEvent) && (h.status === "sent" || h.status === "delivered");
  });
}

function hasPdfAlreadyBeenSentOrInFlight(db, reservationCode, reservationId, phone) {
  const normPhone = normalizePhoneForDedup(phone);
  if (!normPhone) return false;
  const rCode = String(reservationCode || "").trim().toUpperCase();
  const rId = reservationId ? String(reservationId) : "";
  const resKey = rCode || (rId ? `ID_${rId}` : "");

  if (resKey && inFlightPdfAttachments.has(`${resKey}:${normPhone}`)) {
    return true;
  }

  return (db?.whatsappHistory || []).some(h => {
    if (h.status !== "sent" && h.status !== "delivered") return false;
    if (!h.documentUrl) return false;
    const hCode = String(h.reservationCode || "").trim().toUpperCase();
    const hId = h.reservationId ? String(h.reservationId) : "";
    const isSameRes = (rCode && hCode === rCode) || (rId && (hId === rId || hCode === rId));
    if (!isSameRes) return false;
    return normalizePhoneForDedup(h.guestPhone) === normPhone;
  });
}

// ── Disparo Unificado por Destinatário (WhatsApp + Espelho por E-mail) ────────
/**
 * Monta um item da fila de agendamentos para um destinatário (hóspede, acompanhante ou solicitante).
 */
export function buildQueueItemForTarget(db, { tpl, resv, target, scheduledFor, channel, baseUrl = "https://corpflats.onrender.com", idPrefix = "q", recipientTarget = null }) {
  const renderedMessage = resolveWhatsAppTags(tpl.message, resv, db, baseUrl, target.type, tpl);
  const renderedButtons = renderTemplateButtons(tpl.buttons, resv, db, baseUrl, target.type, tpl);
  const hasAttachment = Boolean(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && tpl.documentUrl));
  return {
    id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    reservationId: resv.id,
    reservationCode: resv.code,
    guestName: resv.guestName,
    guestPhone: target.phone || "",
    guestEmail: target.email || "",
    recipientType: target.type,
    recipientName: target.name,
    recipientTarget: recipientTarget || tpl.recipientTarget || "guest",
    channel,
    triggerEvent: tpl.triggerEvent,
    templateId: tpl.id,
    title: tpl.title,
    footer: tpl.footer,
    documentUrl: hasAttachment ? tpl.documentUrl : undefined,
    documentName: hasAttachment ? (tpl.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined,
    emailSubject: target.email ? buildMirrorEmailSubject(tpl, resv, db, baseUrl, target.type) : undefined,
    scheduledFor,
    status: "scheduled",
    sentAt: null,
    error: null,
    renderedMessage,
    renderedButtons,
    createdAt: new Date().toISOString()
  };
}

// Eventos permitidos APÓS a realização do check-out (agradecimento de saída, pesquisa de avaliação/NPS, recibo de pagamento ou cancelamento)
export const POST_CHECKOUT_ALLOWED_EVENTS = new Set([
  "checkout_completed",
  "on_checkout",
  "post_checkout_review",
  "nps_approved",
  "payment_confirmed",
  "reservation_cancelled"
]);

/**
 * Verifica de forma unificada se uma reserva (ou o respectivo flat na data de saída de hoje)
 * já teve o check-out informado por QUALQUER canal:
 *  - Portaria via WhatsApp
 *  - Painel da Recepção / Calendário PMS
 *  - Próprio hóspede via link digital ou WhatsApp (Sofia IA)
 *  - Governança: card de limpeza marcado como "Desocupado", "Limpando" ou "Limpo"
 */
export function isReservationOrFlatCheckedOut(db, resv, flatIdOverride = null, flatNumberOverride = null) {
  if (!db) return false;

  const now = new Date();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000));
  const todayStr = brDate.toISOString().substring(0, 10);

  if (resv) {
    const statusLower = String(resv.status || "").toLowerCase().trim();
    if (
      resv.checkoutDone === true ||
      statusLower === "completed" ||
      statusLower === "checkout" ||
      statusLower === "checked_out"
    ) {
      return true;
    }

    if (resv.actualCheckoutAt) {
      const actualBrDate = new Date(new Date(resv.actualCheckoutAt).getTime() - 3 * 3600 * 1000)
        .toISOString()
        .substring(0, 10);
      if (!resv.checkinDate || actualBrDate >= resv.checkinDate) {
        return true;
      }
    }

    const rCode = String(resv.code || resv.reservationCode || "").trim().toUpperCase();
    const rId = resv.id !== undefined && resv.id !== null ? String(resv.id) : "";

    // Se a confirmação de check-out já foi enviada no histórico ou na fila
    if (rCode || rId) {
      const sentCheckoutInHistory = (db.whatsappHistory || []).some(h => {
        if (h.status !== "sent" && h.status !== "delivered") return false;
        if (h.triggerEvent !== "checkout_completed" && h.triggerEvent !== "on_checkout") return false;
        const hCode = String(h.reservationCode || "").trim().toUpperCase();
        const hId = h.reservationId !== undefined && h.reservationId !== null ? String(h.reservationId) : "";
        return (rCode && hCode === rCode) || (rId && (hId === rId || hCode === rId));
      });
      if (sentCheckoutInHistory) return true;

      const sentCheckoutInQueue = (db.whatsappQueue || []).some(q => {
        if (q.status !== "sent" && q.status !== "delivered") return false;
        if (q.triggerEvent !== "checkout_completed" && q.triggerEvent !== "on_checkout" && q.templateId !== "tpl_checkout_completed") return false;
        const qCode = String(q.reservationCode || "").trim().toUpperCase();
        const qId = q.reservationId !== undefined && q.reservationId !== null ? String(q.reservationId) : "";
        return (rCode && qCode === rCode) || (rId && (qId === rId || qCode === rId));
      });
      if (sentCheckoutInQueue) return true;
    }
  }

  // Se a reserva é de um hóspede que está ENTRANDO hoje e só sai no futuro (turnover),
  // o card de limpeza de hoje pertence à saída do hóspede anterior, não a esta reserva.
  if (resv && resv.checkoutDate && resv.checkoutDate > todayStr) {
    return false;
  }

  const targetDate = resv?.checkoutDate || todayStr;
  const fId = resv?.flatId || flatIdOverride || null;
  const rawFlatNum = resv?.flatNumber || flatNumberOverride || (fId && Array.isArray(db.flats) ? db.flats.find(f => f.id === fId)?.number : "");
  const fNumClean = String(rawFlatNum || "").replace(/\D/g, "");

  if (fId || fNumClean) {
    const cleanReqs = (db.cleaningRequests || []).filter(c => {
      if (!c || c.isDeleted || c.status === "deleted") return false;
      if (c.isInstructionOnly || c.source === "manual_instruction" || c.type === "instruction" || c.type === "bed_adjustment_only") return false;
      const cNumClean = String(c.flatNumber || "").replace(/\D/g, "");
      const sameFlat = (fId && Number(c.flatId) === Number(fId)) || (fNumClean && cNumClean === fNumClean);
      if (!sameFlat) return false;
      return c.requestDate === targetDate || (c.effectiveDate === targetDate && c.status === "clean");
    });

    for (const c of cleanReqs) {
      if (c.status === "cleaning_now" || c.status === "in_progress" || c.status === "clean") {
        return true;
      }
      if (
        c.isVacant === true &&
        (
          c.isVacantExplicitlySet ||
          c.vacantSource === "guest_checkout" ||
          c.vacantSource === "reception_checkout" ||
          c.vacantSource === "whatsapp_concierge" ||
          c.vacantSource === "whatsapp_guest" ||
          c.vacantSource === "cleaning_started" ||
          c.vacantSource === "cleaning_completed" ||
          c.vacantSource === "manual_card" ||
          c.vacantSource === "admin" ||
          c.source === "guest_checkout" ||
          c.source === "whatsapp_concierge" ||
          c.source === "whatsapp_guest"
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Cancela todos os agendamentos pendentes de estadia / pré-checkout (como checkout_reminder,
 * breakfast_reminder, welcome_checkin, pre_checkin_reminder, etc.) tanto na fila do WhatsApp
 * (db.whatsappQueue) quanto na fila de E-mail (db.emailQueue), preservando apenas eventos
 * pós-checkout (checkout_completed, post_checkout_review, etc.).
 */
export function cancelPendingStayRemindersForCheckout(dbOrGetter, saveDatabase = null, options = {}) {
  const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
  if (!db) return { cancelledWhatsAppCount: 0, cancelledEmailCount: 0 };

  const {
    reservation = null,
    reservationId = null,
    reservationCode = null,
    flatId = null,
    flatNumber = null,
    reason = "Cancelado: check-out já realizado no flat"
  } = options || {};

  const now = new Date();
  const nowIso = now.toISOString();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000));
  const todayStr = brDate.toISOString().substring(0, 10);

  const targetReservations = [];
  const seenResKeys = new Set();
  const addTargetRes = (r) => {
    if (!r) return;
    const key = String(r.id || r.code || r.reservationCode || Math.random());
    if (!seenResKeys.has(key)) {
      seenResKeys.add(key);
      targetReservations.push(r);
    }
  };

  if (reservation) addTargetRes(reservation);

  const fId = flatId || reservation?.flatId || null;
  const rawFlatNum = flatNumber || reservation?.flatNumber || (fId && Array.isArray(db.flats) ? db.flats.find(f => f.id === fId)?.number : "");
  const fNumClean = String(rawFlatNum || "").replace(/\D/g, "");
  const targetCodeUpper = String(reservationCode || reservation?.code || reservation?.reservationCode || "").trim().toUpperCase();
  const targetIdStr = (reservationId ?? reservation?.id) !== undefined && (reservationId ?? reservation?.id) !== null
    ? String(reservationId ?? reservation?.id)
    : "";

  for (const r of (db.reservations || [])) {
    if (!r || r.status === "cancelada" || r.status === "cancelled" || r.status === "cancelado") continue;
    const rCode = String(r.code || r.reservationCode || "").trim().toUpperCase();
    const rId = r.id !== undefined && r.id !== null ? String(r.id) : "";

    if ((targetCodeUpper && rCode === targetCodeUpper) || (targetIdStr && (rId === targetIdStr || rCode === targetIdStr))) {
      addTargetRes(r);
      continue;
    }

    if (fId || fNumClean) {
      const rFlatClean = String(r.flatNumber || "").replace(/\D/g, "");
      const sameFlat = (fId && Number(r.flatId) === Number(fId)) || (fNumClean && rFlatClean === fNumClean);
      if (sameFlat && r.checkoutDate === todayStr) {
        addTargetRes(r);
      }
    }
  }

  const matchedCodes = new Set();
  const matchedIds = new Set();
  const matchedPhonesLast8 = new Set();

  if (targetCodeUpper) matchedCodes.add(targetCodeUpper);
  if (targetIdStr) matchedIds.add(targetIdStr);

  for (const r of targetReservations) {
    const c = String(r.code || r.reservationCode || "").trim().toUpperCase();
    if (c) matchedCodes.add(c);
    if (r.id !== undefined && r.id !== null) {
      matchedIds.add(String(r.id));
      if (r.flatNumber) {
        matchedCodes.add(`RES-${r.flatNumber}-${r.id}`.toUpperCase());
      }
    }
    const rawPhones = [r.guestPhone, r.phone, ...(Array.isArray(r.guests) ? r.guests.map(g => g?.phone) : [])];
    for (const p of rawPhones) {
      const digits = String(p || "").replace(/\D/g, "");
      if (digits.length >= 8) matchedPhonesLast8.add(digits.slice(-8));
    }
  }

  let cancelledWhatsAppCount = 0;
  if (Array.isArray(db.whatsappQueue)) {
    for (const qItem of db.whatsappQueue) {
      if (!qItem) continue;
      if (qItem.status !== "scheduled" && qItem.status !== "pending" && qItem.status !== "pending_approval") continue;

      const ev = String(qItem.triggerEvent || "").trim();
      const tplId = String(qItem.templateId || "").trim();
      if (POST_CHECKOUT_ALLOWED_EVENTS.has(ev) || tplId === "tpl_checkout_completed" || tplId === "tpl_post_checkout_review") {
        continue;
      }

      const qCode = String(qItem.reservationCode || "").trim().toUpperCase();
      const qId = qItem.reservationId !== undefined && qItem.reservationId !== null ? String(qItem.reservationId) : "";
      let isMatch = (qCode && matchedCodes.has(qCode)) || (qId && (matchedIds.has(qId) || matchedCodes.has(qId)));

      if (!isMatch && (ev === "checkout_reminder" || tplId === "tpl_checkout_reminder" || ev === "breakfast_reminder")) {
        const qPhoneDigits = String(qItem.guestPhone || "").replace(/\D/g, "");
        const qSchedDate = String(qItem.scheduledFor || "").substring(0, 10);
        if (qPhoneDigits.length >= 8 && matchedPhonesLast8.has(qPhoneDigits.slice(-8)) && (!qSchedDate || qSchedDate === todayStr)) {
          isMatch = true;
        }
      }

      if (isMatch) {
        qItem.status = "cancelled";
        qItem.error = reason;
        qItem.updatedAt = nowIso;
        cancelledWhatsAppCount++;
      }
    }
  }

  let cancelledEmailCount = 0;
  if (Array.isArray(db.emailQueue)) {
    for (const eItem of db.emailQueue) {
      if (!eItem) continue;
      if (eItem.status !== "scheduled" && eItem.status !== "pending") continue;

      const ev = String(eItem.triggerEvent || eItem.type || "").trim();
      if (POST_CHECKOUT_ALLOWED_EVENTS.has(ev)) continue;

      const eCode = String(eItem.reservationCode || "").trim().toUpperCase();
      const eId = eItem.reservationId !== undefined && eItem.reservationId !== null ? String(eItem.reservationId) : "";
      const isMatch = (eCode && matchedCodes.has(eCode)) || (eId && (matchedIds.has(eId) || matchedCodes.has(eId)));

      if (isMatch) {
        eItem.status = "cancelled";
        eItem.error = reason;
        eItem.updatedAt = nowIso;
        cancelledEmailCount++;
      }
    }
  }

  if ((cancelledWhatsAppCount > 0 || cancelledEmailCount > 0)) {
    console.log(`[Checkout Queue Cleanup] Cancelados ${cancelledWhatsAppCount} WhatsApp(s) e ${cancelledEmailCount} e-mail(s) pendentes de estadia/check-out (${reason}).`);
    if (typeof saveDatabase === "function") {
      saveDatabase();
    }
  }

  return { cancelledWhatsAppCount, cancelledEmailCount };
}

/**
 * Entrega um item da fila: WhatsApp (se houver telefone e não estiver bloqueado) e e-mail espelho (se houver e-mail).
 */
export async function deliverQueueItem(db, saveDatabase, item, { method = "automated", historyPrefix = "cron", skipWhatsApp = false, includeDocument = false, buttons = null, bypassTestMode = false } = {}) {
  const sendButtons = buttons || item.renderedButtons || [];
  const resv = (db.reservations || []).find(r => r.id === item.reservationId || r.code === item.reservationCode) || null;

  // Trava final anti-envio pós-checkout: se for lembrete de check-out ou estadia e o flat/reserva já teve check-out informado, cancela na hora
  if (!POST_CHECKOUT_ALLOWED_EVENTS.has(item.triggerEvent) && isReservationOrFlatCheckedOut(db, resv, item.flatId, item.flatNumber)) {
    console.log(`[Auto-WhatsApp] Bloqueando entrega de '${item.triggerEvent}' para ${item.recipientName || item.guestName}: check-out já realizado.`);
    item.status = "cancelled";
    item.error = "Cancelado: check-out já realizado no flat";
    item.updatedAt = new Date().toISOString();
    if (typeof saveDatabase === "function") saveDatabase();
    return { waResult: null, emailLog: null, success: false, cancelled: true };
  }

  // Trava final para alerta de limpeza em andamento: nunca entregar via fila estática nem para quem já entrou ou flat já limpo
  if (item.triggerEvent === "checkin_cleaning_delay" || item.templateId === "tpl_checkin_cleaning_delay") {
    const { todayStr } = getBrasiliaDateParts(new Date());
    if (!resv || hasReservationEnteredOrCompletedCheckin(db, resv, todayStr) || !isFlatStillBeingCleanedOnCheckinDay(db, resv, todayStr)) {
      console.log(`[Auto-WhatsApp] Bloqueando entrega de 'checkin_cleaning_delay' na fila para ${item.recipientName || item.guestName}: hóspede já entrou ou flat já está limpo/pronto.`);
      item.status = "cancelled";
      item.error = "Cancelado: hóspede já realizou check-in/entrada ou flat já está limpo/pronto";
      item.updatedAt = new Date().toISOString();
      if (typeof saveDatabase === "function") saveDatabase();
      return { waResult: null, emailLog: null, success: false, cancelled: true };
    }
  }

  let waResult = null;
  let emailLog = null;

  if (item.guestPhone && !skipWhatsApp) {
    let shouldSendDoc = Boolean(includeDocument && item.documentUrl);
    const normPhone = normalizePhoneForDedup(item.guestPhone);
    const resKey = String(item.reservationCode || (item.reservationId ? `ID_${item.reservationId}` : "")).trim().toUpperCase();
    const pdfLockKey = (shouldSendDoc && resKey && normPhone) ? `${resKey}:${normPhone}` : "";

    if (shouldSendDoc && hasPdfAlreadyBeenSentOrInFlight(db, item.reservationCode, item.reservationId, item.guestPhone)) {
      console.log(`[Z-API PDF Dedup] Anexo PDF já enviado anteriormente para ${item.guestPhone} na reserva ${item.reservationCode || item.reservationId}. Omitindo segundo envio de PDF na fila.`);
      shouldSendDoc = false;
    }

    if (shouldSendDoc && pdfLockKey) {
      inFlightPdfAttachments.add(pdfLockKey);
    }
    try {
      waResult = await sendZapiMessage(db.zapiConfig, {
        phone: item.guestPhone,
        message: item.renderedMessage,
        title: item.title,
        footer: item.footer,
        buttons: sendButtons,
        channelId: "guest_schedule",
        recipientRole: item.recipientType || "guest",
        triggerEvent: item.triggerEvent || item.triggerType || "queue_delivery",
        bypassTestMode,
        db,
        ...(shouldSendDoc ? { documentUrl: item.documentUrl, documentName: item.documentName } : {})
      });
    } finally {
      if (pdfLockKey) inFlightPdfAttachments.delete(pdfLockKey);
    }

    const sentAtWa = new Date().toISOString();
    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `${historyPrefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reservationCode: item.reservationCode,
      reservationId: item.reservationId || null,
      title: item.title || null,
      guestName: item.guestName,
      guestPhone: item.guestPhone,
      recipientType: item.recipientType || "guest",
      recipientName: item.recipientName || item.guestName,
      triggerEvent: item.triggerEvent,
      message: item.renderedMessage,
      buttons: item.renderedButtons,
      ...(shouldSendDoc ? { documentUrl: item.documentUrl || null, documentName: item.documentName || null } : {}),
      status: waResult.success ? "sent" : "failed",
      method: waResult.method || method,
      error: waResult.error || null,
      sentAt: sentAtWa
    });

    appendMessageToConversation(db, {
      phone: item.guestPhone,
      senderName: "CorpFlats",
      senderPhone: db?.zapiConfig?.instanceId || "",
      fromMe: true,
      text: item.renderedMessage,
      type: (shouldSendDoc && item.documentUrl) ? "document" : "text",
      ...(shouldSendDoc ? { mediaUrl: item.documentUrl || null, fileName: item.documentName || null } : {}),
      buttons: item.renderedButtons,
      triggerEvent: item.triggerEvent,
      reservationCode: item.reservationCode,
      status: waResult.success ? "read" : "failed",
      timestamp: sentAtWa,
      messageId: waResult.messageId || `msg_${historyPrefix}_${Date.now()}`
    });

    if (
      waResult.success &&
      (item.triggerEvent === "post_checkout_review" || item.templateId === "tpl_nps_satisfaction_check")
    ) {
      registerNpsSurveySent(db, {
        phone: item.guestPhone,
        guestName: resv?.guestName || item.guestName || item.recipientName,
        reservationId: item.reservationId || resv?.id || null,
        reservationCode: item.reservationCode || resv?.code || null,
        flatNumber: item.flatNumber || resv?.flatNumber || null,
        channel: item.channel || resv?.channel || "whatsapp",
        sentAt: sentAtWa
      });
    }
  }

  const currentTpl = item.templateId ? (db.whatsappTemplates || []).find(t => t.id === item.templateId) : null;
  const emailAllowedNow = !currentTpl || shouldMirrorTemplateToEmail(currentTpl);
  if (item.guestEmail && emailAllowedNow) {
    emailLog = sendMirrorEmail(db, saveDatabase, {
      reservation: resv,
      reservationCode: item.reservationCode,
      reservationId: item.reservationId,
      email: item.guestEmail,
      recipientName: item.recipientName || item.guestName,
      recipientType: item.recipientType || "guest",
      templateId: item.templateId,
      triggerEvent: item.triggerEvent,
      subject: item.emailSubject || buildMirrorEmailSubject({ triggerEvent: item.triggerEvent }, resv || { code: item.reservationCode }, db),
      message: item.renderedMessage,
      buttons: sendButtons,
      footer: item.footer,
      documentUrl: item.documentUrl,
      documentName: item.documentName,
      source: method
    });
  }

  const waSuccess = Boolean(waResult?.success);
  const anySuccess = waSuccess || Boolean(emailLog);
  item.whatsappStatus = waResult ? (waSuccess ? "sent" : "failed") : (item.guestPhone ? "skipped" : "no_phone");
  if (item.guestEmail) item.emailStatus = emailLog ? "sent" : "skipped";
  item.status = anySuccess ? "sent" : "failed";
  item.sentAt = new Date().toISOString();
  item.error = (waResult && !waSuccess)
    ? (waResult.error || "Falha no envio do WhatsApp")
    : (anySuccess ? null : (item.guestEmail
      ? (emailAllowedNow ? "E-mail não enviado (motor de e-mails automáticos pausado)" : "E-mail desativado no template")
      : "Nenhum canal disponível para envio"));
  item.method = waResult?.method || (emailLog ? "email" : method);
  item.messageId = waResult?.messageId || null;

  return { waResult, emailLog, success: anySuccess };
}

/**
 * Dispara imediatamente um template para um destinatário: WhatsApp (respeitando o Modo de Teste)
 * e espelho por e-mail (respeitando a chave do motor de e-mails automáticos).
 */
export async function dispatchTemplateToTarget(db, saveDatabase, { tpl, eventName, reservation, target, baseUrl = "" }) {
  const renderedMessage = resolveWhatsAppTags(tpl.message, reservation, db, baseUrl, target.type, tpl);
  const renderedButtons = renderTemplateButtons(tpl.buttons, reservation, db, baseUrl, target.type, tpl);
  const rawHasAttachment = Boolean(tpl.hasAttachment === true || (tpl.hasAttachment === undefined && tpl.documentUrl));
  let hasAttachment = rawHasAttachment;
  let docUrl = hasAttachment ? (tpl.documentUrl || db?.zapiConfig?.guestGuidePdfUrl) : undefined;
  let docName = hasAttachment ? (tpl.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined;
  const label = `${getRecipientTypeLabel(target.type)}: ${target.name}`;

  const resCode = reservation.code || reservation.reservationCode || (reservation.id ? `RES-${reservation.flatNumber || ''}-${String(reservation.id).padStart(4, '0')}` : null);
  const resId = reservation.id || null;
  const resKey = getReservationDedupKey(reservation) || String(resCode || "");
  const eventGroup = getEventGroupKey(eventName);
  const normPhone = normalizePhoneForDedup(target.phone);
  const lockKey = (resKey && normPhone)
    ? (eventName === "pre_checkin_completed" ? `${resKey}:${eventGroup}:${target.type || "guest"}:${normPhone}` : `${resKey}:${eventGroup}:${normPhone}`)
    : "";
  const pdfLockKey = (resKey && normPhone) ? `${resKey}:${normPhone}` : "";

  let waResult = null;
  let emailLog = null;

  if (target.phone) {
    const channelPolicy = evaluateZapiChannelPolicy(db?.zapiConfig, {
      channelId: "guest_schedule",
      phone: target.phone,
      message: renderedMessage,
      db
    });
    if (!channelPolicy.allowed) {
      console.warn(`[WhatsApp Sandbox] Envio imediato de '${tpl.title}' para ${target.phone} (${target.name}) IGNORADO: ${channelPolicy.error || channelPolicy.reason}.`);
    } else if (lockKey && inFlightDispatches.has(lockKey)) {
      console.warn(`[Z-API Anti-Dup Lock] Disparo concorrente de '${eventName}' (${eventGroup}) para ${target.phone} na reserva ${resCode} BLOQUEADO (já em andamento).`);
    } else {
      // Verifica se este documento PDF já foi enviado ou está em envio para esta reserva + telefone
      if (hasAttachment && docUrl && hasPdfAlreadyBeenSentOrInFlight(db, resCode, resId, target.phone)) {
        console.log(`[Z-API PDF Dedup] Manual em PDF já foi enviado para ${target.phone} na reserva ${resCode}. Enviando apenas texto sem duplicar o PDF.`);
        hasAttachment = false;
        docUrl = undefined;
        docName = undefined;
      }

      if (lockKey) inFlightDispatches.add(lockKey);
      if (hasAttachment && docUrl && pdfLockKey) inFlightPdfAttachments.add(pdfLockKey);

      try {
        console.log(`[Z-API Instant Trigger] Disparando '${tpl.title}' (${label}) para ${target.phone}...`);
        waResult = await sendZapiMessage(db.zapiConfig, {
          phone: target.phone,
          message: renderedMessage,
          title: tpl.title,
          footer: tpl.footer,
          buttons: renderedButtons,
          documentUrl: docUrl,
          documentName: docName,
          documentCaption: hasAttachment ? tpl.documentCaption : undefined,
          channelId: "guest_schedule",
          recipientRole: target.type || "guest",
          triggerEvent: eventName,
          db
        });

        if (!db.whatsappHistory) db.whatsappHistory = [];
        db.whatsappHistory.push({
          id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reservationCode: resCode,
          reservationId: resId,
          title: tpl.title || null,
          guestName: reservation.guestName,
          guestPhone: target.phone,
          recipientType: target.type,
          recipientName: target.name,
          triggerEvent: eventName,
          message: renderedMessage,
          buttons: renderedButtons,
          documentUrl: docUrl || null,
          documentName: docName || null,
          status: waResult.success ? "sent" : "failed",
          method: waResult.method || "instant_trigger",
          error: waResult.error || null,
          sentAt: new Date().toISOString()
        });

        appendMessageToConversation(db, {
          phone: target.phone,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: renderedMessage,
          type: (docUrl || hasAttachment) ? "document" : "text",
          mediaUrl: docUrl || null,
          fileName: docName || null,
          buttons: renderedButtons,
          triggerEvent: eventName,
          reservationCode: reservation.code,
          status: waResult.success ? "read" : "failed",
          timestamp: new Date().toISOString(),
          messageId: waResult.messageId || `msg_auto_${Date.now()}`
        });

        if (
          waResult.success &&
          (eventName === "post_checkout_review" || tpl?.id === "tpl_nps_satisfaction_check")
        ) {
          registerNpsSurveySent(db, {
            phone: target.phone,
            guestName: reservation?.guestName || target.name,
            reservationId: resId,
            reservationCode: resCode,
            flatNumber: reservation?.flatNumber || null,
            channel: reservation?.channel || "whatsapp",
            sentAt: new Date().toISOString()
          });
        }
      } finally {
        if (lockKey) inFlightDispatches.delete(lockKey);
        if (pdfLockKey) inFlightPdfAttachments.delete(pdfLockKey);
      }
    }
  }

  if (target.email) {
    console.log(`[E-mail Espelho] Enviando '${tpl.title}' (${label}) para ${target.email}...`);
    emailLog = sendMirrorEmail(db, saveDatabase, {
      reservation,
      email: target.email,
      recipientName: target.name,
      recipientType: target.type,
      templateId: tpl.id,
      triggerEvent: eventName,
      subject: buildMirrorEmailSubject(tpl, reservation, db, baseUrl, target.type),
      message: renderedMessage,
      buttons: renderedButtons,
      footer: tpl.footer,
      documentUrl: docUrl,
      documentName: docName,
      baseUrl,
      source: "instant_trigger"
    });
  }

  return { waResult, emailLog, renderedMessage, renderedButtons };
}

// ── Populador de Fila para Reservas Futuras (Regras por Tempo) ─────────────────
export function scheduleUpcomingReservationTriggers(dbOrGetter, saveDatabase) {
  const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
  if (!db || !db.whatsappTemplates || !db.reservations) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000));
  const todayStr = brDate.toISOString().substring(0, 10);

  let hasChanges = false;

  // 0. Higienização preventiva: 'checkin_cleaning_delay' NUNCA deve ficar pré-agendado na fila estática,
  // pois depende exclusivamente de o flat ainda estar sendo limpo às 13:45 no dia do check-in.
  if (Array.isArray(db.whatsappQueue)) {
    for (const qItem of db.whatsappQueue) {
      if (!qItem) continue;
      if ((qItem.status === "scheduled" || qItem.status === "pending") &&
          (qItem.triggerEvent === "checkin_cleaning_delay" || qItem.templateId === "tpl_checkin_cleaning_delay")) {
        qItem.status = "cancelled";
        qItem.error = "Cancelado: alerta de limpeza em andamento é avaliado dinamicamente às 13:45 apenas para flats ainda sendo limpos";
        qItem.updatedAt = nowIso;
        hasChanges = true;
      }
    }
  }
  if (Array.isArray(db.emailQueue)) {
    for (const eItem of db.emailQueue) {
      if (!eItem) continue;
      const ev = String(eItem.triggerEvent || eItem.type || "").trim();
      if ((eItem.status === "scheduled" || eItem.status === "pending") &&
          (ev === "checkin_cleaning_delay" || eItem.templateId === "tpl_checkin_cleaning_delay")) {
        eItem.status = "cancelled";
        eItem.error = "Cancelado: alerta de limpeza em andamento é avaliado dinamicamente às 13:45 apenas para flats ainda sendo limpos";
        eItem.updatedAt = nowIso;
        hasChanges = true;
      }
    }
  }

  // Exclui explicitamente 'checkin_cleaning_delay' do pré-agendamento automático na fila
  const activeTemplates = db.whatsappTemplates.filter(t =>
    t.enabled &&
    t.triggerTiming !== "immediate" &&
    t.triggerEvent !== "checkin_cleaning_delay" &&
    t.id !== "tpl_checkin_cleaning_delay"
  );
  if (activeTemplates.length === 0) {
    if (hasChanges && typeof saveDatabase === "function") saveDatabase();
    return;
  }

  // Data limite para considerar reservas recentes para NPS (+24h pós-checkout)
  const twoDaysAgo = new Date(brDate);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().substring(0, 10);

  // Processar reservas ativas/futuras e recentes (para NPS)
  const reservationsToProcess = (db.reservations || []).filter(r => 
    r.status !== "cancelada" && 
    r.status !== "cancelled" && 
    r.status !== "CANCELLED" && 
    r.checkoutDate && 
    r.checkoutDate >= twoDaysAgoStr &&
    reservationHasAnyContact(r, db)
  );

  for (const resv of reservationsToProcess) {
    const isCompletedOrCheckedOut = isReservationOrFlatCheckedOut(db, resv);
    if (isCompletedOrCheckedOut) {
      const cleanupRes = cancelPendingStayRemindersForCheckout(db, null, {
        reservation: resv,
        flatId: resv.flatId,
        flatNumber: resv.flatNumber,
        reason: "Cancelado: check-out já realizado no flat"
      });
      if (cleanupRes.cancelledWhatsAppCount > 0 || cleanupRes.cancelledEmailCount > 0) {
        hasChanges = true;
      }
    }
    const resvChannel = resv.channel || resv.source || "site";
    const recipients = getReservationRecipients(resv, db);

    for (const tpl of activeTemplates) {
      // Se a data de checkout já passou, APENAS processar post_checkout_review
      if (resv.checkoutDate < todayStr && tpl.triggerEvent !== "post_checkout_review") {
        continue;
      }

      // Se a reserva já realizou check-out/concluída, NUNCA agendar mensagens pré-estadia ou lembretes de estadia
      if (isCompletedOrCheckedOut && tpl.triggerEvent !== "post_checkout_review") {
        continue;
      }

      // 1. Filtro de Pré-Reserva: tpl_payment_pending só agenda se ainda estiver pendente/pré-reserva
      if (resv.status === "pre_reserva" || resv.paymentStatus === "pendente") {
        if (tpl.triggerEvent !== "payment_pending") {
          continue;
        }
      } else {
        // Se a reserva já está confirmada/paga, nunca agendar payment_pending
        if (tpl.triggerEvent === "payment_pending") {
          continue;
        }
      }

      // 2. Filtro de Pré-Check-in: só agenda para quem ainda não concluiu o check-in digital
      if (tpl.triggerEvent === "pre_checkin_reminder") {
        const isCheckinDone = Boolean(
          resv.checkedInAt || 
          (Array.isArray(resv.guests) && resv.guests.length > 0 && resv.guests.every(g => g.hasCompletedCheckin))
        );
        if (isCheckinDone) {
          continue;
        }
      }

      // 3. Filtro de Café da Manhã: só agenda se tiver café contratado e ainda não tiver pedido para amanhã
      if (tpl.triggerEvent === "breakfast_reminder") {
        if (!resv.includeBreakfast && resv.ratePlan !== "with_breakfast") {
          continue;
        }
        const tomorrowDate = new Date(brDate);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().substring(0, 10);
        const alreadyOrderedTomorrow = (db.breakfastOrders || []).some(o =>
          (o.reservationId === resv.id || o.reservationCode === resv.code) &&
          o.date === tomorrowStr &&
          o.status !== "cancelled"
        );
        if (alreadyOrderedTomorrow) {
          continue;
        }
      }

      // 4. Verifica se o canal da reserva está permitido no template
      if (!isTemplateAllowedForChannel(tpl, resvChannel)) {
        continue;
      }

      const targetMode = tpl.recipientTarget || "guest";
      const targetsToSchedule = buildTemplateTargets(tpl, recipients, { targetMode });

      for (const targetItem of targetsToSchedule) {
        // Acompanhante que já preencheu a própria ficha não recebe lembrete de pré-check-in
        if (tpl.triggerEvent === "pre_checkin_reminder" && targetItem.guestIndex > 1 && targetItem.hasCompletedCheckin) {
          continue;
        }

        // Trava de Segurança: Modo de Teste / Sandbox (bloqueia só o WhatsApp; sem e-mail, não agenda)
        const waBlockedByTestMode = Boolean(targetItem.phone) && db?.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(targetItem.phone, db?.zapiConfig);
        if ((!targetItem.phone || waBlockedByTestMode) && !targetItem.email) {
          continue;
        }

        // Verifica se já existe agendamento ou envio para essa combinação (reserva + trigger + recipientType)
        const alreadyQueued = (db.whatsappQueue || []).some(q => 
          (q.reservationCode === resv.code || q.reservationId === resv.id) &&
          q.triggerEvent === tpl.triggerEvent &&
          (q.recipientType || "guest") === targetItem.type &&
          (q.status === "scheduled" || q.status === "sent")
        );

        const alreadySentInHistory = (db.whatsappHistory || []).some(h =>
          (h.reservationCode === resv.code || h.reservationId === resv.id) &&
          h.triggerEvent === tpl.triggerEvent &&
          (h.recipientType || "guest") === targetItem.type &&
          (h.status === "sent" || h.status === "delivered")
        );

        if (!alreadyQueued && !alreadySentInHistory) {
          let scheduledTime = calculateScheduledTime(tpl, resv, db);
          let scheduledDate = new Date(scheduledTime);

          // Se o horário do NPS (+24h pós 12:00 de checkout) já chegou ou passou nas últimas 24h,
          // agenda para envio em 1 minuto para não perder a pesquisa de satisfação
          if (scheduledDate <= now && tpl.triggerEvent === "post_checkout_review") {
            const diffHours = (now.getTime() - scheduledDate.getTime()) / (3600 * 1000);
            if (diffHours >= 0 && diffHours <= 24) {
              scheduledDate = new Date(now.getTime() + 60 * 1000);
              scheduledTime = scheduledDate.toISOString();
            }
          }

          // Apenas agenda se for no futuro (> now)
          if (scheduledDate > now) {
            if (!db.whatsappQueue) db.whatsappQueue = [];
            db.whatsappQueue.push(buildQueueItemForTarget(db, {
              tpl,
              resv,
              target: targetItem,
              scheduledFor: scheduledTime,
              channel: resvChannel,
              recipientTarget: targetMode
            }));

            hasChanges = true;
          }
        }
      }
    }
  }

  if (hasChanges && typeof saveDatabase === "function") {
    saveDatabase();
  }
}

// ── Disparo Imediato ao Ocorrer Evento (Nova Reserva, Cancelamento, etc.) ──────
export async function triggerImmediateWhatsApp(dbOrGetter, saveDatabase, eventName, reservation, baseUrl = "") {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db) return;
    const waEnabled = Boolean(db?.zapiConfig?.enabled);
    const emailEnabled = db?.settings?.emailSettings?.enabled !== false;
    if (!waEnabled && !emailEnabled) {
      console.warn(`[Trigger] Evento '${eventName}' para reserva ${reservation?.code || reservation?.id} (${reservation?.guestName}) IGNORADO pois os motores de envio (WhatsApp e E-mail) estão desativados.`);
      return;
    }
    if (!reservation) return;
    if ((reservation.status === "pre_reserva" || reservation.status === "pendente") &&
        eventName !== "pre_reservation_created" &&
        eventName !== "payment_pending" &&
        eventName !== "reservation_cancelled") {
      console.log(`[WhatsApp Trigger ⏳] Evento '${eventName}' retido para ${reservation.code || reservation.id}: reserva ainda está como pré-reserva aguardando pagamento.`);
      return;
    }

    const now = new Date();
    const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brDate = new Date(nowUtc - (3 * 3600000));
    const todayStr = brDate.toISOString().substring(0, 10);

    // REGRA DE OURO: NUNCA disparar mensagens para reservas cuja estadia terminou há mais de 3 dias
    const threeDaysAgo = new Date(nowUtc - (3 * 24 + 3) * 3600000);
    const threeDaysAgoStr = threeDaysAgo.toISOString().substring(0, 10);
    if (reservation.checkoutDate && reservation.checkoutDate < threeDaysAgoStr) {
      console.warn(`[WhatsApp Trigger] Evento '${eventName}' IGNORADO pois a reserva ${reservation?.code || reservation?.id} (${reservation?.guestName}) é antiga (checkout em ${reservation.checkoutDate}).`);
      return;
    }

    // NUNCA disparar mensagem de "Nova Reserva Criada" para reservas criadas há mais de 48h (reservas feitas no passado)
    if ((eventName === "reservation_created" || eventName === "pre_reservation_created") && reservation.createdAt) {
      const createdDate = new Date(reservation.createdAt);
      if ((now.getTime() - createdDate.getTime()) > 48 * 3600 * 1000) {
        console.warn(`[WhatsApp Trigger] Evento '${eventName}' IGNORADO pois a reserva ${reservation.code} foi criada há mais de 48h (${reservation.createdAt}). Mensagens da régua de estadia continuam ativas.`);
        return;
      }
    }

    const resvChannel = reservation.channel || reservation.source || "site";

    // Trava estrita para 'checkin_cleaning_delay': nunca disparar se o hóspede já realizou check-in/entrada
    // ou se o flat já está limpo/pronto.
    if (eventName === "checkin_cleaning_delay") {
      if (hasReservationEnteredOrCompletedCheckin(db, reservation, todayStr)) {
        console.log(`[WhatsApp Trigger] Evento 'checkin_cleaning_delay' IGNORADO para ${reservation.code || reservation.id} (${reservation.guestName}): hóspede já entrou / marcou check-in como feito ou já recebeu aviso de quarto pronto.`);
        return;
      }
      if (!isFlatStillBeingCleanedOnCheckinDay(db, reservation, todayStr)) {
        console.log(`[WhatsApp Trigger] Evento 'checkin_cleaning_delay' IGNORADO para ${reservation.code || reservation.id} (${reservation.guestName}): Flat ${reservation.flatNumber} já está limpo/pronto.`);
        return;
      }
    }

    let templates = (db.whatsappTemplates || []).filter(t => 
      t.enabled && 
      t.triggerEvent === eventName && 
      (t.triggerTiming === "immediate" || eventName === "checkin_cleaning_delay") &&
      isTemplateAllowedForChannel(t, resvChannel)
    );

    // REGRA ANTI-DUPLICAÇÃO: Se houver template especializado (direct ou ota) para reservation_created,
    // nunca disparar o template genérico legatário tpl_new_reservation
    if (eventName === "reservation_created" && templates.some(t => t.id === "tpl_new_reservation_direct" || t.id === "tpl_new_reservation_ota")) {
      templates = templates.filter(t => t.id !== "tpl_new_reservation");
    }

    // REGRA ANTI-DUPLICAÇÃO: No pós checkout automático, tpl_post_checkout_review só deve rodar no evento nps_approved
    if (eventName === "post_checkout_review") {
      templates = templates.filter(t => t.id !== "tpl_post_checkout_review");
    }

    if (templates.length === 0 && eventName === "pre_reservation_created") {
      const defPre = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_reserva");
      if (defPre) templates = [defPre];
    } else if (templates.length === 0 && eventName === "payment_confirmed") {
      const defPay = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_payment_confirmed");
      if (defPay) templates = [defPay];
    } else if (templates.length === 0 && eventName === "reservation_cancelled") {
      const defCancel = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_reservation_cancelled" || t.triggerEvent === "reservation_cancelled");
      if (defCancel) templates = [defCancel];
    } else if (templates.length === 0 && (eventName === "checkout_completed" || eventName === "on_checkout")) {
      const defCheckout = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkout_completed" || t.triggerEvent === "checkout_completed");
      if (defCheckout) templates = [defCheckout];
    } else if (templates.length === 0 && eventName === "reservation_updated") {
      const defUpdated = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_reservation_updated" || t.triggerEvent === "reservation_updated");
      if (defUpdated) templates = [defUpdated];
    } else if (templates.length === 0 && eventName === "sameday_reservation") {
      const defSameday = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_sameday_reservation_instructions" || t.triggerEvent === "sameday_reservation");
      if (defSameday) templates = [defSameday];
    } else if (templates.length === 0 && eventName === "pre_checkin_completed") {
      const defPreChkDone = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_checkin_completed" || t.triggerEvent === "pre_checkin_completed");
      if (defPreChkDone) templates = [defPreChkDone];
    } else if (templates.length === 0 && eventName === "checkin_cleaning_delay") {
      const hasExplicitlyDisabled = (db.whatsappTemplates || []).some(
        t => (t.id === "tpl_checkin_cleaning_delay" || t.triggerEvent === "checkin_cleaning_delay") &&
             (t.enabled === false || !isTemplateAllowedForChannel(t, resvChannel))
      );
      if (!hasExplicitlyDisabled) {
        const defDelay = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_checkin_cleaning_delay" || t.triggerEvent === "checkin_cleaning_delay");
        if (defDelay && isTemplateAllowedForChannel(defDelay, resvChannel)) templates = [defDelay];
      }
    }

    // Se o evento for check-in digital concluído, cancela lembretes pendentes (pre_checkin_reminder) na fila para este hóspede
    if (eventName === "pre_checkin_completed" && Array.isArray(db?.whatsappQueue)) {
      const completedGuestIdx = Number(reservation._checkinGuestIndex) || 1;
      const completedRecipientType = completedGuestIdx > 1 ? `guest_${completedGuestIdx}` : "guest";
      const allGuestsDone = Boolean(
        reservation.fnhrCompleted ||
        (Array.isArray(reservation.guests) && reservation.guests.length > 0 && reservation.guests.every(g => g.hasCompletedCheckin || g.status === "CHECKED_IN"))
      );
      let queueCancelledCount = 0;
      const nowIso = new Date().toISOString();
      for (const qItem of db.whatsappQueue) {
        if ((qItem.status === "pending" || qItem.status === "scheduled") && qItem.triggerEvent === "pre_checkin_reminder") {
          const isSameRes = (reservation.code && qItem.reservationCode === reservation.code) ||
                            (reservation.id && qItem.reservationId === reservation.id);
          if (isSameRes && (allGuestsDone || (qItem.recipientType || "guest") === completedRecipientType)) {
            qItem.status = "cancelled";
            qItem.error = "Cancelado: check-in digital já preenchido";
            qItem.updatedAt = nowIso;
            queueCancelledCount++;
          }
        }
      }
      if (queueCancelledCount > 0 && typeof saveDatabase === "function") {
        saveDatabase();
      }
    }

    // Se o evento for cancelamento de reserva, descarta automaticamente disparos pendentes na fila
    if (eventName === "reservation_cancelled" && Array.isArray(db?.whatsappQueue)) {
      let queueCancelledCount = 0;
      const nowIso = new Date().toISOString();
      for (const qItem of db.whatsappQueue) {
        if (qItem.status === "pending" || qItem.status === "scheduled") {
          const isSameRes = (reservation.code && qItem.reservationCode === reservation.code) ||
                            (reservation.id && qItem.reservationId === reservation.id);
          if (isSameRes) {
            qItem.status = "cancelled";
            qItem.error = "Cancelado: reserva cancelada no sistema";
            qItem.updatedAt = nowIso;
            queueCancelledCount++;
          }
        }
      }
      if (queueCancelledCount > 0 && typeof saveDatabase === "function") {
        console.log(`[Auto-WhatsApp] Cancelados ${queueCancelledCount} agendamentos na fila para reserva cancelada ${reservation.code || reservation.id}.`);
        saveDatabase();
      }
    }

    // Se o evento for confirmação de check-out, cancela imediatamente quaisquer lembretes pendentes de check-out ou estadia
    if (eventName === "checkout_completed" || eventName === "on_checkout") {
      cancelPendingStayRemindersForCheckout(db, saveDatabase, {
        reservation,
        flatId: reservation.flatId,
        flatNumber: reservation.flatNumber,
        reason: "Cancelado: check-out já realizado"
      });
    }

    const recipients = getReservationRecipients(reservation, db);
    const rCode = String(reservation.code || reservation.reservationCode || "").trim().toUpperCase();
    const rId = reservation.id ? String(reservation.id) : "";
    const resKey = getReservationDedupKey(reservation);
    const eventGroup = getEventGroupKey(eventName);
    const isSingleFireEvent = SINGLE_DISPATCH_EVENTS.has(eventName);
    const isUpdatedEvent = eventName === "reservation_updated";
    const isReSignPreCheckin = eventName === "pre_checkin_completed" && Boolean(reservation._wasReSignature);

    for (const tpl of templates) {
      const targetMode = tpl.recipientTarget || "guest";
      const onlyGuestIndex = eventName === "pre_checkin_completed" ? (Number(reservation._checkinGuestIndex) || 0) : 0;
      const dispatches = buildTemplateTargets(tpl, recipients, { targetMode, onlyGuestIndex });

      for (const d of dispatches) {
        let target = { ...d };

        // Se a reserva tiver solicitante distinto e a alteração foi EXCLUSIVAMENTE financeira,
        // não envia notificação de atualização ao hóspede/acompanhantes.
        if (isUpdatedEvent && recipients.requester?.isDifferentFromGuest && target.type !== "requester") {
          const changes = reservation._changesContext || [];
          if (Array.isArray(changes) && changes.length > 0 && !hasNonFinancialChanges(changes)) {
            console.log(`[Z-API Privacy] Ignorando envio de 'reservation_updated' para o hóspede (${target.name}): alterações foram exclusivamente financeiras e há solicitante distinto (${recipients.requester.name}).`);
            continue;
          }
        }

        // Validação global anti-duplicação (Histórico + In-Flight Lock) para eventos únicos e reservation_updated (janela de 30s)
        if ((isSingleFireEvent || isUpdatedEvent) && (rCode || rId)) {
          if (target.phone) {
            const normTargetPhone = normalizePhoneForDedup(target.phone);
            const lockKey = (resKey && normTargetPhone)
              ? (eventName === "pre_checkin_completed" ? `${resKey}:${eventGroup}:${target.type || "guest"}:${normTargetPhone}` : `${resKey}:${eventGroup}:${normTargetPhone}`)
              : "";
            const isInFlight = Boolean(lockKey && inFlightDispatches.has(lockKey));

            const alreadySentWa = (db.whatsappHistory || []).some(h => {
              if (h.status !== "sent" && h.status !== "delivered") return false;
              const hCode = String(h.reservationCode || "").trim().toUpperCase();
              const hId = h.reservationId ? String(h.reservationId) : "";
              const isSameRes = (rCode && hCode === rCode) || (rId && (hId === rId || hCode === rId));
              if (!isSameRes) return false;
              if (!isSameEventGroup(h.triggerEvent, eventName)) return false;
              if (eventName === "pre_checkin_completed" && (h.recipientType || "guest") !== (target.type || "guest")) return false;
              if (normalizePhoneForDedup(h.guestPhone) !== normTargetPhone) return false;
              if ((isUpdatedEvent || isReSignPreCheckin) && h.sentAt) {
                const ageMs = Date.now() - new Date(h.sentAt).getTime();
                return ageMs >= 0 && ageMs < 30000;
              }
              return true;
            });

            if (isInFlight || alreadySentWa) {
              console.log(`[Z-API Anti-Dup] Evento '${eventName}' (${eventGroup}) já enviado ou em trânsito para ${target.phone} (Reserva ${reservation.code || reservation.id}). Ignorando duplicação.`);
              target.phone = "";
            }
          }

          if (target.email) {
            const normTargetEmail = String(target.email).trim().toLowerCase();
            const alreadySentEmail = (db.reservationCommunications || []).some(c => {
              if (c.status === "failed") return false;
              const cResId = String(c.reservation_id || "").trim().toUpperCase();
              const isSameRes = (rCode && cResId === rCode) || (rId && cResId === rId);
              if (!isSameRes) return false;
              if (c.metadata?.channel !== "whatsapp_mirror") return false;
              if (!isSameEventGroup(c.metadata?.trigger, eventName)) return false;
              if (eventName === "pre_checkin_completed" && (c.metadata?.recipientType || "guest") !== (target.type || "guest")) return false;
              if (String(c.recipient || "").trim().toLowerCase() !== normTargetEmail) return false;
              if ((isUpdatedEvent || isReSignPreCheckin) && c.sent_at) {
                const ageMs = Date.now() - new Date(c.sent_at).getTime();
                return ageMs >= 0 && ageMs < 30000;
              }
              return true;
            });
            if (alreadySentEmail) {
              target.email = "";
            }
          }

          if (!target.phone && !target.email) continue;
        }

        await dispatchTemplateToTarget(db, saveDatabase, { tpl, eventName, reservation, target, baseUrl });

        if (dispatches.length > 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      if (typeof saveDatabase === "function") {
        saveDatabase();
      }
    }
  } catch (err) {
    console.error(`[Z-API Instant Trigger Error]:`, err.message);
  }
}

// ── Disparo Centralizado de Check-out (com Desduplicação Estrita) ─────────────
export async function triggerCheckoutWhatsApp(dbOrGetter, saveDatabase, reservation, source = "manual") {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !reservation) return;

    // 0. Sempre cancela imediatamente qualquer lembrete pendente de check-out, café da manhã ou estadia na fila (WhatsApp e E-mail)
    cancelPendingStayRemindersForCheckout(db, saveDatabase, {
      reservation,
      flatId: reservation.flatId,
      flatNumber: reservation.flatNumber,
      reason: `Cancelado: check-out realizado (${source})`
    });

    const resCode = reservation.code || reservation.reservationCode;
    const resId = reservation.id;

    // 1. Verifica se a confirmação de checkout já foi enviada no histórico
    const alreadySentInHistory = (db.whatsappHistory || []).some(h => 
      ((resCode && h.reservationCode === resCode) || (resId && h.reservationId === resId)) &&
      (h.triggerEvent === "checkout_completed" || h.triggerEvent === "on_checkout") &&
      (h.status === "sent" || h.status === "delivered")
    );

    // 2. Verifica se já existe agendado na fila
    const alreadyInQueue = (db.whatsappQueue || []).some(q => 
      ((resCode && q.reservationCode === resCode) || (resId && q.reservationId === resId)) &&
      (q.triggerEvent === "checkout_completed" || q.triggerEvent === "on_checkout") &&
      (q.status === "scheduled" || q.status === "sent")
    );

    if (alreadySentInHistory || alreadyInQueue) {
      console.log(`[WhatsApp Checkout Trigger] Check-out da reserva ${resCode || resId} já foi notificado anteriormente via WhatsApp. Pulando envio duplicado (Origem atual: ${source}).`);
      // Mesmo pulando o envio duplicado, assegura que a avaliação do Google esteja agendada na fila para hoje às 14:00
      scheduleUpcomingReservationTriggers(db, saveDatabase);
      return;
    }

    console.log(`[WhatsApp Checkout Trigger] Disparando confirmação de check-out para ${reservation.guestName} (Reserva ${resCode || resId} | Origem: ${source})...`);

    // Dispara mensagem imediata de checkout concluído
    await triggerImmediateWhatsApp(db, saveDatabase, "checkout_completed", reservation);

    // Garante que o agendamento pós-checkout (avaliação Google às 14:00) entre na fila
    scheduleUpcomingReservationTriggers(db, saveDatabase);
  } catch (err) {
    console.error("[WhatsApp Checkout Trigger Error]:", err.message);
  }
}

// ── Disparo de "Quarto Pronto" ao Concluir Limpeza no Dia do Check-in ─────────
/**
 * Chamado quando status de limpeza vai para "clean".
 * Verifica se há reservas com check-in hoje naquele flat e dispara:
 *  - `room_ready`      → para canais diretos (site / whatsapp)
 * Verifica se há reservas com check-in hoje naquele flat e dispara:
 *  - Antes das 14:00:
 *      - `room_ready`      → para canais diretos (site / whatsapp) com benefício de Early Check-in a partir das 10:00
 *      - `room_ready_ota`  → para OTAs (booking / airbnb) com liberação a partir das 12:00
 *  - A partir das 14:00 (Check-in regular):
 *      - `room_ready_regular` → para canais diretos (sem texto de early check-in ou de 14:00)
 *      - `room_ready_ota`     → para OTAs (revelação do flat e instruções de chegada)
 */
export async function triggerRoomReadyWhatsApp(dbOrGetter, saveDatabase, flatId, flatNumber, baseUrl = "") {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !db.zapiConfig?.enabled) return;

    const now = new Date();
    const { todayStr, hour: brHour, minute: brMinute } = getBrasiliaDateParts(now);

    // Busca reservas com check-in hoje neste flat
    const arrivingToday = (db.reservations || []).filter(r =>
      r.status !== "cancelada" &&
      r.status !== "cancelled" &&
      r.status !== "no_show" &&
      r.status !== "checkout" &&
      r.status !== "pre_reserva" &&
      r.status !== "pendente" &&
      r.status !== "expirada" &&
      r.checkinDate === todayStr &&
      (r.flatId === flatId || String(r.flatNumber) === String(flatNumber)) &&
      reservationHasAnyContact(r, db)
    );

    if (arrivingToday.length === 0) return;

    const checkinTime = db.settings?.checkinTime || "14:00";
    const [checkHour, checkMin] = checkinTime.split(":").map(Number);
    const isAtOrAfterCheckin = brHour > checkHour || (brHour === checkHour && brMinute >= checkMin);

    for (const resv of arrivingToday) {
      // Trava de Segurança: Modo de Teste / Sandbox (só ignora se nenhum destinatário for alcançável)
      if (db?.zapiConfig?.testModeOnly !== false) {
        const rr = getReservationRecipients(resv, db);
        const contacts = [rr.guest, ...rr.companions];
        const reachable = contacts.some(c => c.email || (c.phone && isPhoneAllowedInTestMode(c.phone, db?.zapiConfig)));
        if (!reachable) {
          console.log(`[Room Ready Sandbox] Ignorando disparo de quarto pronto para ${resv.guestPhone} (${resv.guestName}): Modo de Teste ativo.`);
          continue;
        }
      }

      const resvChannel = normalizeReservationChannel(resv.channel || resv.source || "site");
      const isOtaChannel = resvChannel === "booking" || resvChannel === "airbnb";

      // Agenda o "quarto pronto" para um horário fixo, criando um item por destinatário (hóspede + acompanhantes)
      const enqueueRoomReadyForTargets = (defTpl, eventName, scheduledFor, idPrefix) => {
        if (!db.whatsappQueue) db.whatsappQueue = [];
        if (!defTpl) return;
        const tplForEvent = { ...defTpl, triggerEvent: eventName };
        const targets = buildTemplateTargets(tplForEvent, getReservationRecipients(resv, db), { targetMode: "guest" });
        let added = false;
        for (const target of targets) {
          const alreadyQueued = db.whatsappQueue.some(q =>
            (q.reservationCode === resv.code || q.reservationId === resv.id) &&
            q.triggerEvent === eventName &&
            (q.recipientType || "guest") === target.type &&
            (q.status === "scheduled" || q.status === "sent")
          );
          if (alreadyQueued) continue;
          const queueItem = buildQueueItemForTarget(db, {
            tpl: tplForEvent,
            resv,
            target,
            scheduledFor,
            channel: resvChannel,
            baseUrl: baseUrl || "https://corpflats.onrender.com",
            idPrefix,
            recipientTarget: "guest"
          });
          // Mantém o formato histórico destes agendamentos (sem anexo)
          delete queueItem.documentUrl;
          delete queueItem.documentName;
          db.whatsappQueue.push(queueItem);
          added = true;
        }
        if (added && typeof saveDatabase === "function") saveDatabase();
      };

      // 1. Regra para OTAs (Booking / Airbnb): Liberação a partir das 12:00
      if (isOtaChannel) {
        if (!isAtOrAfterCheckin) {
          const otaEarliest = new Date();
          otaEarliest.setHours(12, 0, 0, 0);

          if (now < otaEarliest) {
            console.log(`[Room Ready OTA] Flat ${flatNumber} limpo antes das 12:00 (${now.toLocaleTimeString("pt-BR")}). Agendando disparo para as 12:00 pontualmente.`);
            const defTpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_room_ready_ota") ||
                           DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_room_ready_ota");
            enqueueRoomReadyForTargets(defTpl, "room_ready_ota", otaEarliest.toISOString(), "q_ota");
            continue;
          }
        }
      } else {
        // 2. Regra para Diretas (Site / WhatsApp): Early Check-in a partir das 10:00 (apenas se for antes das 14:00)
        if (!isAtOrAfterCheckin) {
          const directEarliest = new Date();
          directEarliest.setHours(10, 0, 0, 0);

          if (now < directEarliest) {
            console.log(`[Room Ready Direct] Flat ${flatNumber} limpo antes das 10:00 (${now.toLocaleTimeString("pt-BR")}). Agendando disparo de early check-in para as 10:00 pontualmente.`);
            const defTpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_room_ready_direct") ||
                           DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_room_ready_direct");
            enqueueRoomReadyForTargets(defTpl, "room_ready", directEarliest.toISOString(), "q_direct");
            continue;
          }
        }
      }

      // Se for a partir das 14:00, canais diretos recebem 'room_ready_regular' (sem texto de early check-in)
      let eventName = isOtaChannel ? "room_ready_ota" : "room_ready";
      if (isAtOrAfterCheckin && !isOtaChannel) {
        const hasRegular = (db.whatsappTemplates || []).some(t => t.id === "tpl_room_ready_regular" && t.enabled !== false) ||
                           DEFAULT_WHATSAPP_TEMPLATES.some(t => t.id === "tpl_room_ready_regular");
        if (hasRegular) {
          eventName = "room_ready_regular";
        }
      }

      console.log(`[Room Ready] Disparando '${eventName}' para ${resv.guestName} (Flat ${flatNumber} / Canal: ${resvChannel} / Horário: ${brHour}:${String(brMinute).padStart(2, '0')})...`);
      resv.roomReadySentDate = todayStr;
      resv.roomReadySentAt = now.toISOString();
      if (typeof saveDatabase === "function") saveDatabase();

      await triggerImmediateWhatsApp(db, saveDatabase, eventName, resv, baseUrl);
    }
  } catch (err) {
    console.error("[Room Ready WhatsApp Error]:", err.message);
  }
}

// ── Verificadores Estritos de Entrada e Limpeza em Andamento (13:45) ──────────
/**
 * Verifica se o hóspede da reserva já entrou no flat / marcou check-in como feito
 * ou se já recebeu o aviso de "Quarto Liberado / Pronto" hoje.
 * Obs.: Assinatura antecipada da FNRH (r.checkedInAt / r.fnhrCompleted) sozinha NÃO representa entrada física no flat.
 */
export function hasReservationEnteredOrCompletedCheckin(db, resv, todayStr = "") {
  if (!resv) return false;

  const statusLower = String(resv.status || "").toLowerCase().trim();
  if (
    statusLower === "checkin" ||
    statusLower === "checked_in" ||
    statusLower === "in_house" ||
    statusLower === "hospedado" ||
    statusLower === "checkin_realizado" ||
    statusLower === "completed" ||
    statusLower === "checked_out" ||
    statusLower === "checkout"
  ) {
    return true;
  }

  if (
    resv.guestSelfCheckin === true ||
    Boolean(resv.guestSelfCheckinAt) ||
    Boolean(resv.actualCheckinAt) ||
    resv.checkinDone === true ||
    resv.checkedIn === true ||
    resv.checkoutDone === true ||
    Boolean(resv.actualCheckoutAt)
  ) {
    return true;
  }

  if (Array.isArray(resv.guests) && resv.guests.some(g => g && (g.entryAuthorized === true || Boolean(g.entryAuthorizedAt)))) {
    return true;
  }

  if (todayStr && resv.roomReadySentDate === todayStr) {
    return true;
  }

  const rCode = String(resv.code || resv.reservationCode || "").trim().toUpperCase();
  const rId = resv.id !== undefined && resv.id !== null ? String(resv.id) : "";

  if (db && (rCode || rId)) {
    const matchesRes = (item) => {
      if (!item) return false;
      const iCode = String(item.reservationCode || "").trim().toUpperCase();
      const iId = item.reservationId !== undefined && item.reservationId !== null ? String(item.reservationId) : "";
      return (rCode && iCode === rCode) || (rId && (iId === rId || iCode === rId));
    };

    const sentOrQueuedRoomReadyOrCheckin = (db.whatsappHistory || []).some(h =>
      matchesRes(h) &&
      (h.status === "sent" || h.status === "delivered") &&
      (h.triggerEvent === "checkin_completed" || ROOM_READY_GROUP_EVENTS.has(h.triggerEvent))
    ) || (db.whatsappQueue || []).some(q =>
      matchesRes(q) &&
      (q.status === "scheduled" || q.status === "pending" || q.status === "sent") &&
      (q.triggerEvent === "checkin_completed" || ROOM_READY_GROUP_EVENTS.has(q.triggerEvent))
    );

    if (sentOrQueuedRoomReadyOrCheckin) {
      return true;
    }
  }

  if (db?.smartFlats && typeof db.smartFlats === "object") {
    const flatKey = String(resv.flatNumber || resv.flatId || "");
    const sf = db.smartFlats[flatKey] || Object.values(db.smartFlats).find(s =>
      s && (String(s.flatNumber) === String(resv.flatNumber) || (resv.flatId && Number(s.flatId) === Number(resv.flatId)))
    );
    if (sf?.presence && (sf.presence.enteredAt || sf.presence.isPresent === true)) {
      const sfResId = sf.presence.reservationId ? String(sf.presence.reservationId) : "";
      const sfResCode = String(sf.presence.reservationCode || "").trim().toUpperCase();
      if ((!sfResId && !sfResCode) || (rId && sfResId === rId) || (rCode && sfResCode === rCode)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifica se o flat alocado para a reserva AINDA está sendo limpo (ou pendente de limpeza) hoje.
 * Retorna `false` sempre que o flat já estiver limpo/pronto (seja porque foi limpo hoje, seja porque
 * já estava limpo antes de hoje e não teve check-out/limpeza pendente hoje).
 */
export function isFlatStillBeingCleanedOnCheckinDay(db, resv, todayStr) {
  if (!db || !resv || !todayStr) return false;

  const flatId = resv.flatId !== undefined && resv.flatId !== null ? Number(resv.flatId) : null;
  const rawFlatNum = resv.flatNumber || (flatId && Array.isArray(db.flats) ? db.flats.find(f => Number(f.id) === flatId)?.number : "");
  const flatNumClean = String(rawFlatNum || "").replace(/\D/g, "");
  if (!flatId && !flatNumClean) return false;

  const isSameFlat = (c) => {
    if (!c) return false;
    const cNumClean = String(c.flatNumber || "").replace(/\D/g, "");
    return (flatId && Number(c.flatId) === flatId) || (flatNumClean && cNumClean === flatNumClean);
  };

  const isRegularCleaningRecord = (c) => {
    if (!c) return false;
    if (c.isInstructionOnly || c.isBedAdjustmentOnly) return false;
    if (c.source === "manual_instruction" || c.type === "instruction" || c.type === "bed_adjustment_only") return false;
    return true;
  };

  const flatAllCleanings = (db.cleaningRequests || []).filter(c => isSameFlat(c) && isRegularCleaningRecord(c));
  const flatActiveCleanings = flatAllCleanings.filter(c => !c.isDeleted && c.status !== "deleted");

  // 1. Regra de Ouro da Governança: se existir QUALQUER limpeza concluída hoje para o flat (ou auditoria de conclusão hoje),
  // o flat já está limpo e liberado — nunca enviar alerta de atraso!
  const cleanedToday = flatActiveCleanings.some(c =>
    (c.status === "clean" || c.status === "completed") &&
    (
      c.requestDate === todayStr ||
      c.effectiveDate === todayStr ||
      (c.completedAt && String(c.completedAt).startsWith(todayStr))
    )
  );
  if (cleanedToday) return false;

  const auditCleanToday = (db.auditLogs || []).some(l =>
    (l?.action === "CLEANING_STATUS_CLEAN" || l?.action === "CLEANING_COMPLETED_BY_ADMIN_FOR_MAID") &&
    String(l?.details?.flatNumber || "").replace(/\D/g, "") === flatNumClean &&
    String(l?.timestamp || "").startsWith(todayStr)
  );
  if (auditCleanToday) return false;

  // 2. Verifica se existe solicitação de limpeza ativa hoje ainda pendente ou em andamento
  const pendingStatuses = new Set(["dirty", "will_clean", "cleaning_now", "in_progress", "pending_issue"]);
  const hasTodayPendingOrInProgress = flatActiveCleanings.some(c =>
    (c.requestDate === todayStr || c.effectiveDate === todayStr) &&
    pendingStatuses.has(String(c.status || "").toLowerCase())
  );
  if (hasTodayPendingOrInProgress) return true;

  // 3. Verifica se houve check-out hoje neste flat (turnover no mesmo dia) cujo card não foi excluído nem concluído
  const exactTodayDeleted = flatAllCleanings.some(c => c.requestDate === todayStr && (c.isDeleted || c.status === "deleted"));
  if (!exactTodayDeleted) {
    const hasCheckoutToday = (db.reservations || []).some(r => {
      if (!r || r.id === resv.id || (resv.code && r.code === resv.code)) return false;
      const st = String(r.status || "").toLowerCase();
      if (st === "cancelada" || st === "cancelled" || st === "no_show" || st === "pre_reserva" || st === "pendente" || st === "expirada") {
        return false;
      }
      const rFlatClean = String(r.flatNumber || "").replace(/\D/g, "");
      const sameFlat = (flatId && Number(r.flatId) === flatId) || (flatNumClean && rFlatClean === flatNumClean);
      return sameFlat && r.checkoutDate === todayStr;
    });
    if (hasCheckoutToday) return true;
  }

  // 4. Verifica se há limpeza em andamento agora ("cleaning_now" / "in_progress" / "will_clean") ou pendência de dia anterior ainda não limpa
  const hasUnresolvedPreviousCleaning = flatActiveCleanings.some(c => {
    const st = String(c.status || "").toLowerCase();
    if (!pendingStatuses.has(st)) return false;
    if (st === "cleaning_now" || st === "in_progress" || st === "will_clean") return true;
    if (!c.requestDate || c.requestDate >= todayStr || c.requestDate < "2026-09-01") return false;
    // Verifica se já houve limpeza concluída ou exclusão em data igual ou posterior a esta solicitação antiga
    const resolvedOnOrAfter = flatAllCleanings.some(other => {
      const otherDate = other.effectiveDate || (other.completedAt ? String(other.completedAt).substring(0, 10) : other.requestDate) || "";
      if (otherDate < c.requestDate) return false;
      if (other.status === "clean" || other.status === "completed") return true;
      if ((other.isDeleted || other.status === "deleted") && (!c.createdAt || !other.deletedAt || other.deletedAt >= c.createdAt)) return true;
      return false;
    });
    return !resolvedOnOrAfter;
  });

  if (hasUnresolvedPreviousCleaning) return true;

  // Se não há solicitação pendente hoje, não houve check-out hoje e não há limpeza em aberto, o flat já estava limpo e pronto!
  return false;
}

// ── Alerta Proativo das 13:45: Flat Pendente de Limpeza & Previsão de Chegada ──
export async function checkAndTriggerCleaningDelayAlerts(dbOrGetter, saveDatabase, createNotification, baseUrl = "", nowOverride = null) {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !db.zapiConfig?.enabled) return;

    const delayTpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_checkin_cleaning_delay" || t.triggerEvent === "checkin_cleaning_delay");
    if (delayTpl && delayTpl.enabled === false) return;

    const now = nowOverride instanceof Date ? nowOverride : (nowOverride ? new Date(nowOverride) : new Date());
    const { todayStr, hour: brHour, minute: brMinute } = getBrasiliaDateParts(now);

    const rawAlertTime = (delayTpl?.fixedTime && /^\d{1,2}:\d{2}$/.test(delayTpl.fixedTime) && delayTpl.fixedTime !== "14:00")
      ? delayTpl.fixedTime
      : "13:45";
    const [alertHour, alertMin] = rawAlertTime.split(":").map(Number);
    const isAtOrAfterAlertTime = brHour > alertHour || (brHour === alertHour && brMinute >= alertMin);

    // Só dispara se o horário do alerta (13:45) tiver sido atingido hoje (e antes das 22:00)
    if (!isAtOrAfterAlertTime || brHour >= 22) return;

    // Busca reservas ativas com check-in previsto para hoje que ainda NÃO entraram no flat
    const arrivingToday = (db.reservations || []).filter(r =>
      r &&
      r.status !== "cancelada" &&
      r.status !== "cancelled" &&
      r.status !== "no_show" &&
      r.status !== "checkout" &&
      r.status !== "pre_reserva" &&
      r.status !== "pendente" &&
      r.status !== "expirada" &&
      r.checkinDate === todayStr &&
      r.guestPhone &&
      r.cleaningDelayAlertSentDate !== todayStr &&
      r.roomReadySentDate !== todayStr &&
      !hasReservationEnteredOrCompletedCheckin(db, r, todayStr)
    );

    for (const resv of arrivingToday) {
      const flatNum = String(resv.flatNumber || "");

      // Só envia se o flat alocado AINDA estiver sendo limpo / pendente de limpeza hoje
      if (!isFlatStillBeingCleanedOnCheckinDay(db, resv, todayStr)) {
        continue;
      }

      // Se o hóspede já informou previsão de chegada hoje ou já foi priorizado, não dispara novamente
      if (resv.estimatedArrivalTime && resv.guestArrivalResponseAt?.startsWith(todayStr)) {
        resv.cleaningDelayAlertSentDate = todayStr;
        continue;
      }

      // Trava de Segurança: Modo de Teste / Sandbox
      if (db?.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(resv.guestPhone, db?.zapiConfig)) {
        console.log(`[Cleaning Delay Sandbox] Ignorando disparo para ${resv.guestPhone} (${resv.guestName}): Modo de Teste ativo.`);
        resv.cleaningDelayAlertSentDate = todayStr;
        continue;
      }

      console.log(`[Checkin Cleaning Delay] Flat ${flatNum} ainda em limpeza às ${brHour}:${String(brMinute).padStart(2, "0")}. Disparando aviso de previsão para ${resv.guestName}...`);

      resv.cleaningDelayAlertSentDate = todayStr;
      resv.cleaningDelayAlertSentAt = now.toISOString();
      if (typeof saveDatabase === "function") saveDatabase();

      await triggerImmediateWhatsApp(db, saveDatabase, "checkin_cleaning_delay", resv, baseUrl);

      if (typeof createNotification === "function") {
        createNotification({
          category: "cleaning_alert",
          title: `⚠️ ${rawAlertTime}: Flat ${flatNum} ainda em limpeza`,
          message: `Hóspede ${resv.guestName} (Reserva ${resv.code}) notificado(a) no WhatsApp para envio de previsão de chegada. Flat ${flatNum} ainda pendente de limpeza.`,
          type: "cleaning_governance",
          targetUrl: "/limpeza",
          link: "/limpeza"
        });
      }
    }
  } catch (err) {
    console.error("[Checkin Cleaning Delay Error]:", err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MÓDULO NPS POR NOTA (1 A 5) + RESUMO INTELIGENTE DE MELHORIAS A FAZER (< 5)
// ══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_MANAGER_NPS_ALERT_PHONE = "22998505276";

const NPS_SCORE_TEMPLATE_MAP = {
  5: { id: "tpl_post_checkout_review", triggerEvent: "nps_approved" },
  4: { id: "tpl_nps_score_4", triggerEvent: "nps_score_4" },
  3: { id: "tpl_nps_score_3", triggerEvent: "nps_score_3" },
  2: { id: "tpl_nps_score_2", triggerEvent: "nps_score_2" },
  1: { id: "tpl_nps_score_1", triggerEvent: "nps_score_1" }
};

export function getNpsScoreTemplate(db, score) {
  const numScore = Number(score);
  const spec = NPS_SCORE_TEMPLATE_MAP[numScore];
  if (!spec) return null;
  const fromDb = (db?.whatsappTemplates || []).find(t => t.id === spec.id || t.triggerEvent === spec.triggerEvent);
  if (fromDb) {
    return fromDb.enabled === false ? null : fromDb;
  }
  return DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === spec.id || t.triggerEvent === spec.triggerEvent) || null;
}

export function getNpsThanksTemplate(db) {
  const fromDb = (db?.whatsappTemplates || []).find(
    t => t.id === "tpl_nps_feedback_thanks" || t.triggerEvent === "nps_feedback_thanks"
  );
  if (fromDb) {
    return fromDb.enabled === false ? null : fromDb;
  }
  return DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_nps_feedback_thanks") || null;
}

const IMPROVEMENT_CATEGORY_RULES = [
  {
    key: "conforto_enxoval",
    category: "Conforto & Enxoval",
    title: "Revisar conforto de camas, travesseiros, toalhas e cortinas",
    actionSuggestion: "Inspecionar estado de travesseiros, colchões, roupa de cama/banho e vedação das cortinas nos flats citados.",
    regex: /travesseir|colch[aã]o|cama|len[cç]ol|cobertor|edredom|toalh|enxoval|cortina|blackout|sof[aá]|coberta/i
  },
  {
    key: "ar_climatizacao",
    category: "Ar-Condicionado & Climatização",
    title: "Manutenção e higienização de Ar-Condicionado Split",
    actionSuggestion: "Executar revisão técnica (dreno, gás, limpeza de filtro e controle remoto) nos aparelhos de ar-condicionado.",
    regex: /ar[- ]?condicionado|split|climatiza|pingando|gotejando|gelando|calor|abafado|ventilador|controle do ar/i
  },
  {
    key: "banheiro_hidraulica",
    category: "Banheiro & Hidráulica",
    title: "Reparo hidráulico, chuveiro e acessórios de banheiro",
    actionSuggestion: "Verificar aquecimento/pressão do chuveiro, escoamento de ralo/pia, vazamentos e reposição de tapetes/itens de banheiro.",
    regex: /chuveiro|[aá]gua|aquecedor|pia|ralo|vaso|descarga|vazamento|press[aã]o|tapete|box|ducha|torneira|banheiro/i
  },
  {
    key: "limpeza_governanca",
    category: "Limpeza & Governança",
    title: "Reforço no padrão de limpeza e revisão pós-faxina",
    actionSuggestion: "Reforçar checklist de vistoria de saída/entrada com a equipe de governança (piso, superfícies, odores e reposição).",
    regex: /limpeza|suj[oa]|poeira|cheiro|mofo|cabelo|ch[aã]o|faxina|higien|mancha|odor|lixo|formiga|inseto/i
  },
  {
    key: "tv_wifi_eletronicos",
    category: "TV, Wi-Fi & Eletrônicos",
    title: "Estabilidade de Wi-Fi, Smart TV, iluminação e fechadura",
    actionSuggestion: "Testar sinal de Wi-Fi, login/canais da TV, pilhas de controles, lâmpadas/tomadas e funcionamento da fechadura.",
    regex: /wi-?fi|internet|sinal|tv|televis[aã]o|smart\s*tv|controle|netflix|tomada|l[aâ]mpada|luz|ilumina[cç][aã]o|fechadura|porta|senha|chave/i
  },
  {
    key: "cozinha_eletros",
    category: "Cozinha & Eletrodomésticos",
    title: "Reposição de utensílios de copa e revisão de eletrodomésticos",
    actionSuggestion: "Conferir funcionamento de frigobar/micro-ondas/cafeteira e completar kit de utensílios (pratos, talheres, copos).",
    regex: /frigobar|geladeira|micro-?ondas|cafeteira|fog[aã]o|cooktop|talher|prato|copo|panela|utens[ií]lio|x[ií]cara|ta[cç]a|abridor|sanduicheira|air\s*fryer/i
  },
  {
    key: "barulho_acustica",
    category: "Barulho & Acústica",
    title: "Controle de ruídos e vedação acústica",
    actionSuggestion: "Avaliar vedação de janelas/portas e orientar portaria sobre controle de silêncio nos corredores.",
    regex: /barulh|ru[ií]do|som\b|vizinh|corredor|elevador|janela|ac[uú]stic|obra/i
  },
  {
    key: "atendimento_checkin",
    category: "Atendimento & Check-in",
    title: "Agilidade na liberação de entrada, portaria e comunicação",
    actionSuggestion: "Alinhar fluxo de autorização na portaria e tempo de resposta no check-in.",
    regex: /atendimento|recep[cç][aã]o|portaria|porteiro|check-?in|demora|cadastr|libera[cç][aã]o|hor[aá]rio|espera/i
  },
  {
    key: "cafe_da_manha",
    category: "Café da Manhã",
    title: "Melhoria nos itens e entrega do Café da Manhã",
    actionSuggestion: "Revisar variedade, temperatura e pontualidade na entrega das bandejas de café da manhã.",
    regex: /caf[eé]|bandeja|p[aã]o|fruta|desjejum|leite|suco|bolo/i
  }
];

/**
 * Classifica um texto de feedback (< 5 estrelas) em uma ou mais categorias acionáveis de melhoria.
 */
export function categorizeImprovementFeedback(text = "") {
  const clean = String(text || "").trim();
  if (!clean) return [];
  const matched = IMPROVEMENT_CATEGORY_RULES.filter(rule => rule.regex.test(clean));
  if (matched.length > 0) return matched;
  return [
    {
      key: "outros_geral",
      category: "Estrutura & Outros",
      title: "Avaliar sugestões gerais reportadas pelos hóspedes",
      actionSuggestion: "Analisar relato específico do hóspede e aplicar melhoria pontual na unidade.",
      regex: /.*/
    }
  ];
}

/**
 * Sincroniza um feedback NPS com comentário dentro de db.reviews para manter o histórico unificado.
 */
export function syncNpsCommentToReviews(db, npsItem) {
  if (!db || !npsItem || !npsItem.comment || !String(npsItem.comment).trim()) return null;
  if (!Array.isArray(db.reviews)) db.reviews = [];

  const commentText = String(npsItem.comment).trim();
  const score = Number(npsItem.score) || 4;
  const sentiment = score >= 4 ? "positive" : score === 3 ? "mixed" : "negative";

  let existing = db.reviews.find(r =>
    (npsItem.id && r.fromNpsId === npsItem.id) ||
    (r.channel === "whatsapp" && r.author === (npsItem.guestName || "Hóspede") && r.comment === commentText)
  );

  if (existing) {
    existing.rating = score;
    existing.comment = commentText;
    existing.flatMentioned = npsItem.flatNumber || existing.flatMentioned || null;
    existing.sentiment = sentiment;
    return existing;
  }

  const newId = db.reviews.length > 0 ? Math.max(...db.reviews.map(r => Number(r.id) || 0)) + 1 : 1;
  const newRev = {
    id: newId,
    fromNpsId: npsItem.id || null,
    author: npsItem.guestName || "Hóspede",
    guestPhone: npsItem.guestPhone || null,
    rating: score,
    channel: "whatsapp",
    date: new Date().toISOString().substring(0, 10),
    flatMentioned: npsItem.flatNumber || null,
    comment: commentText,
    sentiment,
    analyzed: false
  };
  db.reviews.unshift(newRev);
  return newRev;
}

/**
 * Reconstrói e atualiza o "Resumo de Melhorias a Fazer (Notas 1 a 4)" a partir de todas as
 * respostas digitadas por hóspedes que avaliaram com nota <= 4.
 * Preserva itens já marcados como "resolved" (concluídos) pelo gestor, reabrindo apenas se
 * surgir um novo comentário posterior à data de resolução.
 */
export async function rebuildNpsImprovementsSummary(db, { aiGenerateFn = null } = {}) {
  if (!db) return null;
  if (!db.npsImprovements) {
    db.npsImprovements = {
      executiveSummary: "",
      lastUpdatedAt: new Date().toISOString(),
      totalFeedbacksAnalyzed: 0,
      pendingCount: 0,
      resolvedCount: 0,
      items: []
    };
  }

  const existingItemsByKey = new Map();
  for (const item of (db.npsImprovements.items || [])) {
    if (item && item.key) {
      existingItemsByKey.set(item.key, item);
    } else if (item && item.id) {
      existingItemsByKey.set(item.id, item);
    }
  }

  // Coleta respostas escritas de notas 1 a 4 em db.npsResponses e db.reviews (sem duplicar)
  const rawFeedbacks = [];
  const seenKeys = new Set();

  for (const n of (db.npsResponses || [])) {
    const score = Number(n?.score);
    const comment = String(n?.comment || "").trim();
    if (!n || isNaN(score) || score < 1 || score > 4 || !comment) continue;
    const dedupKey = `${cleanWhatsAppPhone(n.guestPhone || "") || n.guestName || ""}:${comment.toLowerCase()}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);
    if (n.id) seenKeys.add(`npsid:${n.id}`);

    const flatMatch = comment.match(/(?:apto|apt|flat|quarto|unidade|su[ií]te)\s*[:#º°]?\s*(\d{2,4}[a-z]?)/i);
    rawFeedbacks.push({
      id: n.id || `nps_${Date.now()}`,
      source: "nps_whatsapp",
      guestName: n.guestName || "Hóspede",
      guestPhone: n.guestPhone || null,
      flatNumber: n.flatNumber || (flatMatch ? flatMatch[1] : null),
      score,
      comment,
      date: n.commentReceivedAt || n.respondedAt || n.sentAt || new Date().toISOString()
    });
  }

  for (const r of (db.reviews || [])) {
    const score = Number(r?.rating);
    const comment = String(r?.comment || "").trim();
    if (!r || isNaN(score) || score < 1 || score > 4 || !comment) continue;
    if (r.fromNpsId && seenKeys.has(`npsid:${r.fromNpsId}`)) continue;
    const dedupKey = `${cleanWhatsAppPhone(r.guestPhone || "") || r.author || ""}:${comment.toLowerCase()}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    const flatMatch = comment.match(/(?:apto|apt|flat|quarto|unidade|su[ií]te)\s*[:#º°]?\s*(\d{2,4}[a-z]?)/i);
    rawFeedbacks.push({
      id: `rev_${r.id}`,
      source: r.channel || "review",
      guestName: r.author || "Hóspede",
      guestPhone: r.guestPhone || null,
      flatNumber: r.flatMentioned || (flatMatch ? flatMatch[1] : null),
      score,
      comment,
      date: r.date || r.createdAt || new Date().toISOString()
    });
  }

  // Agrupa os feedbacks por categoria/tópico de melhoria
  const grouped = new Map();
  for (const fb of rawFeedbacks) {
    const cats = categorizeImprovementFeedback(fb.comment);
    for (const cat of cats) {
      if (!grouped.has(cat.key)) {
        grouped.set(cat.key, {
          key: cat.key,
          category: cat.category,
          title: cat.title,
          actionSuggestion: cat.actionSuggestion,
          quotes: [],
          flatsSet: new Set()
        });
      }
      const g = grouped.get(cat.key);
      g.quotes.push(fb);
      if (fb.flatNumber) g.flatsSet.add(String(fb.flatNumber));
    }
  }

  const nextItems = [];
  for (const [key, group] of grouped.entries()) {
    const prev = existingItemsByKey.get(key);
    const quotes = group.quotes.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const scores = quotes.map(q => Number(q.score) || 4);
    const minScore = Math.min(...scores);
    const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
    const flats = Array.from(group.flatsSet);

    // Se o item estava marcado como "resolved", verifica se entrou algum feedback NOVO após resolvedAt
    let status = prev?.status === "resolved" ? "resolved" : "pending";
    let resolvedAt = prev?.resolvedAt || null;
    if (status === "resolved" && resolvedAt) {
      const resolvedTime = new Date(resolvedAt).getTime();
      const hasNewerQuote = quotes.some(q => {
        const qTime = new Date(q.date || 0).getTime();
        return !isNaN(qTime) && qTime > resolvedTime + 1000;
      });
      if (hasNewerQuote) {
        status = "pending";
        resolvedAt = null;
      }
    }

    // Constrói resumo conciso baseado nos comentários reais deste grupo
    const sampleSnippets = quotes.slice(0, 3).map(q => {
      const flatTag = q.flatNumber ? ` (Flat ${q.flatNumber})` : "";
      const shortComment = q.comment.length > 90 ? `${q.comment.substring(0, 87)}...` : q.comment;
      return `"${shortComment}" — ${q.guestName}${flatTag} [${q.score}⭐]`;
    });

    const summary = `${quotes.length === 1 ? "1 relato registrado" : `${quotes.length} relatos registrados`}${flats.length > 0 ? ` nos flats ${flats.join(", ")}` : ""}: ${sampleSnippets.join(" | ")}`;

    nextItems.push({
      id: prev?.id || `imp_${key}`,
      key,
      category: group.category,
      title: prev?.customTitle || group.title,
      actionSuggestion: group.actionSuggestion,
      summary,
      flats,
      mentionsCount: quotes.length,
      minScore,
      avgScore,
      status,
      quotes,
      createdAt: prev?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt
    });
  }

  // Ordena: pendentes primeiro, depois por menor nota e maior número de menções
  nextItems.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    if (b.mentionsCount !== a.mentionsCount) return b.mentionsCount - a.mentionsCount;
    return a.minScore - b.minScore;
  });

  const pendingItems = nextItems.filter(i => i.status === "pending");
  const resolvedItems = nextItems.filter(i => i.status === "resolved");

  let executiveSummary = "";
  if (pendingItems.length === 0) {
    executiveSummary = rawFeedbacks.length === 0
      ? "Nenhuma resposta escrita de avaliação abaixo de 5 estrelas registrada até o momento."
      : `Todas as ${resolvedItems.length} frente(s) de melhoria apontadas anteriormente já foram marcadas como resolvidas!`;
  } else {
    const bulletLines = pendingItems.map((it, idx) => {
      const flatStr = it.flats.length > 0 ? ` [Flat(s): ${it.flats.join(", ")}]` : "";
      const latestQuote = it.quotes[0]?.comment
        ? ` — Ex: "${it.quotes[0].comment.substring(0, 80)}${it.quotes[0].comment.length > 80 ? "..." : ""}"`
        : "";
      return `${idx + 1}. ${it.category}: ${it.title}${flatStr} (${it.mentionsCount}x, menor nota: ${it.minScore}⭐)${latestQuote}`;
    });
    executiveSummary = `Resumo de ${pendingItems.length} melhoria(s) prioritária(s) a fazer com base nas respostas de notas 1 a 4:\n` + bulletLines.join("\n");

    if (typeof aiGenerateFn === "function") {
      try {
        const customSummary = await aiGenerateFn(pendingItems, rawFeedbacks);
        if (customSummary && typeof customSummary === "string" && customSummary.trim().length > 15) {
          executiveSummary = customSummary.trim();
        }
      } catch (err) {
        console.warn("[NPS Improvements AI Summary Fallback]:", err.message);
      }
    }
  }

  db.npsImprovements = {
    executiveSummary,
    lastUpdatedAt: new Date().toISOString(),
    totalFeedbacksAnalyzed: rawFeedbacks.length,
    pendingCount: pendingItems.length,
    resolvedCount: resolvedItems.length,
    items: nextItems,
    recentFeedbacks: rawFeedbacks.slice(0, 30)
  };

  return db.npsImprovements;
}

/**
 * Envia o alerta de avaliação abaixo de 5 estrelas para o WhatsApp do Gestor (22998505276),
 * contendo a explicação digitada pelo hóspede + o resumo atualizado de melhorias pendentes.
 */
export async function sendNpsManagerAlertWhatsApp(db, npsItem, { reason = "comment_received", sendZapiFn = sendZapiMessage, saveDatabase } = {}) {
  if (!db || !npsItem) return { sent: false, reason: "missing_data" };
  const score = Number(npsItem.score);
  if (isNaN(score) || score >= 5) return { sent: false, reason: "not_below_5" };

  const managerPhone = cleanWhatsAppPhone(
    db?.zapiConfig?.npsManagerAlertPhone || DEFAULT_MANAGER_NPS_ALERT_PHONE
  ) || DEFAULT_MANAGER_NPS_ALERT_PHONE;

  // Garante que o resumo de melhorias está atualizado antes de montar a mensagem
  const improvements = await rebuildNpsImprovementsSummary(db);
  const pendingItems = (improvements?.items || []).filter(i => i.status === "pending");

  const starsStr = "⭐".repeat(Math.max(1, Math.min(4, score)));
  const flatLabel = npsItem.flatNumber ? `Flat ${npsItem.flatNumber}` : "Flat não identificado";
  const guestLabel = npsItem.guestName || "Hóspede";
  const phoneLabel = npsItem.guestPhone || "N/A";
  const commentText = String(npsItem.comment || "").trim();

  let msg = `🚨 *Alerta de Avaliação Abaixo de 5 (${score}/5 ${starsStr})*\n\n`;
  msg += `👤 *Hóspede:* ${guestLabel} (${phoneLabel})\n`;
  msg += `🏢 *Unidade:* ${flatLabel}\n`;
  msg += `⭐ *Nota atribuída:* ${score} de 5\n\n`;

  if (commentText) {
    msg += `💬 *O que melhorar (resposta do hóspede):*\n"${commentText}"\n\n`;
  } else {
    msg += `ℹ️ _O hóspede enviou apenas a nota ${score} há 15 minutos e ainda não digitou explicação detalhada._\n\n`;
  }

  msg += `📋 *Resumo Atualizado de Melhorias a Fazer (${pendingItems.length} pendente${pendingItems.length === 1 ? "" : "s"}):*\n`;
  if (pendingItems.length === 0) {
    msg += `_Nenhuma melhoria com comentário pendente no momento._\n`;
  } else {
    pendingItems.slice(0, 5).forEach((item, idx) => {
      const fStr = item.flats?.length ? ` [Flat ${item.flats.join(", ")}]` : "";
      const latest = item.quotes?.[0]?.comment ? ` — "${item.quotes[0].comment.substring(0, 65)}${item.quotes[0].comment.length > 65 ? "..." : ""}"` : "";
      msg += `${idx + 1}. *${item.category}:* ${item.title}${fStr} (${item.mentionsCount}x)${latest}\n`;
    });
  }
  msg += `\n🔗 _Gerencie e conclua itens em: corpflats.onrender.com/avaliacoes-ia_`;

  const sendRes = await sendZapiFn(db.zapiConfig, {
    phone: managerPhone,
    message: msg,
    channelId: "internal_alerts",
    recipientRole: "manager",
    triggerEvent: "nps_manager_improvement_alert",
    bypassTestMode: true,
    db
  });

  npsItem.managerAlertSent = true;
  npsItem.managerAlertSentAt = new Date().toISOString();
  npsItem.managerAlertReason = reason;
  if (commentText) {
    npsItem.managerCommentAlertSent = true;
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return { sent: Boolean(sendRes?.success), managerPhone, message: msg, sendRes };
}

function hasValidGuestLetters(name) {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.toLowerCase() === "hóspede" || trimmed.toLowerCase() === "hospede") return false;
  return /[a-zA-ZÀ-ÿ]{2,}/.test(trimmed);
}

export function resolveBestNpsGuestName(senderName, existingName, reservationName) {
  if (hasValidGuestLetters(reservationName)) return reservationName.trim();
  if (hasValidGuestLetters(existingName)) return existingName.trim();
  if (hasValidGuestLetters(senderName)) return senderName.trim();
  return reservationName || existingName || senderName || "Hóspede";
}

/**
 * Registra em db.npsResponses que a pesquisa de satisfação NPS pós-checkout foi enviada ao hóspede.
 */
export function registerNpsSurveySent(db, {
  phone,
  guestName,
  reservationId = null,
  reservationCode = null,
  flatNumber = null,
  channel = "whatsapp",
  sentAt = null
} = {}) {
  if (!db || !phone) return null;
  if (!Array.isArray(db.npsResponses)) db.npsResponses = [];

  const targetPhone = cleanWhatsAppPhone(phone) || String(phone).replace(/\D/g, "");
  if (!targetPhone || targetPhone.length < 8) return null;

  const matchPhone = (p) => {
    const cP = cleanWhatsAppPhone(p || "") || String(p || "").replace(/\D/g, "");
    return Boolean(cP && cP.length >= 8 && (cP.endsWith(targetPhone.slice(-8)) || targetPhone.endsWith(cP.slice(-8))));
  };

  let existing = db.npsResponses.find(n =>
    (reservationCode && n.reservationCode && String(n.reservationCode) === String(reservationCode)) ||
    (reservationId && n.reservationId && String(n.reservationId) === String(reservationId)) ||
    matchPhone(n.guestPhone)
  );

  const sentIso = sentAt || new Date().toISOString();
  if (existing) {
    existing.surveyVerifiedSent = true;
    existing.sentAt = sentIso;
    if (existing.score == null) {
      existing.pendingResponse = true;
    }
    if (guestName && hasValidGuestLetters(guestName)) {
      existing.guestName = guestName.trim();
    }
    if (flatNumber && !existing.flatNumber) existing.flatNumber = flatNumber;
    if (reservationId && !existing.reservationId) existing.reservationId = reservationId;
    if (reservationCode && !existing.reservationCode) existing.reservationCode = reservationCode;
    return existing;
  }

  const entry = {
    id: `nps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    reservationId: reservationId || null,
    reservationCode: reservationCode || null,
    guestPhone: targetPhone,
    guestName: hasValidGuestLetters(guestName) ? guestName.trim() : "Hóspede",
    flatNumber: flatNumber || null,
    channel: channel || "whatsapp",
    score: null,
    comment: null,
    sentAt: sentIso,
    respondedAt: null,
    googleLinkSent: false,
    autoAction: null,
    pendingResponse: true,
    surveyVerifiedSent: true
  };
  db.npsResponses.unshift(entry);
  return entry;
}

/**
 * Verifica estritamente se a pesquisa de satisfação NPS pós-checkout
 * (triggerEvent: "post_checkout_review" / templateId: "tpl_nps_satisfaction_check")
 * foi de fato enviada para o telefone informado.
 * Impede que qualquer número de 1 a 5 enviado em conversas normais seja tratado como nota NPS.
 */
export function getLatestNpsSurveySentInfo(db, phone, { ignoreNpsResponsesTable = false } = {}) {
  if (!db || !phone) return { sent: false, sentAt: null, sentAtMs: 0, reservationCode: null, reservationId: null };
  const targetPhone = cleanWhatsAppPhone(phone) || String(phone).replace(/\D/g, "");
  if (!targetPhone || targetPhone.length < 8) {
    return { sent: false, sentAt: null, sentAtMs: 0, reservationCode: null, reservationId: null };
  }

  const matchPhone = (p) => {
    const cP = cleanWhatsAppPhone(p || "") || String(p || "").replace(/\D/g, "");
    return Boolean(cP && cP.length >= 8 && (cP.endsWith(targetPhone.slice(-8)) || targetPhone.endsWith(cP.slice(-8))));
  };

  const isNpsSurveyText = (txt) => {
    if (!txt || typeof txt !== "string") return false;
    return /de\s*1\s*a\s*5,\s*que\s*nota\s*voc[eê]\s*daria/i.test(txt) ||
           /responda\s*apenas\s*com\s*o\s*n[uú]mero\s*de\s*1\s*a\s*5/i.test(txt);
  };

  let latestSentAtMs = 0;
  let latestSentAtIso = null;
  let reservationCode = null;
  let reservationId = null;
  let found = false;

  const recordHit = (dateStr, resCode, resId) => {
    found = true;
    const ms = dateStr ? new Date(dateStr).getTime() : 0;
    if (!isNaN(ms) && ms >= latestSentAtMs) {
      latestSentAtMs = ms;
      latestSentAtIso = dateStr || latestSentAtIso;
      if (resCode) reservationCode = resCode;
      if (resId) reservationId = resId;
    } else if (!latestSentAtIso && dateStr) {
      latestSentAtIso = dateStr;
    }
  };

  // 1. Verifica no histórico de envios WhatsApp (db.whatsappHistory)
  for (const h of (db.whatsappHistory || [])) {
    if (!h || h.status === "failed") continue;
    if (!matchPhone(h.guestPhone || h.phone || h.recipientPhone)) continue;
    if (
      h.triggerEvent === "post_checkout_review" ||
      h.templateId === "tpl_nps_satisfaction_check" ||
      isNpsSurveyText(h.message)
    ) {
      recordHit(h.sentAt || h.createdAt, h.reservationCode, h.reservationId);
    }
  }

  // 2. Verifica no histórico de disparos (db.whatsappDispatchHistory)
  for (const d of (db.whatsappDispatchHistory || [])) {
    if (!d || d.status === "failed") continue;
    if (!matchPhone(d.guestPhone || d.recipientPhone || d.phone)) continue;
    if (
      d.triggerEvent === "post_checkout_review" ||
      d.templateId === "tpl_nps_satisfaction_check" ||
      isNpsSurveyText(d.messageText || d.message)
    ) {
      recordHit(d.sentAt || d.scheduledAt, d.reservationCode, d.reservationId);
    }
  }

  // 3. Verifica na fila de WhatsApp itens efetivamente enviados (db.whatsappQueue)
  for (const q of (db.whatsappQueue || [])) {
    if (!q || q.status !== "sent") continue;
    if (!matchPhone(q.guestPhone || q.phone)) continue;
    if (
      q.triggerEvent === "post_checkout_review" ||
      q.templateId === "tpl_nps_satisfaction_check" ||
      isNpsSurveyText(q.renderedMessage || q.message)
    ) {
      recordHit(q.sentAt || q.scheduledFor, q.reservationCode, q.reservationId);
    }
  }

  // 4. Verifica nas conversas do WhatsApp mensagens enviadas pelo hotel (fromMe: true)
  for (const conv of (db.whatsappConversations || [])) {
    if (!conv || conv.isGroup) continue;
    if (!matchPhone(conv.phone || conv.id)) continue;
    for (const m of (conv.messages || [])) {
      if (!m || !m.fromMe || m.status === "failed") continue;
      if (
        m.triggerEvent === "post_checkout_review" ||
        m.templateId === "tpl_nps_satisfaction_check" ||
        isNpsSurveyText(m.text || m.caption)
      ) {
        recordHit(m.timestamp, conv.reservationCode || m.reservationCode, conv.reservationId);
      }
    }
  }

  // 5. Verifica registros explícitos de pesquisa enviada em db.npsResponses
  if (!ignoreNpsResponsesTable) {
    for (const n of (db.npsResponses || [])) {
      if (!n || !matchPhone(n.guestPhone)) continue;
      if (n.pendingResponse === true || n.surveyVerifiedSent === true) {
        recordHit(n.sentAt, n.reservationCode, n.reservationId);
      }
    }
  }

  return {
    sent: found,
    sentAt: latestSentAtIso,
    sentAtMs: latestSentAtMs,
    reservationCode,
    reservationId
  };
}

export function wasNpsSurveySentToPhone(db, phone, options = {}) {
  return getLatestNpsSurveySentInfo(db, phone, options).sent;
}

/**
 * Intercepta e processa respostas de NPS (nota 1 a 5) e também a resposta escrita subsequente
 * de hóspedes que deram nota de 1 a 4.
 * ESTRITO: Só aceita números de 1 a 5 como nota se a pergunta de avaliação (post_checkout_review)
 * tiver sido efetivamente enviada para aquele telefone e ainda não tiver sido respondida.
 */
export async function handleInboundNpsScoreOrComment({
  db,
  phone,
  rawPhone,
  senderName,
  cleanText,
  reservation,
  flatNumber,
  saveDatabase,
  createNotification,
  sendZapiFn = sendZapiMessage
}) {
  if (!db || !cleanText || !phone) return { npsHandled: false };
  if (!Array.isArray(db.npsResponses)) db.npsResponses = [];

  const targetPhone = cleanWhatsAppPhone(phone) || phone;
  const matchPhone = (p) => {
    const cP = cleanWhatsAppPhone(p || "");
    return Boolean(cP && targetPhone && (cP.endsWith(targetPhone.slice(-8)) || targetPhone.endsWith(cP.slice(-8))));
  };

  // Verifica estritamente se a pesquisa NPS foi enviada para este telefone
  const surveyInfo = getLatestNpsSurveySentInfo(db, targetPhone);
  let existingNps = db.npsResponses.find(n => matchPhone(n.guestPhone));

  // Se não enviamos a pergunta de avaliação para essa pessoa, NUNCA interpreta números de 1 a 5 como nota NPS
  if (!surveyInfo.sent) {
    return { npsHandled: false };
  }

  // Resolve a reserva associada à pesquisa para garantir nome e flat corretos
  let matchedReservation = reservation || null;
  if (!matchedReservation && Array.isArray(db.reservations)) {
    matchedReservation = db.reservations.find(r =>
      (surveyInfo.reservationCode && String(r.code) === String(surveyInfo.reservationCode)) ||
      (surveyInfo.reservationId && String(r.id) === String(surveyInfo.reservationId)) ||
      (existingNps?.reservationCode && String(r.code) === String(existingNps.reservationCode)) ||
      (existingNps?.reservationId && String(r.id) === String(existingNps.reservationId))
    ) || db.reservations.find(r => matchPhone(r.guestPhone || r.phone));
  }

  // 1. Verifica se a mensagem é uma nota de 1 a 5 (isolada ou com comentário na mesma linha, ex: "4" ou "4 - faltou tapete")
  const pureScoreMatch = cleanText.match(/^([1-5])$/) || cleanText.match(/^nota\s*([1-5])$/i) || cleanText.match(/^([1-5])\s*estrelas?$/i);
  const inlineScoreMatch = !pureScoreMatch
    ? cleanText.match(/^(?:nota\s*)?([1-5])(?:\s*estrelas?)?\s*[-–:,.]\s*(.{3,})$/i)
    : null;

  const isTimeExpression = /^\d{1,2}:\d{2}\b/.test(cleanText);

  // Evita sobrescrever uma avaliação que já foi respondida anteriormente caso o hóspede mande outro número depois
  const alreadyAnsweredCurrentSurvey = Boolean(
    existingNps &&
    existingNps.score != null &&
    existingNps.pendingResponse !== true &&
    (!surveyInfo.sentAtMs || !existingNps.respondedAt || new Date(existingNps.respondedAt).getTime() >= surveyInfo.sentAtMs)
  );

  if (!alreadyAnsweredCurrentSurvey && (pureScoreMatch || (inlineScoreMatch && !isTimeExpression))) {
    const score = Number((pureScoreMatch || inlineScoreMatch)[1]);
    const inlineComment = inlineScoreMatch ? String(inlineScoreMatch[2] || "").trim() : "";
    const resolvedGuestName = resolveBestNpsGuestName(senderName, existingNps?.guestName, matchedReservation?.guestName);
    const resolvedFlat = flatNumber || existingNps?.flatNumber || matchedReservation?.flatNumber || null;

    if (!existingNps) {
      existingNps = {
        id: `nps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reservationId: matchedReservation?.id || surveyInfo.reservationId || matchedReservation?.code || null,
        reservationCode: matchedReservation?.code || surveyInfo.reservationCode || null,
        guestPhone: rawPhone || targetPhone,
        guestName: resolvedGuestName,
        sentAt: surveyInfo.sentAt || new Date().toISOString(),
        surveyVerifiedSent: true
      };
      db.npsResponses.unshift(existingNps);
    }

    existingNps.score = score;
    existingNps.respondedAt = new Date().toISOString();
    existingNps.pendingResponse = false;
    existingNps.surveyVerifiedSent = true;
    existingNps.flatNumber = resolvedFlat;
    existingNps.guestName = resolvedGuestName;
    existingNps.channel = matchedReservation?.channel || existingNps.channel || "whatsapp";

    const reservationForTags = matchedReservation || {
      guestName: existingNps.guestName,
      guestPhone: rawPhone || targetPhone,
      flatNumber: existingNps.flatNumber || "",
      code: existingNps.reservationCode || existingNps.reservationId || ""
    };

    const tpl = getNpsScoreTemplate(db, score);
    let renderedReply = "";
    let renderedButtons = [];

    if (tpl) {
      renderedReply = resolveWhatsAppTags(tpl.message, reservationForTags, db, "", "guest", tpl);
      renderedButtons = renderTemplateButtons(tpl.buttons, reservationForTags, db, "", "guest", tpl);
      // Para nota 5, garante que o link do Google conste na mensagem caso o usuário não tenha suporte a botões URL ou o template não inclua a tag no corpo
      if (score === 5) {
        const googleLink = db.zapiConfig?.googleReviewUrl || "https://share.google/LHu3541d5lhkdvbL2";
        if (!renderedReply.includes(googleLink) && !renderedReply.includes("http")) {
          renderedReply = `${renderedReply}\n\n${googleLink}`;
        }
      }
    }

    if (score === 5) {
      existingNps.autoAction = "google_link_sent";
      existingNps.googleLinkSent = true;
      existingNps.awaitingFeedbackComment = false;
    } else {
      existingNps.googleLinkSent = false;
      if (score <= 2) {
        existingNps.autoAction = "recovery_ticket_created";
        if (!db.observations) db.observations = [];
        const obsId = db.observations.length > 0 ? Math.max(...db.observations.map(o => o.id || 0)) + 1 : 1;
        db.observations.push({
          id: obsId,
          flatNumber: existingNps.flatNumber || "N/A",
          guestPhone: rawPhone || targetPhone,
          type: "reclamacao",
          description: `[NPS Auto-Ticket] Hóspede ${existingNps.guestName} deu nota ${score}/5 pós-checkout.${inlineComment ? ` Relato: "${inlineComment}"` : " Aguardando detalhes do hóspede."}`,
          severity: score === 1 ? "alta" : "media",
          status: "pendente",
          createdAt: new Date().toISOString(),
          generatedFromNps: true
        });
      } else {
        existingNps.autoAction = "feedback_collected";
      }

      if (inlineComment) {
        existingNps.comment = inlineComment;
        existingNps.commentReceivedAt = new Date().toISOString();
        existingNps.awaitingFeedbackComment = false;
        syncNpsCommentToReviews(db, existingNps);
      } else {
        existingNps.awaitingFeedbackComment = true;
        existingNps.awaitingFeedbackSince = new Date().toISOString();
        existingNps.managerAlertSent = false;
        existingNps.managerCommentAlertSent = false;
      }
    }

    // Dispara a mensagem configurada para a respectiva nota (1 a 5)
    if (renderedReply) {
      const triggerEv = tpl?.triggerEvent || (score === 5 ? "nps_approved" : `nps_score_${score}`);
      const sendRes = await sendZapiFn(db.zapiConfig, {
        phone: rawPhone || targetPhone,
        message: renderedReply,
        title: tpl?.title,
        footer: tpl?.footer,
        buttons: renderedButtons,
        channelId: "guest_schedule",
        recipientRole: "guest",
        triggerEvent: triggerEv,
        db
      }).catch(err => {
        console.warn(`[NPS Auto-Reply Score ${score}] Falha no envio:`, err.message);
        return { success: false, error: err.message };
      });

      const sentAtIso = new Date().toISOString();
      existingNps.scoreFollowupSent = Boolean(sendRes?.success);
      existingNps.scoreFollowupSentAt = sentAtIso;

      if (!db.whatsappHistory) db.whatsappHistory = [];
      db.whatsappHistory.push({
        id: `nps_reply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reservationCode: reservationForTags.code || null,
        reservationId: matchedReservation?.id || null,
        title: tpl?.title || `Retorno NPS Nota ${score}`,
        guestName: existingNps.guestName,
        guestPhone: rawPhone || targetPhone,
        recipientType: "guest",
        recipientName: existingNps.guestName,
        triggerEvent: triggerEv,
        message: renderedReply,
        buttons: renderedButtons,
        status: sendRes?.success ? "sent" : "failed",
        method: sendRes?.method || "automated",
        error: sendRes?.error || null,
        sentAt: sentAtIso
      });

      appendMessageToConversation(db, {
        phone: targetPhone,
        senderName: "CorpFlats",
        senderPhone: db?.zapiConfig?.instanceId || "",
        fromMe: true,
        text: renderedReply,
        type: "text",
        buttons: renderedButtons,
        triggerEvent: triggerEv,
        reservationCode: reservationForTags.code || null,
        status: sendRes?.success ? "read" : "failed",
        timestamp: sentAtIso,
        messageId: sendRes?.messageId || `msg_nps_${Date.now()}`
      });
    }

    // Se já veio com comentário na mesma mensagem (nota 1 a 4), atualiza o resumo de melhorias e alerta o gestor imediatamente
    if (score <= 4 && inlineComment) {
      await rebuildNpsImprovementsSummary(db);
      await sendNpsManagerAlertWhatsApp(db, existingNps, {
        reason: "inline_comment_with_score",
        sendZapiFn,
        saveDatabase
      });
    }

    if (typeof saveDatabase === "function") saveDatabase();
    return {
      npsHandled: true,
      action: "score_received",
      score,
      awaitingFeedbackComment: Boolean(existingNps.awaitingFeedbackComment),
      npsItem: existingNps
    };
  }

  // 2. Verifica se o hóspede deu nota de 1 a 4 recentemente (awaitingFeedbackComment === true) e agora está digitando a explicação
  if (
    existingNps &&
    Number(existingNps.score) >= 1 &&
    Number(existingNps.score) <= 4 &&
    existingNps.awaitingFeedbackComment === true &&
    !pureScoreMatch
  ) {
    const sinceMs = existingNps.awaitingFeedbackSince ? new Date(existingNps.awaitingFeedbackSince).getTime() : Date.now();
    const ageHours = (Date.now() - sinceMs) / (3600 * 1000);

    // Janela de 48h após a nota para capturar a resposta escrita do hóspede
    if (ageHours <= 48) {
      existingNps.comment = existingNps.comment
        ? `${existingNps.comment} | ${cleanText}`
        : cleanText;
      existingNps.commentReceivedAt = new Date().toISOString();
      existingNps.awaitingFeedbackComment = false;
      existingNps.guestName = resolveBestNpsGuestName(senderName, existingNps.guestName, matchedReservation?.guestName);
      if (flatNumber && !existingNps.flatNumber) existingNps.flatNumber = flatNumber;
      if (matchedReservation?.flatNumber && !existingNps.flatNumber) existingNps.flatNumber = matchedReservation.flatNumber;

      // Atualiza observação/ticket se já havia sido criado para nota 1-2
      if (Array.isArray(db.observations)) {
        const relatedObs = db.observations.find(
          o => o.generatedFromNps && matchPhone(o.guestPhone) && o.status === "pendente"
        );
        if (relatedObs && !relatedObs.description.includes(cleanText.substring(0, 40))) {
          relatedObs.description = `[NPS Auto-Ticket] Hóspede ${existingNps.guestName} (Nota ${existingNps.score}/5): "${existingNps.comment}"`;
        }
      }

      // Sincroniza em db.reviews para constar também na aba de Feedbacks
      syncNpsCommentToReviews(db, existingNps);

      // Envia template de agradecimento pós-comentário (tpl_nps_feedback_thanks)
      const thanksTpl = getNpsThanksTemplate(db);
      if (thanksTpl) {
        const reservationForTags = matchedReservation || {
          guestName: existingNps.guestName,
          guestPhone: rawPhone || targetPhone,
          flatNumber: existingNps.flatNumber || "",
          code: existingNps.reservationCode || existingNps.reservationId || ""
        };
        const thanksMsg = resolveWhatsAppTags(thanksTpl.message, reservationForTags, db, "", "guest", thanksTpl);
        const thanksButtons = renderTemplateButtons(thanksTpl.buttons, reservationForTags, db, "", "guest", thanksTpl);

        const sendThanksRes = await sendZapiFn(db.zapiConfig, {
          phone: rawPhone || targetPhone,
          message: thanksMsg,
          title: thanksTpl.title,
          footer: thanksTpl.footer,
          buttons: thanksButtons,
          channelId: "guest_schedule",
          recipientRole: "guest",
          triggerEvent: "nps_feedback_thanks",
          db
        }).catch(err => {
          console.warn("[NPS Feedback Thanks] Falha no envio:", err.message);
          return { success: false, error: err.message };
        });

        const sentAtIso = new Date().toISOString();
        if (!db.whatsappHistory) db.whatsappHistory = [];
        db.whatsappHistory.push({
          id: `nps_thanks_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reservationCode: reservationForTags.code || null,
          reservationId: matchedReservation?.id || null,
          title: thanksTpl.title,
          guestName: existingNps.guestName,
          guestPhone: rawPhone || targetPhone,
          recipientType: "guest",
          recipientName: existingNps.guestName,
          triggerEvent: "nps_feedback_thanks",
          message: thanksMsg,
          buttons: thanksButtons,
          status: sendThanksRes?.success ? "sent" : "failed",
          method: sendThanksRes?.method || "automated",
          error: sendThanksRes?.error || null,
          sentAt: sentAtIso
        });

        appendMessageToConversation(db, {
          phone: targetPhone,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: thanksMsg,
          type: "text",
          buttons: thanksButtons,
          triggerEvent: "nps_feedback_thanks",
          reservationCode: reservationForTags.code || null,
          status: sendThanksRes?.success ? "read" : "failed",
          timestamp: sentAtIso,
          messageId: sendThanksRes?.messageId || `msg_nps_thanks_${Date.now()}`
        });
      }

      // Atualiza o Resumo de Melhorias a Fazer e dispara o alerta no WhatsApp 22998505276
      const improvements = await rebuildNpsImprovementsSummary(db);
      await sendNpsManagerAlertWhatsApp(db, existingNps, {
        reason: "comment_received",
        sendZapiFn,
        saveDatabase
      });

      if (typeof createNotification === "function") {
        createNotification({
          category: "whatsapp",
          title: `📋 Nova Melhoria Registrada (Nota ${existingNps.score}/5 • ${existingNps.guestName})`,
          message: `"${cleanText.substring(0, 120)}" — Resumo de melhorias atualizado (${improvements?.pendingCount || 0} pendentes).`,
          type: "nps_improvement_feedback",
          targetUrl: "/avaliacoes-ia",
          link: "/avaliacoes-ia"
        });
      }

      if (typeof saveDatabase === "function") saveDatabase();
      return {
        npsHandled: true,
        action: "feedback_comment_received",
        score: existingNps.score,
        comment: existingNps.comment,
        npsItem: existingNps,
        improvements
      };
    }
  }

  return { npsHandled: false };
}

/**
 * Higieniza falsos positivos de NPS (números de 1 a 5 de conversas onde a pesquisa nunca foi enviada)
 * e dispara retroativamente a mensagem de acompanhamento APENAS para os hóspedes que avaliaram HOJE
 * com nota abaixo de 5 (1 a 4) e ainda não receberam o retorno automático.
 */
export async function sanitizeAndDispatchTodaySub5Nps(dbOrGetter, saveDatabase, {
  sendZapiFn = sendZapiMessage,
  onlyDateStr = null,
  dispatchTodayFollowups = true
} = {}) {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db) return { removedBogusCount: 0, dispatchedCount: 0, dispatched: [] };
    if (!Array.isArray(db.npsResponses)) db.npsResponses = [];

    const { todayStr } = getBrasiliaDateParts(new Date());
    const targetDateStr = onlyDateStr || todayStr;

    const removedPhones = new Set();
    const removedIds = new Set();
    const removedNames = new Set();
    const validNps = [];
    let modified = false;

    for (const n of db.npsResponses) {
      if (!n) continue;
      const surveyInfo = getLatestNpsSurveySentInfo(db, n.guestPhone, { ignoreNpsResponsesTable: true });
      const isLegit = Boolean(surveyInfo.sent || n.manualEntry === true || n.surveyVerifiedSent === true || n.pendingResponse === true);

      if (!isLegit) {
        if (n.guestPhone) removedPhones.add(cleanWhatsAppPhone(n.guestPhone) || String(n.guestPhone).replace(/\D/g, ""));
        if (n.id) removedIds.add(n.id);
        if (n.guestName && hasValidGuestLetters(n.guestName)) removedNames.add(n.guestName.trim());
        modified = true;
        continue;
      }

      if (surveyInfo.sent && !n.surveyVerifiedSent) {
        n.surveyVerifiedSent = true;
        modified = true;
      }

      // Enriquece nome e flat a partir da reserva oficial caso esteja como "??" ou vazio
      const cPhone = cleanWhatsAppPhone(n.guestPhone || "") || String(n.guestPhone || "").replace(/\D/g, "");
      const resv = (db.reservations || []).find(r =>
        (n.reservationCode && String(r.code) === String(n.reservationCode)) ||
        (n.reservationId && String(r.id) === String(n.reservationId)) ||
        (surveyInfo.reservationCode && String(r.code) === String(surveyInfo.reservationCode)) ||
        (surveyInfo.reservationId && String(r.id) === String(surveyInfo.reservationId))
      ) || (db.reservations || []).find(r => {
        const rP = cleanWhatsAppPhone(r.guestPhone || r.phone || "") || String(r.guestPhone || r.phone || "").replace(/\D/g, "");
        return Boolean(rP && cPhone && rP.length >= 8 && (rP.endsWith(cPhone.slice(-8)) || cPhone.endsWith(rP.slice(-8))));
      });

      if (resv) {
        const bestName = resolveBestNpsGuestName(n.guestName, null, resv.guestName);
        if (bestName && bestName !== n.guestName) {
          n.guestName = bestName;
          modified = true;
        }
        if (!n.flatNumber && resv.flatNumber) {
          n.flatNumber = resv.flatNumber;
          modified = true;
        }
        if (!n.reservationCode && resv.code) {
          n.reservationCode = resv.code;
          modified = true;
        }
        if (!n.reservationId && resv.id) {
          n.reservationId = resv.id;
          modified = true;
        }
      }

      validNps.push(n);
    }

    const removedBogusCount = db.npsResponses.length - validNps.length;
    if (removedBogusCount > 0) {
      db.npsResponses = validNps;
      // Remove também auto-tickets em db.observations e db.reviews criados por falsos positivos de NPS
      if (Array.isArray(db.observations)) {
        db.observations = db.observations.filter(o => {
          if (!o) return false;
          const isNpsTicket = o.generatedFromNps || String(o.description || "").startsWith("[NPS Auto-Ticket]");
          if (!isNpsTicket) return true;
          const oPhone = cleanWhatsAppPhone(o.guestPhone || "") || String(o.guestPhone || "").replace(/\D/g, "");
          const phoneRemoved = oPhone && Array.from(removedPhones).some(rp => rp.length >= 8 && (oPhone.endsWith(rp.slice(-8)) || rp.endsWith(oPhone.slice(-8))));
          const nameRemoved = Array.from(removedNames).some(rn => String(o.description || "").includes(rn));
          return !(phoneRemoved || nameRemoved);
        });
      }
      if (Array.isArray(db.reviews)) {
        db.reviews = db.reviews.filter(r => !(r && r.fromNpsId && removedIds.has(r.fromNpsId)));
      }
    }

    const dispatched = [];
    if (dispatchTodayFollowups) {
      for (const npsItem of db.npsResponses) {
        if (!npsItem) continue;
        const score = Number(npsItem.score);
        if (isNaN(score) || score < 1 || score > 4) continue;

        const refIso = npsItem.respondedAt || npsItem.sentAt;
        if (!refIso) continue;
        const itemDateStr = getBrasiliaDateParts(new Date(refIso)).todayStr;
        if (itemDateStr !== targetDateStr) continue;

        const targetPhone = cleanWhatsAppPhone(npsItem.guestPhone || "") || npsItem.guestPhone;
        if (!targetPhone) continue;

        const triggerEv = `nps_score_${score}`;
        const alreadySentInHistory = (db.whatsappHistory || []).some(h => {
          if (!h || h.status === "failed") return false;
          const hP = cleanWhatsAppPhone(h.guestPhone || h.phone || "");
          const samePhone = Boolean(hP && targetPhone && (hP.endsWith(targetPhone.slice(-8)) || targetPhone.endsWith(hP.slice(-8))));
          if (!samePhone) return false;
          if (h.triggerEvent !== triggerEv) return false;
          const hDateStr = h.sentAt ? getBrasiliaDateParts(new Date(h.sentAt)).todayStr : "";
          return hDateStr === targetDateStr;
        });

        if (npsItem.scoreFollowupSent || alreadySentInHistory) {
          if (!npsItem.scoreFollowupSent) {
            npsItem.scoreFollowupSent = true;
            modified = true;
          }
          continue;
        }

        const tpl = getNpsScoreTemplate(db, score);
        if (!tpl) continue;

        const reservationForTags = {
          guestName: npsItem.guestName || "Hóspede",
          guestPhone: targetPhone,
          flatNumber: npsItem.flatNumber || "",
          code: npsItem.reservationCode || npsItem.reservationId || ""
        };

        const renderedReply = resolveWhatsAppTags(tpl.message, reservationForTags, db, "", "guest", tpl);
        const renderedButtons = renderTemplateButtons(tpl.buttons, reservationForTags, db, "", "guest", tpl);
        if (!renderedReply) continue;

        const sendRes = await sendZapiFn(db.zapiConfig, {
          phone: targetPhone,
          message: renderedReply,
          title: tpl.title,
          footer: tpl.footer,
          buttons: renderedButtons,
          channelId: "guest_schedule",
          recipientRole: "guest",
          triggerEvent: triggerEv,
          db
        }).catch(err => {
          console.warn(`[NPS Today Retro-Dispatch Score ${score}] Falha no envio para ${targetPhone}:`, err.message);
          return { success: false, error: err.message };
        });

        const sentAtIso = new Date().toISOString();
        npsItem.scoreFollowupSent = Boolean(sendRes?.success);
        npsItem.scoreFollowupSentAt = sentAtIso;
        if (!npsItem.comment) {
          npsItem.awaitingFeedbackComment = true;
          npsItem.awaitingFeedbackSince = sentAtIso;
          npsItem.managerAlertSent = false;
          npsItem.managerCommentAlertSent = false;
        }
        modified = true;

        if (!db.whatsappHistory) db.whatsappHistory = [];
        db.whatsappHistory.push({
          id: `nps_reply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reservationCode: reservationForTags.code || null,
          reservationId: npsItem.reservationId || null,
          title: tpl.title || `Retorno NPS Nota ${score}`,
          guestName: npsItem.guestName,
          guestPhone: targetPhone,
          recipientType: "guest",
          recipientName: npsItem.guestName,
          triggerEvent: triggerEv,
          message: renderedReply,
          buttons: renderedButtons,
          status: sendRes?.success ? "sent" : "failed",
          method: sendRes?.method || "automated_today_retro",
          error: sendRes?.error || null,
          sentAt: sentAtIso
        });

        appendMessageToConversation(db, {
          phone: targetPhone,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: renderedReply,
          type: "text",
          buttons: renderedButtons,
          triggerEvent: triggerEv,
          reservationCode: reservationForTags.code || null,
          status: sendRes?.success ? "read" : "failed",
          timestamp: sentAtIso,
          messageId: sendRes?.messageId || `msg_nps_retro_${Date.now()}`
        });

        dispatched.push({
          id: npsItem.id,
          guestName: npsItem.guestName,
          guestPhone: targetPhone,
          flatNumber: npsItem.flatNumber,
          score,
          sent: Boolean(sendRes?.success),
          message: renderedReply
        });
      }
    }

    if (modified) {
      await rebuildNpsImprovementsSummary(db);
      if (typeof saveDatabase === "function") saveDatabase();
    }

    return {
      removedBogusCount,
      removedPhones: Array.from(removedPhones),
      dispatchedCount: dispatched.length,
      dispatched
    };
  } catch (err) {
    console.warn("[NPS Sanitize & Today Sub-5 Dispatch Error]:", err.message);
    return { removedBogusCount: 0, dispatchedCount: 0, dispatched: [], error: err.message };
  }
}

/**
 * Verifica respostas NPS de notas 1 a 4 que aguardam explicação há mais de 15 minutos
 * e ainda não enviaram o alerta para o WhatsApp do gestor (22998505276).
 */
export async function checkPendingNpsManagerAlerts(dbOrGetter, saveDatabase, createNotification, { nowOverride = null, sendZapiFn = sendZapiMessage } = {}) {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !Array.isArray(db.npsResponses)) return { triggeredCount: 0 };

    const nowMs = nowOverride instanceof Date
      ? nowOverride.getTime()
      : (nowOverride ? new Date(nowOverride).getTime() : Date.now());

    let triggeredCount = 0;
    for (const npsItem of db.npsResponses) {
      if (!npsItem) continue;
      const score = Number(npsItem.score);
      if (isNaN(score) || score < 1 || score > 4) continue;
      if (npsItem.managerAlertSent) continue;
      if (npsItem.awaitingFeedbackComment !== true) continue;
      if (!wasNpsSurveySentToPhone(db, npsItem.guestPhone)) continue;

      const refTime = npsItem.awaitingFeedbackSince || npsItem.scoreFollowupSentAt;
      if (!refTime) continue;
      const elapsedMs = nowMs - new Date(refTime).getTime();
      // Só dispara o fallback de 15 minutos se a pergunta de acompanhamento tiver sido enviada entre 15 min e 12h atrás
      if (elapsedMs >= 15 * 60 * 1000 && elapsedMs <= 12 * 60 * 60 * 1000) {
        await sendNpsManagerAlertWhatsApp(db, npsItem, {
          reason: "timeout_15m_without_comment",
          sendZapiFn,
          saveDatabase
        });
        triggeredCount++;
      }
    }

    return { triggeredCount };
  } catch (err) {
    console.warn("[NPS 15m Manager Alert Check Error]:", err.message);
    return { triggeredCount: 0, error: err.message };
  }
}

/**
 * Função exportada que processa sentimento e NPS de mensagens inbound do WhatsApp.
 */
export async function processInboundNpsAndSentiment({
  db,
  phone,
  senderName,
  text,
  messageId,
  timestamp,
  updatedConv,
  saveDatabase,
  createNotification,
  analyzeSentimentFn,
  sendZapiFn = sendZapiMessage
}) {
  if (!db) return { npsHandled: false };
  const cleanText = (text || "").trim();
  if (!cleanText) return { npsHandled: false };

  // 1. Armazena no histórico de mensagens inbound
  if (!db.whatsappInboundMessages) db.whatsappInboundMessages = [];
  db.whatsappInboundMessages.unshift({
    id: messageId || `in_${Date.now()}`,
    from: phone,
    senderName: senderName || "Hóspede",
    text: cleanText,
    receivedAt: timestamp || new Date().toISOString()
  });
  if (db.whatsappInboundMessages.length > 300) {
    db.whatsappInboundMessages = db.whatsappInboundMessages.slice(0, 300);
  }

  // 2. Busca reserva associada ao telefone e extrai flat/quarto se citado no texto
  const cleanP = cleanWhatsAppPhone(phone) || phone;
  const reservation = (db.reservations || []).find(r => {
    const rP = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
    return rP && (cleanP.endsWith(rP.slice(-8)) || rP.endsWith(cleanP.slice(-8)));
  }) || (db.reservations || []).find(r => (Array.isArray(r.guests) ? r.guests.slice(1) : []).some(g => {
    const gP = cleanWhatsAppPhone(g?.phone || "");
    return gP && (cleanP.endsWith(gP.slice(-8)) || gP.endsWith(cleanP.slice(-8)));
  }));
  const flatMatch = cleanText.match(/(?:apto|apt|flat|quarto|unidade|su[ií]te)\s*[:#º°]?\s*(\d{2,4}[a-z]?)/i);
  const flatNumber = reservation?.flatNumber || reservation?.flat || updatedConv?.flatNumber || (flatMatch ? flatMatch[1] : null);

  // 3. Processamento Estruturado de NPS (Notas 1 a 5 + Coleta de Resposta Digitada + Resumo de Melhorias + Alerta 22998505276)
  const npsFlowResult = await handleInboundNpsScoreOrComment({
    db,
    phone: cleanP,
    rawPhone: phone,
    senderName: senderName || reservation?.guestName || "Hóspede",
    cleanText,
    reservation,
    flatNumber,
    saveDatabase,
    createNotification,
    sendZapiFn
  });

  // 4. Análise de Sentimento em Tempo Real e Detecção de Defeitos / Críticas
  const isNegative = /ruim|péssimo|pessimo|terrível|terrivel|horrível|horrivel|problema|problemas|defeito|defeitos|falha|quebrado|sujo|barulho|barulhento|gotejando|pingando|vazamento|frio|calor|demora|demorado|atraso|descaso|decepção|decepcionado|chateado|vergonha|absurdo|não funciona|nao funciona|estragado|estragou|goteira|cheiro|mofo/i.test(cleanText);
  const isPositive = /excelente|ótimo|otimo|maravilhoso|perfeito|adorei|parabéns|parabens|impecável|impecavel|muito bom|gostei muito|recomendo|nota 10/i.test(cleanText);
  const isMaintenanceIssue = /ar[- ]condicionado|chuveiro|água|agua|aquecedor|fechadura|porta|chave|tranca|lâmpada|lampada|luz|tomada|tv|televisão|televisao|frigobar|geladeira|wi-fi|wifi|internet|vazamento|pia|vaso|dreno|colchão|colchao|travesseiro/i.test(cleanText);

  if (!db.guestSentiment) db.guestSentiment = [];
  let sentEntry = db.guestSentiment.find(s => s.guestPhone === phone);
  if (!sentEntry) {
    sentEntry = {
      id: `sent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      guestPhone: phone,
      guestName: senderName || reservation?.guestName || "Hóspede",
      reservationId: reservation?.id,
      flatNumber: flatNumber,
      messageCount: 0,
      inboundCount: 0,
      positiveKeywords: [],
      negativeKeywords: [],
      keywords: [],
      suggestions: []
    };
    db.guestSentiment.unshift(sentEntry);
  }

  sentEntry.messageCount = (sentEntry.messageCount || 0) + 1;
  sentEntry.inboundCount = (sentEntry.inboundCount || 0) + 1;
  sentEntry.analyzedAt = new Date().toISOString();
  if (flatNumber && !sentEntry.flatNumber) sentEntry.flatNumber = flatNumber;

  if (isNegative) {
    sentEntry.overallTone = "negative";
    sentEntry.overallScore = Math.min(sentEntry.overallScore || 50, 25);
    sentEntry.summary = `Crítica/problema relatado via WhatsApp: "${cleanText.substring(0, 110)}"`;

    const words = cleanText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const foundNeg = words.filter(w => /ruim|péssimo|pessimo|terrível|problema|problemas|defeito|defeitos|falha|quebrado|sujo|barulho|barulhento|gotejando|pingando|vazamento|frio|calor|demora|demorado/i.test(w));
    if (foundNeg.length > 0) {
      sentEntry.negativeKeywords = Array.from(new Set([...(sentEntry.negativeKeywords || []), ...foundNeg]));
    }

    if (!db.observations) db.observations = [];
    const alreadyHasTicket = db.observations.some(o =>
      (o.guestPhone === phone || o.description?.includes(phone)) &&
      o.status === "pendente" &&
      (o.generatedFromWhatsApp || o.generatedFromNps)
    );
    if (!alreadyHasTicket) {
      const obsId = db.observations.length > 0 ? Math.max(...db.observations.map(o => o.id || 0)) + 1 : 1;
      const ticketTitle = isMaintenanceIssue ? "[WhatsApp Defeito]" : "[WhatsApp Crítica]";
      db.observations.push({
        id: obsId,
        flatNumber: flatNumber || "N/A",
        guestPhone: phone,
        type: "reclamacao",
        description: `${ticketTitle} Hóspede ${senderName || phone}${flatNumber ? ` (Flat ${flatNumber})` : ""}: "${cleanText.substring(0, 140)}"`,
        severity: "alta",
        status: "pendente",
        createdAt: new Date().toISOString(),
        generatedFromWhatsApp: true
      });
    }

    if (typeof createNotification === "function" && !npsFlowResult?.npsHandled) {
      createNotification({
        category: "whatsapp",
        title: `⚠️ WhatsApp Alerta: ${senderName || phone}`,
        message: cleanText.substring(0, 120),
        type: "guest_negative_sentiment",
        targetUrl: `/avaliacoes-ia`,
        link: `/avaliacoes-ia`
      });
    }
  } else if (isPositive) {
    sentEntry.overallTone = "positive";
    sentEntry.overallScore = Math.max(sentEntry.overallScore || 70, 85);
    sentEntry.summary = `Elogio recebido via WhatsApp: "${cleanText.substring(0, 110)}"`;
    const words = cleanText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const foundPos = words.filter(w => /excelente|ótimo|otimo|maravilhoso|perfeito|adorei|parabéns|parabens|impecável|impecavel|muito bom|recomendo/i.test(w));
    if (foundPos.length > 0) {
      sentEntry.positiveKeywords = Array.from(new Set([...(sentEntry.positiveKeywords || []), ...foundPos]));
    }
  } else {
    sentEntry.overallTone = sentEntry.overallTone || "neutral";
    sentEntry.overallScore = sentEntry.overallScore || 65;
    sentEntry.summary = `Mensagem via WhatsApp: "${cleanText.substring(0, 110)}"`;
  }

  if (typeof analyzeSentimentFn === "function") {
    analyzeSentimentFn(cleanText, "WhatsApp Inbound Hóspede")
      .then(aiRes => {
        if (aiRes?.usingAI) {
          sentEntry.overallScore = aiRes.score;
          sentEntry.overallTone = aiRes.tone;
          if (aiRes.summary) sentEntry.summary = aiRes.summary;
          if (aiRes.positiveKeywords?.length) sentEntry.positiveKeywords = Array.from(new Set([...(sentEntry.positiveKeywords || []), ...aiRes.positiveKeywords]));
          if (aiRes.negativeKeywords?.length) sentEntry.negativeKeywords = Array.from(new Set([...(sentEntry.negativeKeywords || []), ...aiRes.negativeKeywords]));
          if (aiRes.suggestions?.length) sentEntry.suggestions = Array.from(new Set([...(sentEntry.suggestions || []), ...aiRes.suggestions]));
          if (typeof saveDatabase === "function") saveDatabase();
        }
      })
      .catch(err => console.warn("[Z-API Webhook AI Background]", err.message));
  }

  if (typeof saveDatabase === "function") saveDatabase();
  return npsFlowResult || { npsHandled: false };
}
