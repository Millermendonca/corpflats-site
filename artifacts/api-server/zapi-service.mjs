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
import { getSmtpConfig, createTransporter } from "./mail-service.mjs";

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
  return template.channels.includes(norm) || template.channels.includes(rawLower);
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

{{instrucao_pagamento}}

Para agilizar sua estadia ou efetuar o pagamento via PIX ou cartão, acesse seu portal seguro:
👉 {{link_portal_hospede}}`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_portal", type: "URL", label: "💳 Ver Reserva & Pagar", url: "{{link_portal_hospede}}" },
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code={{pix_copia_e_cola}}" },
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

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo a Quitar: *{{quanto_falta}}*

{{instrucao_saldo}}

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria sem filas, realize com antecedência o seu *Pré-Check-in Digital* pelo botão abaixo:`,
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
    message: `Olá, *{{nome_hospede}}*! 🌟✨
Sua reserva no *{{nome_hotel}}* está *Confirmada*!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo a Quitar: *{{quanto_falta}}*

{{instrucao_saldo}}

🎁 *Benefício Exclusivo — Early Check-in a partir das 10:00:*
Como você reservou diretamente pelo nosso site ou WhatsApp, a sua entrada está liberada a partir das *10:00 da manhã* mediante disponibilidade de limpeza! Assim que o flat estiver higienizado e inspecionado, você receberá a notificação de quarto liberado.

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria sem filas, realize com antecedência o seu *Pré-Check-in Digital* pelo botão abaixo:`,
    footer: "CorpFlats • Hospedagem Contemporânea",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" }
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
{{resumo_alteracoes}}

Os demais dados da sua reserva permanecem inalterados. Você pode consultar todos os detalhes atualizados pelo seu portal do hóspede:`,
    footer: "CorpFlats • Central de Atendimento",
    buttons: [
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

Para que a portaria libere sua entrada imediatamente na chegada sem filas, acesse o link seguro:`,
    footer: "CorpFlats • Entrada Rápida & Segura",
    buttons: [
      { id: "btn_pre", type: "URL", label: "📝 Ficha Digital de Check-in", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_checkin_day_instructions",
    triggerEvent: "checkin_day_instructions",
    title: "Dia do Check-in (07:00) • Instruções de Chegada & Acesso",
    description: "Enviado no dia do check-in pontualmente às 07:00 (para reservas feitas antes das 07:00). Inclui endereço, portaria, Wi-Fi, café (se incluso) e botão 'Já cheguei / Estou no Flat'.",
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

Ao chegar, dirija-se à portaria 24h e informe seu nome e o número do seu flat (*{{quarto}}*).

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

{{mensagem_cafe_incluso}}

{{aviso_checkin_pendente}}

👉 *Já chegou ao hotel?* Clique no link para confirmar sua chegada:
{{link_autocheckin}}

Desejamos uma ótima viagem até aqui! Se precisar de suporte, estamos à disposição.`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
      { id: "btn_cheguei", type: "URL", label: "📍 Já Cheguei no Flat", url: "{{link_autocheckin}}" },
      { id: "btn_maps", type: "URL", label: "📍 Abrir no Google Maps", url: "{{link_maps}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal do Hóspede", url: "{{link_portal_hospede}}" }
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

Esperamos que encontre tudo limpo, fresco e perfeito para o seu conforto.

📱 *Central do Hóspede:*
No portal abaixo você confere senhas, instruções dos aparelhos e regras de convivência do condomínio.

Tenha uma estadia incrível!`,
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
    footer: "CorpFlats • Café Artesanal no Quarto",
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
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code={{pix_copia_e_cola}}" },
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
    recipientTarget: "both",
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
      { id: "btn_pix", type: "COPY", label: "📋 Copiar Código PIX", copyCode: "{{pix_copia_e_cola}}", url: "https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code={{pix_copia_e_cola}}" },
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
    message: `Olá, *{{nome_destinatario}}*! 💚🎉
Confirmamos o recebimento do seu pagamento de *{{valor_pago}}* via *{{forma_pagamento}}*!

Sua reserva no *{{nome_hotel}}* está *Garantida & Confirmada*!

📋 *Resumo da Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*

💰 *Situação Financeira:*
• Valor Total: *{{valor_total}}*
• Quanto foi Pago: *{{valor_pago}}*
• Saldo Restante: *{{quanto_falta}}*

{{instrucao_saldo}}

{{early_checkin_beneficio}}

📍 *Endereço:*
{{endereco_hotel}}

Para agilizar sua entrada na portaria sem filas na chegada, realize com antecedência o seu *Pré-Check-in Digital*:`,
    footer: "CorpFlats • Pagamento Aprovado",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Ver Detalhes da Reserva", url: "{{link_portal_hospede}}" }
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
    message: `Olá, *{{primeiro_nome}}*! 🌟🔑
Sua reserva no *{{nome_hotel}}* para *HOJE* está *Confirmada*!

Como sua reserva foi confirmada no próprio dia da chegada, já adiantamos todas as suas instruções para uma entrada rápida e sem filas:

📋 *Sua Hospedagem:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *Hoje a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*

📍 *Endereço:* {{endereco_hotel}}
🗺️ *Localização no Maps:* {{link_maps}}
🚪 *Portaria:* 24 horas (basta se identificar com seu nome e o número do Flat *{{quarto}}*)

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

{{mensagem_cafe_incluso}}

👉 *Pré-Check-in Digital Obrigatório:*
Para liberação imediata na portaria do condomínio, preencha sua ficha rápida agora mesmo:
{{link_checkin_digital}}

Ao chegar no condomínio, clique no botão abaixo para autodeclarar sua entrada:`,
    footer: "CorpFlats • Entrada Imediata",
    buttons: [
      { id: "btn_chk", type: "URL", label: "📝 Fazer Check-in Online", url: "{{link_checkin_digital}}" },
      { id: "btn_cheguei", type: "URL", label: "📍 Já Cheguei no Flat", url: "{{link_autocheckin}}" },
      { id: "btn_portal", type: "URL", label: "🏨 Portal da Reserva", url: "{{link_portal_hospede}}" }
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
    recipientTarget: "guest",
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
    recipientTarget: "guest",
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

// ── Verificação de Whitelist / Modo de Teste (Sandbox) ─────────────────────────
export function isPhoneAllowedInTestMode(phone, config = {}) {
  // Se testModeOnly for false explicitamente, estamos em produção total (todos permitidos)
  if (config?.testModeOnly === false) {
    return true;
  }

  if (!phone) return false;
  const targetDigits = String(phone).replace(/\D/g, "");
  if (!targetDigits) return false;

  // Miller Mendonça (gestor do hotel / desenvolvedor)
  const defaultAllowed = ["22998505276", "5522998505276"];

  // Telefones autorizados configurados pelo usuário
  const userConfigured = String(config?.testAllowedPhones || "")
    .split(/[,;\s\n]+/)
    .map(p => p.replace(/\D/g, ""))
    .filter(Boolean);

  const allAllowed = [...defaultAllowed, ...userConfigured];

  return allAllowed.some(allowed => {
    if (!allowed) return false;
    if (targetDigits === allowed) return true;
    if (targetDigits.endsWith(allowed) && allowed.length >= 8) return true;
    if (allowed.endsWith(targetDigits) && targetDigits.length >= 8) return true;
    return false;
  });
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
export function formatWhatsAppChangesSummary(changes = []) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return "• *Status da Reserva:* Atualizada no sistema.";
  }

  const lines = [];

  for (const c of changes) {
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

// ── Identificação Unificada de Destinatários (Hóspede e Solicitante) ──────────
export function getReservationRecipients(reservation = {}, db = {}) {
  const guestName = (reservation.guestName || reservation.guests?.[0]?.name || "Hóspede").trim();
  const guestFirstName = guestName.split(" ")[0] || guestName;
  const rawGuestPhone = reservation.guestPhone || reservation.guests?.[0]?.phone || "";
  const cleanGuestDigits = String(rawGuestPhone).replace(/\D/g, "");

  let requesterName = "";
  let requesterPhone = "";
  let requesterType = reservation.requesterType || "guest";
  let requesterCompany = "";

  if (requesterType === "other_person" && reservation.requesterInfo) {
    requesterName = (reservation.requesterInfo.name || "").trim();
    requesterPhone = (reservation.requesterInfo.phone || "").trim();
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
      requesterCompany = companyObj.tradeName || companyObj.corporateName || requesterCompany;
    } else {
      requesterName = reservation.companyName || "Solicitante Corporativo";
    }
  }

  if (!requesterName) {
    requesterName = guestName;
  }
  if (!requesterPhone) {
    requesterPhone = rawGuestPhone;
  }

  const requesterFirstName = requesterName.split(" ")[0] || requesterName;
  const cleanRequesterDigits = String(requesterPhone).replace(/\D/g, "");
  const isDifferentFromGuest = Boolean(
    (cleanRequesterDigits && cleanGuestDigits && cleanRequesterDigits !== cleanGuestDigits) ||
    (requesterType !== "guest" && requesterName && requesterName.toLowerCase() !== guestName.toLowerCase())
  );

  return {
    guest: {
      name: guestName,
      firstName: guestFirstName,
      phone: rawGuestPhone,
      cleanDigits: cleanGuestDigits
    },
    requester: {
      name: requesterName,
      firstName: requesterFirstName,
      phone: requesterPhone,
      cleanDigits: cleanRequesterDigits,
      type: requesterType,
      company: requesterCompany,
      isDifferentFromGuest
    }
  };
}

// ── Motor de Resolução de Tags Dinâmicas ───────────────────────────────────────
export function resolveWhatsAppTags(text, reservation = {}, db = {}, baseUrl = "", targetRecipient = "guest") {
  if (!text) return "";

  const recipients = getReservationRecipients(reservation, db);
  const guest = recipients.guest;
  const requester = recipients.requester;

  const recipientIsRequester = targetRecipient === "requester";
  const primaryRecipientName = recipientIsRequester ? requester.name : guest.name;
  const primaryRecipientFirstName = recipientIsRequester ? requester.firstName : guest.firstName;
  const primaryRecipientPhone = recipientIsRequester ? requester.phone : guest.phone;

  const guestName = guest.name;
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

  const rawMethod = String(reservation.paymentMethod || "pix").toLowerCase();
  let formaPagamento = "PIX";
  if (rawMethod.includes("cart") || rawMethod.includes("card") || rawMethod.includes("credit")) {
    formaPagamento = "Cartão de Crédito";
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

  // Links inteligentes com autenticação por código de reserva
  const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
  const linkPortalHospede = `${appOrigin}/minha-reserva/${resCode}`;
  const linkPagamento = `${appOrigin}/minha-reserva/${resCode}`;
  const linkCafeManha = `${appOrigin}/cafe/${resCode}`;
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
    instrucaoSaldo = "✅ *Pagamento 100% Concluído:* Sua hospedagem está totalmente quitada.";
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
  const mapsUrl = db.settings?.googleMapsUrl || "https://maps.app.goo.gl/7L3LnGksmimABGCH7?g_st=ac";
  
  const zapiCfg = db.zapiConfig || {};
  const wifiNetwork = zapiCfg.wifiNetwork || "CorpFlats-Hospedes";
  const wifiPassword = zapiCfg.wifiPassword || "corpflats2026";
  const adminWhatsApp = db.settings?.adminWhatsApp || "5522997124021";
  const googleReviewUrl = zapiCfg.googleReviewUrl || "https://maps.app.goo.gl/7L3LnGksmimABGCH7?g_st=ac";

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

    if (isFutureCheckin) {
      // Reserva para data futura: sempre exibir benefício
      earlyCheckinBeneficio = `🎁 *Benefício Exclusivo — Early Check-in Gratuito:*\nPor ter reservado diretamente pelo nosso site/WhatsApp, seu flat será liberado assim que estiver limpo e pronto no dia da chegada, *sem precisar aguardar as ${checkinTime}*! Conforme disponibilidade.`;
    } else if (isSameDayCheckin) {
      // Reserva para hoje: só exibir se faltam pelo menos 30 minutos para o check-in
      const now = new Date();
      const [ciHour, ciMin] = checkinTime.split(":").map(Number);
      const checkinDeadline = new Date();
      checkinDeadline.setHours(ciHour, ciMin - 30, 0, 0); // 30 min antes do check-in
      if (now < checkinDeadline) {
        earlyCheckinBeneficio = `🎁 *Benefício Exclusivo — Early Check-in Gratuito:*\nPor ter reservado diretamente pelo nosso site/WhatsApp, seu flat será liberado assim que estiver limpo e pronto, *sem precisar aguardar as ${checkinTime}*! Conforme disponibilidade.`;
      }
    }
  }

  // ── Tag: {{resumo_alteracoes}} ────────────────────────────────────────────
  // Formata a lista de campos alterados (apenas o que mudou, De ➔ Para)
  let resumoAlteracoes = "";
  const changes = reservation._changesContext || [];
  if (Array.isArray(changes) && changes.length > 0) {
    resumoAlteracoes = formatWhatsAppChangesSummary(changes);
  }
  if (!resumoAlteracoes) {
    resumoAlteracoes = "• *Status da Reserva:* Dados atualizados no sistema.";
  }

  // Tag de link de autodeclaração de checkin ("Já cheguei / Estou no Flat")
  const linkAutocheckin = `${appOrigin}/minha-reserva/${resCode}?action=self_checkin`;

  // Tag: {{mensagem_cafe_incluso}}
  const hasBreakfast = Boolean(reservation.includeBreakfast || reservation.ratePlan === "with_breakfast");
  const mensagemCafeIncluso = hasBreakfast
    ? `🥐 *Café da Manhã Incluso:*\nSua diária inclui nosso café da manhã artesanal servido exclusivamente no seu flat! Monte a sua bandeja até às 22h pelo link:\n👉 ${linkCafeManha}`
    : "";

  // Tag: {{mensagem_pendencia_hospedes}} (Lógica de 1 vs 2 hóspedes)
  const isMultiGuest = (reservation.guestCount > 1 || reservation.adults > 1);
  const firstGuestDone = Boolean(reservation.guests?.[0]?.hasCompletedCheckin || reservation.guests?.[0]?.status === "CHECKED_IN");
  let mensagemPendenciaHospedes = "Para que a portaria do condomínio libere sua entrada imediatamente na chegada, pedimos que adiante o cadastro dos hóspedes pelo link abaixo:";
  if (isMultiGuest && firstGuestDone) {
    mensagemPendenciaHospedes = `Recebemos com sucesso a ficha de Check-in Digital do(a) *${guest.firstName || guest.name}*, porém ainda está pendente o cadastro do *2º hóspede* para autorização na portaria.\n\nPor favor, repasse este link ao segundo acompanhante para preenchimento:\n👉 ${linkCheckinDigital}\n\n💡 _Caso vá viajar sozinho(a), basta confirmar em seu portal ou responder por aqui para atualizarmos sua reserva para 1 hóspede sem pendências._`;
  }

  // Tag: {{aviso_checkin_pendente}}
  const allCheckedIn = Boolean(reservation.checkedInAt || (reservation.guests && reservation.guests.length > 0 && reservation.guests.every(g => g.hasCompletedCheckin)));
  const avisoCheckinPendente = !allCheckedIn
    ? `⚠️ *Atenção:* Sua ficha de Pré-Check-in Digital ainda está pendente. Para evitar filas e atrasos na portaria 24h, preencha antecipadamente:\n👉 ${linkCheckinDigital}`
    : "";

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
    "{{valor_total}}": formatCurrency(totalAmount),
    "{{valor_pago}}": formatCurrency(paidAmount),
    "{{quanto_falta}}": formatCurrency(pendingAmount),
    "{{saldo_restante}}": formatCurrency(pendingAmount),
    "{{valor_restante}}": formatCurrency(pendingAmount),
    "{{chave_pix}}": pixKey,
    "{{titular_pix}}": titularPix,
    "{{pix_copia_e_cola}}": pixCopiaECola,
    "{{instrucao_pagamento}}": instrucaoPagamento,
    "{{instrucao_saldo}}": instrucaoSaldo,
    "{{status_confirmacao}}": statusConfirmacao,
    "{{status_pagamento}}": paymentStatus,
    "{{canal_reserva}}": channel,
    "{{nome_hotel}}": hotelName,
    "{{endereco_hotel}}": hotelAddress,
    "{{link_maps}}": mapsUrl,
    "{{wifi_rede}}": wifiNetwork,
    "{{wifi_senha}}": wifiPassword,
    "{{telefone_hotel}}": adminWhatsApp,
    "{{link_checkin_digital}}": linkCheckinDigital,
    "{{link_portal_hospede}}": linkPortalHospede,
    "{{link_pagamento}}": linkPagamento,
    "{{link_cafe_manha}}": linkCafeManha,
    "{{link_checkout}}": linkCheckout,
    "{{link_avaliacao_google}}": googleReviewUrl,
    "{{link_autocheckin}}": linkAutocheckin,
    "{{mensagem_cafe_incluso}}": mensagemCafeIncluso,
    "{{mensagem_pendencia_hospedes}}": mensagemPendenciaHospedes,
    "{{aviso_checkin_pendente}}": avisoCheckinPendente,
    "{{link_guia_hospede}}": zapiCfg.guestGuidePdfUrl || `${appOrigin}/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf`,
    "{{link_manual_hospede}}": zapiCfg.guestGuidePdfUrl || `${appOrigin}/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf`,
    "{{early_checkin_beneficio}}": earlyCheckinBeneficio,
    "{{forma_pagamento}}": formaPagamento,
    "{{data_pagamento}}": formatDateBr(reservation.paidAt || new Date().toISOString()),
    "{{resumo_alteracoes}}": resumoAlteracoes
  };

  let rendered = text;
  for (const [tag, val] of Object.entries(tagsMap)) {
    rendered = rendered.split(tag).join(val);
  }

  return rendered;
}

// ── Formatador de Mensagem com Links Clicáveis (100% compatível com qualquer WhatsApp) ──
export function formatMessageWithLinks(message, footer = "", buttons = []) {
  let text = (message || "").trim();
  const validButtons = (buttons || []).filter(b => b && b.label && (b.url || b.phone || b.copyCode || b.type === "REPLY" || b.type === "COPY"));

  if (validButtons.length > 0) {
    const linkItems = validButtons
      .filter(b => b.url || b.phone || b.copyCode || b.type === "COPY")
      .map(b => {
        if (b.type === "CALL" || b.phone) {
          return `📞 *${b.label}:* ${b.phone}`;
        }
        if (b.type === "COPY" || b.copyCode) {
          const code = b.copyCode || b.code || (b.url && b.url.startsWith("000201") ? b.url : "");
          if (code) {
            return `📋 *${b.label} (PIX Copia e Cola):*\n\`${code}\``;
          }
        }
        return `👉 *${b.label}:*\n${b.url}`;
      });

    if (linkItems.length > 0) {
      text += `\n\n🔗 *Acesso Rápido:*\n` + linkItems.join("\n\n");
    }
  }

  if (footer) {
    text += `\n\n_${footer}_`;
  }

  return text;
}

// ── Disparo Oficial de Documento / PDF via Z-API (/send-document/{extension}) ─
export async function sendZapiDocument(config, {
  phone,
  document,
  fileName = "Manual_do_Hospede_CorpFlats.pdf",
  caption = ""
}) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  // Trava de Segurança: Modo de Teste / Sandbox
  if (!isPhoneAllowedInTestMode(cleanPhone, config)) {
    console.warn(`[Z-API Sandbox] Documento para ${cleanPhone} BLOQUEADO pelo Modo de Teste. Permitido apenas para: ${config?.testAllowedPhones || "22998505276"}`);
    return {
      success: false,
      blockedByTestMode: true,
      error: `Disparo bloqueado: O WhatsApp está em Modo de Teste / Sandbox e o telefone ${cleanPhone} não está na lista de números autorizados.`
    };
  }
  if (!document) {
    return { success: false, error: "Arquivo ou link do documento não especificado." };
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();

  // Simulação para desenvolvimento se credenciais não estiverem configuradas
  if (!instanceId || !token) {
    console.warn(`[Z-API Mock] Credenciais não configuradas. Documento '${fileName}' para ${cleanPhone} simulado.`);
    return {
      success: true,
      simulated: true,
      messageId: `mock_doc_${Date.now()}`,
      phone: cleanPhone,
      fileName
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
    phone: cleanPhone,
    document: finalDocument,
    fileName: fileName || `Documento.${extension}`,
    caption: caption || ""
  };

  try {
    console.log(`[Z-API] Enviando documento (${fileName}) para ${cleanPhone}...`);
    const res = await fetch(docUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.zaapId || data.id || data.messageId)) {
      console.log(`[Z-API ✓] Documento ${fileName} entregue para ${cleanPhone}. ID: ${data.zaapId || data.id}`);
      return {
        success: true,
        messageId: data.zaapId || data.id,
        fileName,
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
  fileBase64 = ""
}) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  // Trava de Segurança: Modo de Teste / Sandbox
  if (!isPhoneAllowedInTestMode(cleanPhone, config)) {
    console.warn(`[Z-API Sandbox] Disparo para ${cleanPhone} BLOQUEADO pelo Modo de Teste / Sandbox. Permitido apenas para: ${config?.testAllowedPhones || "22998505276"}`);
    return {
      success: false,
      blockedByTestMode: true,
      error: `Disparo bloqueado: O WhatsApp está em Modo de Teste / Sandbox e o telefone ${cleanPhone} não está na lista de números autorizados.`
    };
  }

  const hasDoc = Boolean(documentUrl || fileBase64);

  // Se não há texto na mensagem mas há documento, envia diretamente o documento
  if (!message && hasDoc) {
    return await sendZapiDocument(config, {
      phone: cleanPhone,
      document: fileBase64 || documentUrl,
      fileName: documentName || "Manual_do_Hospede_CorpFlats.pdf",
      caption: documentCaption || ""
    });
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  const fallbackToText = config?.fallbackToText !== false;
  const configuredDeliveryMode = config?.deliveryMode || "text_links"; // "text_links" (padrão 100% seguro contra bloqueios de botões da Meta), "buttons", "auto"

  // Se não configurado, simula sucesso em ambiente de desenvolvimento/teste sem travar
  if (!instanceId || !token) {
    console.warn(`[Z-API Mock] Credenciais não configuradas. Mensagem para ${cleanPhone} simulada.`);
    const mockResult = {
      success: true,
      simulated: true,
      messageId: `mock_${Date.now()}`,
      phone: cleanPhone,
      message: message
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

  const validButtons = (buttons || []).filter(b => b && b.label && (b.url || b.phone || b.type === "REPLY"));

  // Determina se deve enviar direto por texto com links (garantido) ou tentar botões
  const shouldSendText = sendMode === "text" || 
                         (sendMode !== "buttons" && configuredDeliveryMode === "text_links") || 
                         validButtons.length === 0;

  let primaryResult = null;

  // 1. Envio Direto via Texto Formatado com Links (/send-text)
  if (shouldSendText) {
    const textWithLinks = formatMessageWithLinks(message, footer, validButtons);
    const textUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;

    try {
      console.log(`[Z-API] Enviando mensagem em texto formatado para ${cleanPhone}...`);
      const res = await fetch(textUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: cleanPhone, message: textWithLinks })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.zaapId || data.id || data.messageId)) {
        console.log(`[Z-API ✓] Texto entregue para ${cleanPhone}. ID: ${data.zaapId || data.id}`);
        primaryResult = {
          success: true,
          method: "text_links",
          messageId: data.zaapId || data.id,
          data
        };
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
        if (codeToCopy) {
          rawUrl = `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=${encodeURIComponent(codeToCopy)}`;
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
      phone: cleanPhone,
      message: message,
      // Omitido 'title' para que a mensagem inicie direto com a saudação, sem cabeçalho com o nome interno do template
      ...(footer ? { footer } : {}),
      buttonActions: formattedActions
    };

    try {
      console.log(`[Z-API] Enviando mensagem com botões para ${cleanPhone}...`);
      const res = await fetch(buttonActionsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(buttonActionsPayload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.zaapId || data.id || data.messageId || data.value)) {
        console.log(`[Z-API ✓] Mensagem com botões aceita para ${cleanPhone}. ID: ${data.zaapId || data.id}`);
        primaryResult = {
          success: true,
          method: "buttons",
          messageId: data.zaapId || data.id || "ok",
          data
        };
      } else {
        console.warn(`[Z-API] Falha ao enviar com botões (HTTP ${res.status}):`, data);

        // Fallback para texto formatado se configurado
        if (fallbackToText) {
          console.log(`[Z-API Fallback] Reenviando como texto formatado para ${cleanPhone}...`);
          const textWithLinks = formatMessageWithLinks(message, footer, validButtons);
          const textUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;
          const textRes = await fetch(textUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({ phone: cleanPhone, message: textWithLinks })
          });
          const textData = await textRes.json().catch(() => ({}));

          if (textRes.ok && (textData.zaapId || textData.id)) {
            primaryResult = {
              success: true,
              method: "fallback_text",
              warning: "Mensagem entregue via texto com links diretos após recusa de botões pela Z-API.",
              buttonError: data.message || data.error || `Erro HTTP ${res.status}`,
              messageId: textData.zaapId || textData.id,
              data: textData
            };
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
      console.log(`[Z-API] Anexando documento ${documentName || 'PDF'} para ${cleanPhone}...`);
      await new Promise(r => setTimeout(r, 1200)); // Pequena pausa para garantir ordem cronológica no WhatsApp
      const docResult = await sendZapiDocument(config, {
        phone: cleanPhone,
        document: fileBase64 || documentUrl,
        fileName: documentName || "Manual_do_Hospede_CorpFlats.pdf",
        caption: documentCaption || ""
      });
      primaryResult.documentResult = docResult;
      primaryResult.hasDocument = true;
    } catch (docErr) {
      console.warn(`[Z-API] Erro ao disparar documento anexo:`, docErr.message);
      primaryResult.documentError = docErr.message;
    }
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
export async function sendZapiOtpButton(config, { phone, message, code, buttonText = "Copiar código" }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) return { success: true, simulated: true };

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-otp`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: cleanPhone,
    message,
    code,
    buttonText
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
 * Enviar Botão Nativo de Chave PIX (/send-button-pix)
 */
export async function sendZapiPixButton(config, { phone, pixKey, type = "EVP", merchantName = "CorpFlats" }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) return { success: false, error: "Telefone inválido" };

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  if (!instanceId || !token) return { success: true, simulated: true };

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const url = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-pix`;
  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const payload = {
    phone: cleanPhone,
    pixKey,
    type,
    merchantName
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

// ── Consulta Status da Conexão Z-API ──────────────────────────────────────────
export async function getZapiStatus(config) {
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

  const baseUrl = config.baseUrl?.replace(/\/+$/, "") || "https://api.z-api.io";
  const statusUrl = `${baseUrl}/instances/${instanceId}/token/${token}/status`;
  const deviceUrl = `${baseUrl}/instances/${instanceId}/token/${token}/device`;
  const headers = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const res = await fetch(statusUrl, { headers });
    const data = await res.json().catch(() => ({}));
    const isConnected = Boolean(data.connected || data.smartphoneConnected);

    let deviceInfo = null;
    if (isConnected) {
      try {
        const devRes = await fetch(deviceUrl, { headers });
        if (devRes.ok) {
          deviceInfo = await devRes.json().catch(() => null);
        }
      } catch (devErr) {
        console.warn("[Z-API] Falha ao consultar /device:", devErr.message);
      }
    }

    return {
      connected: isConnected,
      configured: true,
      smartphone: data.smartphone || null,
      phone: deviceInfo?.phone || data.phone || data.smartphone?.phone || "",
      name: deviceInfo?.name || "",
      isBusiness: Boolean(deviceInfo?.isBusiness),
      deviceModel: deviceInfo?.device?.device_model || deviceInfo?.originalDevice || "",
      battery: data.battery || data.smartphone?.battery || null,
      error: isConnected ? null : (data.error || data.message || null),
      details: { ...data, device: deviceInfo }
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      error: err.message
    };
  }
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

// ── Cálculo do Horário de Disparo (Offset Engine) ──────────────────────────────
export function calculateScheduledTime(template, reservation, db) {
  const now = new Date();
  const checkinTimeStr = db.settings?.checkinTime || "14:00";
  const checkoutTimeStr = db.settings?.checkoutTime || "12:00";

  // Checkin ISO datetime
  const checkinDateStr = reservation.checkinDate || now.toISOString().substring(0, 10);
  const checkinDateTime = new Date(`${checkinDateStr}T${checkinTimeStr}:00`);

  // Checkout ISO datetime
  const checkoutDateStr = reservation.checkoutDate || now.toISOString().substring(0, 10);
  const checkoutDateTime = new Date(`${checkoutDateStr}T${checkoutTimeStr}:00`);

  const timing = template.triggerTiming || "immediate";

  if (timing === "immediate") {
    return now.toISOString();
  }

  if (timing === "fixed_time_day_of") {
    const targetHour = template.fixedTime || "09:00";
    const eventDate = template.triggerEvent.includes("checkout") ? checkoutDateStr : checkinDateStr;
    return new Date(`${eventDate}T${targetHour}:00`).toISOString();
  }

  if (timing === "fixed_time_day_before") {
    const targetHour = template.fixedTime || "18:00";
    const eventDate = template.triggerEvent.includes("checkout") ? checkoutDateStr : checkinDateStr;
    const dayBefore = new Date(eventDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const yyyy = dayBefore.getFullYear();
    const mm = String(dayBefore.getMonth() + 1).padStart(2, "0");
    const dd = String(dayBefore.getDate()).padStart(2, "0");
    return new Date(`${yyyy}-${mm}-${dd}T${targetHour}:00`).toISOString();
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

  if (!isTest && lastState === "disconnected" && !cooldownPassed) {
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
  const d = new Date();
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

  const fromMe = Boolean(body.fromMe || body.isMyMessage);

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
    let cleanReq = db.cleaningRequests.find(r => r.flatId === flat.id && r.requestDate === todayStr);

    if (cleanReq) {
      cleanReq.isVacant = true; // Quarto desocupado
      cleanReq.leavingGuest = cleanReq.leavingGuest || senderLabel;
      if (!cleanReq.pendingObservation) {
        cleanReq.pendingObservation = `Check-out confirmado no grupo da portaria (${senderLabel})`;
      } else if (!cleanReq.pendingObservation.includes("portaria") && !cleanReq.pendingObservation.includes("Portaria")) {
        cleanReq.pendingObservation = `${cleanReq.pendingObservation} • Confirmado na Portaria (${senderLabel})`;
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
        isPriority: false,
        leavingGuest: senderLabel,
        arrivingGuest: null,
        pendingObservation: `Check-out confirmado no grupo da portaria (${senderLabel})`,
        willCleanAt: null,
        cleaningStartedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      };
      db.cleaningRequests.unshift(cleanReq);
    }

    // 3. Atualiza reservas ativas correspondentes
    const matchingResList = (db.reservations || []).filter(r => 
      (r.flatId === flat.id || String(r.flatNumber) === String(flat.number)) &&
      r.status !== "cancelada" && r.status !== "cancelado" &&
      r.checkinDate <= todayStr && r.checkoutDate >= todayStr
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

// ── Localizador de Reserva por Telefone ─────────────────────────────────────────
export function findReservationByPhone(db, phone) {
  if (!db?.reservations || !phone) return null;
  const cleanP = cleanWhatsAppPhone(phone);
  if (!cleanP) return null;
  const last8 = cleanP.slice(-8);
  const matched = (db.reservations || []).filter(r => {
    if (!r.guestPhone) return false;
    const rClean = cleanWhatsAppPhone(r.guestPhone);
    return rClean === cleanP || (rClean && last8 && rClean.slice(-8) === last8);
  });
  if (matched.length === 0) return null;
  matched.sort((a, b) => String(b.checkoutDate || "").localeCompare(String(a.checkoutDate || "")));
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

  if (!conv) {
    conv = {
      id: cleanPhone,
      phone: cleanPhone,
      formattedPhone: isGroup ? groupName || cleanPhone : formatPhoneDisplay(cleanPhone),
      name: isGroup ? groupName || "Grupo WhatsApp" : (matchedResv?.guestName || senderName || formatPhoneDisplay(cleanPhone)),
      avatarUrl: "",
      isGroup: Boolean(isGroup),
      groupId: groupId || null,
      groupName: groupName || null,
      unreadCount: fromMe ? 0 : 1,
      pinned: false,
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
    if (!r.guestPhone) continue;
    const cleanP = cleanWhatsAppPhone(r.guestPhone);
    if (!cleanP) continue;

    let conv = db.whatsappConversations.find(c => c.phone === cleanP);
    if (!conv) {
      conv = {
        id: cleanP,
        phone: cleanP,
        formattedPhone: formatPhoneDisplay(cleanP),
        name: r.guestName || "Hóspede",
        avatarUrl: "",
        isGroup: false,
        unreadCount: 0,
        pinned: false,
        reservationCode: r.code,
        flatNumber: r.flatNumber || "",
        checkinDate: r.checkinDate || "",
        checkoutDate: r.checkoutDate || "",
        status: r.status || "confirmada",
        paymentStatus: r.paymentStatus || "",
        totalAmount: r.totalAmount || 0,
        lastMessage: null,
        updatedAt: r.createdAt || new Date().toISOString(),
        messages: []
      };
      db.whatsappConversations.push(conv);
    } else {
      if (!conv.reservationCode || (r.checkoutDate && (!conv.checkoutDate || r.checkoutDate > conv.checkoutDate))) {
        conv.reservationCode = r.code;
        conv.flatNumber = r.flatNumber || conv.flatNumber;
        conv.checkinDate = r.checkinDate || conv.checkinDate;
        conv.checkoutDate = r.checkoutDate || conv.checkoutDate;
        conv.status = r.status || conv.status;
        conv.paymentStatus = r.paymentStatus || conv.paymentStatus;
        conv.totalAmount = r.totalAmount || conv.totalAmount;
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

  function ensureDbDefaults() {
    const db = getDb();
    if (!db) return;
    if (!db.zapiConfig) {
      db.zapiConfig = {
        instanceId: "",
        token: "",
        clientToken: "",
        enabled: false,
        deliveryMode: "text_links",
        fallbackToText: true,
        wifiNetwork: "CorpFlats-Hospedes",
        wifiPassword: "corpflats2026",
        googleReviewUrl: "https://maps.app.goo.gl/7L3LnGksmimABGCH7?g_st=ac",
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
        testAllowedPhones: "22998505276"
      };
    } else {
      if (!db.zapiConfig.googleReviewUrl || db.zapiConfig.googleReviewUrl.includes("maps.google.com/?q=") || db.zapiConfig.googleReviewUrl.includes("g.page/r/corpflats")) {
        db.zapiConfig.googleReviewUrl = "https://maps.app.goo.gl/7L3LnGksmimABGCH7?g_st=ac";
      }
      if (!db.zapiConfig.deliveryMode) {
        db.zapiConfig.deliveryMode = "text_links";
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
    }

    if (!db.zapiConnectionLogs) {
      db.zapiConnectionLogs = [];
    }

    if (!db.conciergeWhatsappLogs) {
      db.conciergeWhatsappLogs = [];
    }

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
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix")) {
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
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix")) {
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
          if (tpl.message.includes("{{chave_pix}}") || tpl.message.includes("Confirmação Automática") || !tpl.buttons?.some(b => b.copyCode || b.id === "btn_pix")) {
            const defAdd = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_additional_daily_pending");
            if (defAdd) {
              tpl.title = defAdd.title;
              tpl.description = defAdd.description;
              tpl.message = defAdd.message;
              tpl.buttons = defAdd.buttons;
            }
          }
        }
        if (tpl.id === "tpl_payment_confirmed") {
          tpl.channels = ["site", "whatsapp"];
          tpl.recipientTarget = "both";
        }
        if (tpl.id === "tpl_checkin_day_instructions") {
          tpl.fixedTime = "07:00";
          if (!tpl.message.includes("link_autocheckin")) {
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
          if (!tpl.message.includes("mensagem_pendencia_hospedes")) {
            const defRem = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_pre_checkin_reminder");
            if (defRem) {
              tpl.message = defRem.message;
              tpl.description = defRem.description;
            }
          }
        }
        if (tpl.id === "tpl_nps_satisfaction_check") {
          tpl.offsetValue = 24;
          tpl.offsetUnit = "hours";
          tpl.title = "Pós Check-out (24h) • Pesquisa de Satisfação (Filtro NPS)";
        }
        if (tpl.id === "tpl_new_reservation_direct") {
          if (!tpl.message.includes("10:00 da manhã")) {
            const defDir = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_new_reservation_direct");
            if (defDir) {
              tpl.message = defDir.message;
              tpl.description = defDir.description;
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
      for (const item of db.whatsappQueue) {
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

  // 2. Salvar Configurações
  app.post("/api/whatsapp/config", (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    db.zapiConfig = {
      ...(db.zapiConfig || {}),
      ...req.body
    };
    if (db.zapiConfig.testModeOnly !== false) {
      cancelRealGuestsFromQueue(db, saveDatabase);
    }
    saveDatabase();
    res.json({ success: true, config: db.zapiConfig });
  });

  // 3. Status Z-API
  app.get("/api/whatsapp/status", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const status = await getZapiStatus(db?.zapiConfig);
    res.json(status);
  });

  // 4. QR Code Z-API
  app.get("/api/whatsapp/qr-code", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    const qr = await getZapiQrCode(db?.zapiConfig);
    res.json(qr);
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

    const result = await sendZapiMessage(db.zapiConfig, {
      phone: item.guestPhone,
      message: item.renderedMessage,
      title: item.title,
      footer: item.footer,
      buttons: item.renderedButtons,
      documentUrl: item.documentUrl,
      documentName: item.documentName
    });

    item.status = result.success ? "sent" : "failed";
    item.sentAt = new Date().toISOString();
    item.error = result.error || null;
    item.method = result.method || "manual";
    item.messageId = result.messageId || null;

    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reservationCode: item.reservationCode,
      guestName: item.guestName,
      guestPhone: item.guestPhone,
      triggerEvent: item.triggerEvent,
      message: item.renderedMessage,
      buttons: item.renderedButtons,
      documentUrl: item.documentUrl || null,
      documentName: item.documentName || null,
      status: item.status,
      method: item.method,
      error: item.error,
      sentAt: item.sentAt
    });

    appendMessageToConversation(db, {
      phone: item.guestPhone,
      senderName: "CorpFlats",
      senderPhone: db.zapiConfig?.instanceId || "",
      fromMe: true,
      text: item.renderedMessage,
      type: item.documentUrl ? "document" : "text",
      mediaUrl: item.documentUrl || null,
      fileName: item.documentName || null,
      buttons: item.renderedButtons,
      triggerEvent: item.triggerEvent,
      reservationCode: item.reservationCode,
      status: result.success ? "read" : "failed",
      timestamp: item.sentAt,
      messageId: result.messageId || `msg_manual_${Date.now()}`
    });

    saveDatabase();
    res.json({ success: result.success, result, queueItem: item });
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
      sendMode = "text",
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
        guestName: "Miller Mendonça",
        guestPhone: phone,
        code: "RES-113-0034",
        flatNumber: "113",
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
      documentCaption: hasDocTest ? documentCaption : undefined
    });

    // Grava log do teste
    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `test_${Date.now()}`,
      guestName: "Teste Manual",
      guestPhone: phone,
      triggerEvent: "test_dispatch",
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
      triggerEvent: "test_dispatch",
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
      }
    }
    if (!template) {
      return res.status(404).json({ error: "Modelo de mensagem não encontrado." });
    }

    const searchTarget = String(reservationCode || reservationId || req.body.code || req.body.id || "").trim();
    const cleanSearchDigits = searchTarget.replace(/\D/g, "");

    const reservation = (db?.reservations || []).find(r => {
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
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const recipients = getReservationRecipients(reservation, db);
    const targetMode = req.body.recipientTarget || template.recipientTarget || "guest"; // "guest" | "requester" | "both"

    const dispatches = [];

    if (targetMode === "guest" || targetMode === "both") {
      dispatches.push({
        type: "guest",
        name: recipients.guest.name,
        phone: recipients.guest.phone
      });
    }

    if (targetMode === "requester" || targetMode === "both") {
      if (targetMode === "requester" || recipients.requester.isDifferentFromGuest) {
        if (recipients.requester.phone) {
          dispatches.push({
            type: "requester",
            name: recipients.requester.name,
            phone: recipients.requester.phone
          });
        } else if (targetMode === "requester") {
          dispatches.push({
            type: "guest",
            name: recipients.guest.name,
            phone: recipients.guest.phone
          });
        }
      }
    }

    if (dispatches.length === 0) {
      dispatches.push({
        type: "guest",
        name: recipients.guest.name,
        phone: recipients.guest.phone
      });
    }

    const hasAttachment = Boolean(template.hasAttachment || template.documentUrl);
    const docUrl = hasAttachment ? (template.documentUrl || db?.zapiConfig?.guestGuidePdfUrl) : undefined;
    const docName = hasAttachment ? (template.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined;

    const results = [];
    if (!db.whatsappHistory) db.whatsappHistory = [];

    for (const d of dispatches) {
      const renderedMessage = resolveWhatsAppTags(template.message, reservation, db, baseUrl, d.type);
      const renderedButtons = (template.buttons || []).map(b => ({
        ...b,
        url: b.url ? resolveWhatsAppTags(b.url, reservation, db, baseUrl, d.type) : undefined,
        phone: b.phone ? resolveWhatsAppTags(b.phone, reservation, db, baseUrl, d.type) : undefined,
        copyCode: b.copyCode ? resolveWhatsAppTags(b.copyCode, reservation, db, baseUrl, d.type) : undefined
      }));

      const sendRes = await sendZapiMessage(db?.zapiConfig, {
        phone: d.phone,
        message: renderedMessage,
        title: template.title,
        footer: template.footer,
        buttons: renderedButtons,
        documentUrl: docUrl,
        documentName: docName
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

    res.json({
      success: anySuccess,
      allSuccess,
      method: results[0]?.method || "manual",
      dispatchesCount: results.length,
      recipients: results.map(r => ({ type: r.recipientType, name: r.recipientName, phone: r.phone, success: r.success })),
      results
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
  async function processInboundSentimentAndNps({ db, phone, senderName, text, messageId, timestamp, updatedConv, saveDatabase, createNotification, analyzeSentimentFn }) {
    if (!db) return;
    const cleanText = (text || "").trim();
    if (!cleanText) return;

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
    });
    const flatMatch = cleanText.match(/(?:apto|apt|flat|quarto|unidade|su[ií]te)\s*[:#º°]?\s*(\d{2,4}[a-z]?)/i);
    const flatNumber = reservation?.flatNumber || reservation?.flat || updatedConv?.flatNumber || (flatMatch ? flatMatch[1] : null);

    // 3. Detecção de Resposta NPS (1 a 5)
    const npsMatch = cleanText.match(/^([1-5])$/) || cleanText.match(/^nota\s*([1-5])$/i);
    if (npsMatch) {
      const score = Number(npsMatch[1]);
      if (!db.npsResponses) db.npsResponses = [];
      let npsItem = db.npsResponses.find(n => n.guestPhone === phone);
      if (!npsItem) {
        npsItem = {
          id: `nps_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          guestPhone: phone,
          guestName: senderName || reservation?.guestName || "Hóspede",
          sentAt: new Date().toISOString()
        };
        db.npsResponses.unshift(npsItem);
      }
      npsItem.score = score;
      npsItem.respondedAt = new Date().toISOString();
      npsItem.pendingResponse = false;
      npsItem.flatNumber = flatNumber;

      if (score === 5) {
        npsItem.autoAction = "google_link_sent";
        npsItem.googleLinkSent = true;
        const googleLink = db.zapiConfig?.googleReviewUrl || "https://maps.app.goo.gl/7L3LnGksmimABGCH7?g_st=ac";
        sendZapiMessage(db.zapiConfig, {
          phone,
          message: `Ficamos muito felizes que sua experiência foi nota 5! ⭐⭐⭐⭐⭐\n\nVocê nos ajudaria muito compartilhando sua opinião no Google? Leva menos de 1 minuto e faz toda a diferença para nossa equipe:\n\n${googleLink}\n\nMuito obrigado e até a próxima estadia!`
        }).catch(err => console.warn("[NPS Google Link] Falha no disparo automático:", err.message));
      } else if (score <= 2) {
        npsItem.autoAction = "recovery_ticket_created";
        if (!db.observations) db.observations = [];
        const obsId = db.observations.length > 0 ? Math.max(...db.observations.map(o => o.id || 0)) + 1 : 1;
        db.observations.push({
          id: obsId,
          flatNumber: flatNumber || "N/A",
          guestPhone: phone,
          type: "reclamacao",
          description: `[NPS Auto-Ticket] Hóspede ${senderName || phone} deu nota ${score}/5 pós-checkout. Entrar em contato com urgência para recuperação.`,
          severity: score === 1 ? "alta" : "media",
          status: "pendente",
          createdAt: new Date().toISOString(),
          generatedFromNps: true
        });
      } else {
        npsItem.autoAction = "feedback_collected";
      }
    }

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

      // Auto-Ticket para manutenção se relatar defeito/crítica
      if (!db.observations) db.observations = [];
      const alreadyHasTicket = db.observations.some(o =>
        (o.guestPhone === phone || o.description?.includes(phone)) &&
        o.status === "pendente" &&
        o.generatedFromWhatsApp
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

      if (typeof createNotification === "function") {
        createNotification({
          title: `⚠️ WhatsApp Alerta: ${senderName || phone}`,
          message: cleanText.substring(0, 120),
          type: "guest_negative_sentiment",
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

    // Se houver analisador de IA configurado, enriquece assincronamente em segundo plano
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
  }

  // 17. Webhook Z-API: Mensagem Recebida (/api/whatsapp/webhook/received)
  app.post("/api/whatsapp/webhook/received", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
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
      : (incomingInfo.senderPhone || req.body?.phone || req.body?.participantPhone);
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
          title: `WhatsApp: ${incomingInfo.senderName || updatedConv?.name || cleanTarget}`,
          message: preview.substring(0, 120),
          type: "whatsapp_message",
          link: `/whatsapp-chat?phone=${cleanTarget}`
        });
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
    if (!incomingInfo.fromMe && !incomingInfo.isGroup && incomingInfo.text && cleanTarget) {
      try {
        await processInboundSentimentAndNps({
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

    res.status(200).json({ success: true, result, chatUpdated: Boolean(updatedConv) });
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
              title: `WhatsApp: ${incomingInfo.senderName || cleanTarget}`,
              message: (incomingInfo.text || "Nova mensagem recebida").substring(0, 100),
              type: "whatsapp_message",
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

    let reservationDetails = null;
    if (conv.reservationCode) {
      reservationDetails = (db.reservations || []).find(r => r.code === conv.reservationCode);
    }
    if (!reservationDetails && conv.phone) {
      reservationDetails = findReservationByPhone(db, conv.phone);
    }

    res.json({
      conversation: conv,
      reservation: reservationDetails || null
    });
  });

  // C. Enviar Mensagem pelo Chat (/api/whatsapp/chat/send)
  app.post("/api/whatsapp/chat/send", async (req, res) => {
    const db = getDb();
    ensureDbDefaults();
    syncWhatsappConversationsStore(db);

    const { 
      phone, 
      message = "", 
      mediaUrl = "", 
      fileName = "", 
      mediaType = "text", 
      buttons = [], 
      reservationCode = null,
      quickMessageId = null
    } = req.body;

    const rawPhone = String(phone || "").trim();
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
    let finalMessage = message;
    if (targetRes && finalMessage) {
      finalMessage = resolveWhatsAppTags(finalMessage, targetRes, db, baseUrl);
    }

    const sendOptions = {
      phone: cleanPhone,
      message: finalMessage,
      buttons: Array.isArray(buttons) ? buttons : []
    };

    if (mediaType === "document" || fileName || (mediaUrl && mediaUrl.endsWith(".pdf"))) {
      sendOptions.documentUrl = mediaUrl || db.zapiConfig?.guestGuidePdfUrl || "/api/storage/files/documents/Manual_do_Hospede_CorpFlats.pdf";
      sendOptions.documentName = fileName || db.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf";
      sendOptions.documentCaption = finalMessage || "";
    } else if (mediaType === "image" && mediaUrl) {
      sendOptions.documentUrl = mediaUrl;
      sendOptions.documentName = fileName || "foto.jpg";
      sendOptions.documentCaption = finalMessage || "";
    }

    console.log(`[WhatsApp Live Chat] Enviando mensagem para ${cleanPhone}...`);
    const result = await sendZapiMessage(db.zapiConfig, sendOptions);

    const nowIso = new Date().toISOString();
    const msgType = mediaType === "document" ? "document" : (mediaType === "image" ? "image" : (mediaType === "audio" ? "audio" : "text"));

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
      conversation: updatedConv
    });
  });

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

  // Auto-sincronização de webhooks e notifySentByMe na inicialização
  setTimeout(async () => {
    try {
      const db = getDb();
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

  // ── Background Runner Contínuo (Verifica e Dispara a Cada 60 Segundos) ──────
  let cronCounter = 0;
  setInterval(async () => {
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
          if (!status.connected && db.zapiConfig.connectionState !== "disconnected") {
            console.log("[Z-API Watchdog] Queda de conexão detectada pelo heartbeat proativo!");
            await handleDisconnectionEvent({
              db,
              saveDatabase,
              createNotification,
              reason: status.error || "Desconexão detectada pelo watchdog de integridade da Z-API",
              source: "watchdog_heartbeat",
              details: status
            });
          } else if (status.connected && db.zapiConfig.connectionState === "disconnected") {
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

        // Checagem dinâmica: se for lembrete de pré-checkin e todos os hóspedes já preencheram
        if (item.triggerEvent === "pre_checkin_reminder") {
          const isCheckinDone = resv && (
            resv.checkedInAt || 
            (Array.isArray(resv.guests) && resv.guests.length > 0 && resv.guests.every(g => g.hasCompletedCheckin))
          );
          if (isCheckinDone) {
            console.log(`[Auto-WhatsApp] Descartando lembrete de pré-checkin para ${item.guestName}: ficha já preenchida.`);
            item.status = "cancelled";
            item.error = "Cancelado: check-in digital já preenchido";
            item.updatedAt = nowIso;
            saveDatabase();
            continue;
          }
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

        // Trava de Segurança: Modo de Teste / Sandbox
        if (!isPhoneAllowedInTestMode(item.guestPhone, db.zapiConfig)) {
          console.log(`[Auto-WhatsApp Sandbox] Agendamento para ${item.guestPhone} (${item.recipientName || item.guestName}) CANCELADO da fila: Modo de Teste ativo.`);
          item.status = "cancelled";
          item.error = "Cancelado pelo Modo de Teste: destinatário não está na lista autorizada.";
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        console.log(`[Auto-WhatsApp] Disparando agendamento automático para ${item.recipientName || item.guestName} (${item.recipientType === 'requester' ? 'Solicitante' : 'Hóspede'} / ${item.triggerEvent} / Canal: ${itemChannel || 'Padrão'})...`);
        const result = await sendZapiMessage(db.zapiConfig, {
          phone: item.guestPhone,
          message: item.renderedMessage,
          title: item.title,
          footer: item.footer,
          buttons: item.renderedButtons
        });

        item.status = result.success ? "sent" : "failed";
        item.sentAt = new Date().toISOString();
        item.error = result.error || null;
        item.method = result.method || "automated";

        if (!db.whatsappHistory) db.whatsappHistory = [];
        db.whatsappHistory.push({
          id: `cron_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reservationCode: item.reservationCode,
          guestName: item.guestName,
          guestPhone: item.guestPhone,
          recipientType: item.recipientType || "guest",
          recipientName: item.recipientName || item.guestName,
          triggerEvent: item.triggerEvent,
          message: item.renderedMessage,
          buttons: item.renderedButtons,
          status: item.status,
          method: item.method,
          error: item.error,
          sentAt: item.sentAt
        });

        appendMessageToConversation(db, {
          phone: item.guestPhone,
          senderName: "CorpFlats",
          senderPhone: db?.zapiConfig?.instanceId || "",
          fromMe: true,
          text: item.renderedMessage,
          type: "text",
          buttons: item.renderedButtons,
          triggerEvent: item.triggerEvent,
          reservationCode: item.reservationCode,
          status: result.success ? "read" : "failed",
          timestamp: item.sentAt,
          messageId: result.messageId || `msg_cron_${Date.now()}`
        });

        saveDatabase();
        // Pequena pausa entre mensagens para segurança anti-bloqueio
        await new Promise(r => setTimeout(r, 1500));
      }

      // 2. Garante que reservas confirmadas tenham suas réguas agendadas
      scheduleUpcomingReservationTriggers(db, saveDatabase);

    } catch (err) {
      console.error("[Auto-WhatsApp Cron Error]:", err.message);
    }
  }, 60 * 1000);

  console.log("✓ [Z-API WhatsApp Engine] Inicializado e monitorando réguas de mensagens.");
}

// ── Populador de Fila para Reservas Futuras (Regras por Tempo) ─────────────────
export function scheduleUpcomingReservationTriggers(dbOrGetter, saveDatabase) {
  const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
  if (!db || !db.whatsappTemplates || !db.reservations) return;

  const now = new Date();
  const nowUtc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(nowUtc - (3 * 3600000));
  const todayStr = brDate.toISOString().substring(0, 10);

  const activeTemplates = db.whatsappTemplates.filter(t => t.enabled && t.triggerTiming !== "immediate");
  if (activeTemplates.length === 0) return;

  // Processar reservas ativas/futuras (confirmadas e pré-reservas pendentes)
  const reservationsToProcess = (db.reservations || []).filter(r => 
    r.status !== "cancelada" && 
    r.status !== "cancelled" && 
    r.status !== "CANCELLED" && 
    r.guestPhone &&
    r.checkoutDate && 
    r.checkoutDate >= todayStr
  );

  let hasChanges = false;

  for (const resv of reservationsToProcess) {
    const isCompletedOrCheckedOut = resv.status === "completed" || resv.status === "checkout" || Boolean(resv.checkoutDone);
    const resvChannel = resv.channel || resv.source || "site";
    const recipients = getReservationRecipients(resv, db);

    for (const tpl of activeTemplates) {
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
      const targetsToSchedule = [];

      if (targetMode === "guest" || targetMode === "both") {
        if (recipients.guest.phone) {
          targetsToSchedule.push({
            type: "guest",
            name: recipients.guest.name,
            phone: recipients.guest.phone
          });
        }
      }

      if (targetMode === "requester" || targetMode === "both") {
        if (targetMode === "requester" || recipients.requester.isDifferentFromGuest) {
          if (recipients.requester.phone) {
            targetsToSchedule.push({
              type: "requester",
              name: recipients.requester.name,
              phone: recipients.requester.phone
            });
          } else if (targetMode === "requester" && recipients.guest.phone) {
            targetsToSchedule.push({
              type: "guest",
              name: recipients.guest.name,
              phone: recipients.guest.phone
            });
          }
        }
      }

      if (targetsToSchedule.length === 0 && recipients.guest.phone) {
        targetsToSchedule.push({
          type: "guest",
          name: recipients.guest.name,
          phone: recipients.guest.phone
        });
      }

      for (const targetItem of targetsToSchedule) {
        if (!targetItem.phone) continue;

        // Trava de Segurança: Modo de Teste / Sandbox (não agenda na fila se não for número de teste)
        if (db?.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(targetItem.phone, db?.zapiConfig)) {
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
          (h.status === "sent" || h.status === "delivered")
        );

        if (!alreadyQueued && !alreadySentInHistory) {
          let scheduledTime = calculateScheduledTime(tpl, resv, db);
          let scheduledDate = new Date(scheduledTime);

          // Se a data de checkout é hoje e o horário padrão já passou recentemente (dentro de 6h),
          // agenda para envio em 1 minuto para não perder a solicitação de avaliação no Google
          if (scheduledDate <= now && resv.checkoutDate === todayStr && tpl.triggerEvent === "post_checkout_review") {
            const diffHours = (now.getTime() - scheduledDate.getTime()) / (3600 * 1000);
            if (diffHours >= 0 && diffHours <= 6) {
              scheduledDate = new Date(now.getTime() + 60 * 1000);
              scheduledTime = scheduledDate.toISOString();
            }
          }

          // Apenas agenda se for no futuro (> now)
          if (scheduledDate > now) {
            const baseUrl = "https://corpflats.onrender.com";
            const renderedMessage = resolveWhatsAppTags(tpl.message, resv, db, baseUrl, targetItem.type);
            const renderedButtons = (tpl.buttons || []).map(b => ({
              ...b,
              url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl, targetItem.type) : undefined,
              phone: b.phone ? resolveWhatsAppTags(b.phone, resv, db, baseUrl, targetItem.type) : undefined,
              copyCode: b.copyCode ? resolveWhatsAppTags(b.copyCode, resv, db, baseUrl, targetItem.type) : undefined
            }));

            db.whatsappQueue.push({
              id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              reservationId: resv.id,
              reservationCode: resv.code,
              guestName: resv.guestName,
              guestPhone: targetItem.phone,
              recipientType: targetItem.type,
              recipientName: targetItem.name,
              recipientTarget: targetMode,
              channel: resvChannel,
              triggerEvent: tpl.triggerEvent,
              templateId: tpl.id,
              title: tpl.title,
              footer: tpl.footer,
              documentUrl: (tpl.hasAttachment || tpl.documentUrl) ? tpl.documentUrl : undefined,
              documentName: (tpl.hasAttachment || tpl.documentUrl) ? (tpl.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined,
              scheduledFor: scheduledTime,
              status: "scheduled",
              sentAt: null,
              error: null,
              renderedMessage,
              renderedButtons,
              createdAt: now.toISOString()
            });

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
    if (!db.zapiConfig?.enabled) {
      console.warn(`[WhatsApp Trigger] Evento '${eventName}' para reserva ${reservation?.code || reservation?.id} (${reservation?.guestName}) IGNORADO pois o motor de envio está desativado (zapiConfig.enabled = false).`);
      return;
    }
    if (!reservation) return;

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

    let templates = (db.whatsappTemplates || []).filter(t => 
      t.enabled && 
      t.triggerEvent === eventName && 
      t.triggerTiming === "immediate" &&
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
    }

    const recipients = getReservationRecipients(reservation, db);

    for (const tpl of templates) {
      const targetMode = tpl.recipientTarget || "guest";
      const dispatches = [];

      if (targetMode === "guest" || targetMode === "both") {
        if (recipients.guest.phone) {
          dispatches.push({
            type: "guest",
            name: recipients.guest.name,
            phone: recipients.guest.phone
          });
        }
      }

      if (targetMode === "requester" || targetMode === "both") {
        if (targetMode === "requester" || recipients.requester.isDifferentFromGuest) {
          if (recipients.requester.phone) {
            dispatches.push({
              type: "requester",
              name: recipients.requester.name,
              phone: recipients.requester.phone
            });
          } else if (targetMode === "requester" && recipients.guest.phone) {
            dispatches.push({
              type: "guest",
              name: recipients.guest.name,
              phone: recipients.guest.phone
            });
          }
        }
      }

      if (dispatches.length === 0 && recipients.guest.phone) {
        dispatches.push({
          type: "guest",
          name: recipients.guest.name,
          phone: recipients.guest.phone
        });
      }

      for (const d of dispatches) {
        if (!d.phone) continue;

        // Trava de Segurança: Modo de Teste / Sandbox
        if (db?.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(d.phone, db?.zapiConfig)) {
          console.warn(`[WhatsApp Sandbox] Envio imediato de '${tpl.title}' para ${d.phone} (${d.name}) IGNORADO: Modo de Teste ativo.`);
          continue;
        }

        // Validação anti-duplicação para checkout_completed
        if (eventName === "checkout_completed" || eventName === "on_checkout") {
          const alreadySent = (db.whatsappHistory || []).some(h =>
            (h.reservationCode === reservation.code || h.reservationId === reservation.id) &&
            (h.triggerEvent === "checkout_completed" || h.triggerEvent === "on_checkout") &&
            h.guestPhone === d.phone &&
            (h.status === "sent" || h.status === "delivered")
          );
          if (alreadySent) {
            console.log(`[Z-API Instant Trigger] Mensagem de checkout já foi enviada anteriormente para ${d.phone} (Reserva ${reservation.code}). Ignorando duplicação.`);
            continue;
          }
        }

        const renderedMessage = resolveWhatsAppTags(tpl.message, reservation, db, baseUrl, d.type);
        const renderedButtons = (tpl.buttons || []).map(b => ({
          ...b,
          url: b.url ? resolveWhatsAppTags(b.url, reservation, db, baseUrl, d.type) : undefined,
          phone: b.phone ? resolveWhatsAppTags(b.phone, reservation, db, baseUrl, d.type) : undefined,
          copyCode: b.copyCode ? resolveWhatsAppTags(b.copyCode, reservation, db, baseUrl, d.type) : undefined
        }));

        const hasAttachment = Boolean(tpl.hasAttachment || tpl.documentUrl);
        const docUrl = hasAttachment ? (tpl.documentUrl || db?.zapiConfig?.guestGuidePdfUrl) : undefined;
        const docName = hasAttachment ? (tpl.documentName || db?.zapiConfig?.guestGuidePdfName || "Manual_do_Hospede_CorpFlats.pdf") : undefined;

        console.log(`[Z-API Instant Trigger] Disparando '${tpl.title}' (${d.type === 'requester' ? 'Solicitante: ' + d.name : 'Hóspede: ' + d.name}) para ${d.phone}...`);

        const result = await sendZapiMessage(db.zapiConfig, {
          phone: d.phone,
          message: renderedMessage,
          title: tpl.title,
          footer: tpl.footer,
          buttons: renderedButtons,
          documentUrl: docUrl,
          documentName: docName,
          documentCaption: hasAttachment ? tpl.documentCaption : undefined
        });

        if (!db.whatsappHistory) db.whatsappHistory = [];
        db.whatsappHistory.push({
          id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          reservationCode: reservation.code,
          guestName: reservation.guestName,
          guestPhone: d.phone,
          recipientType: d.type,
          recipientName: d.name,
          triggerEvent: eventName,
          message: renderedMessage,
          buttons: renderedButtons,
          documentUrl: docUrl || null,
          documentName: docName || null,
          status: result.success ? "sent" : "failed",
          method: result.method || "instant_trigger",
          error: result.error || null,
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
          triggerEvent: eventName,
          reservationCode: reservation.code,
          status: result.success ? "read" : "failed",
          timestamp: new Date().toISOString(),
          messageId: result.messageId || `msg_auto_${Date.now()}`
        });

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
 *  - `room_ready_ota`  → para OTAs (booking / airbnb) — mas apenas SE for antes das 14:00;
 *                        se já for 14:00 ou mais, o disparo OTA será feito pelo cron do check-in.
 */
export async function triggerRoomReadyWhatsApp(dbOrGetter, saveDatabase, flatId, flatNumber, baseUrl = "") {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !db.zapiConfig?.enabled) return;

    const todayStr = new Date().toISOString().substring(0, 10);

    // Busca reservas com check-in hoje neste flat
    const arrivingToday = (db.reservations || []).filter(r =>
      r.status !== "cancelada" &&
      r.status !== "checkout" &&
      r.checkinDate === todayStr &&
      (r.flatId === flatId || String(r.flatNumber) === String(flatNumber)) &&
      r.guestPhone
    );

    if (arrivingToday.length === 0) return;

    const checkinTime = db.settings?.checkinTime || "14:00";
    const now = new Date();

    for (const resv of arrivingToday) {
      // Trava de Segurança: Modo de Teste / Sandbox
      if (db?.zapiConfig?.testModeOnly !== false && !isPhoneAllowedInTestMode(resv.guestPhone, db?.zapiConfig)) {
        console.log(`[Room Ready Sandbox] Ignorando disparo de quarto pronto para ${resv.guestPhone} (${resv.guestName}): Modo de Teste ativo.`);
        continue;
      }

      const resvChannel = normalizeReservationChannel(resv.channel || resv.source || "site");
      const isOtaChannel = resvChannel === "booking" || resvChannel === "airbnb";

      // 1. Regra para OTAs (Booking / Airbnb): Liberação a partir das 12:00
      if (isOtaChannel) {
        const otaEarliest = new Date();
        otaEarliest.setHours(12, 0, 0, 0);

        if (now < otaEarliest) {
          console.log(`[Room Ready OTA] Flat ${flatNumber} limpo antes das 12:00 (${now.toLocaleTimeString("pt-BR")}). Agendando disparo para as 12:00 pontualmente.`);
          if (!db.whatsappQueue) db.whatsappQueue = [];
          const defTpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_room_ready_ota") ||
                         DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_room_ready_ota");
          const alreadyQueued = db.whatsappQueue.some(q =>
            (q.reservationCode === resv.code || q.reservationId === resv.id) &&
            q.triggerEvent === "room_ready_ota" &&
            (q.status === "scheduled" || q.status === "sent")
          );
          if (!alreadyQueued && defTpl) {
            const renderedMessage = resolveWhatsAppTags(defTpl.message, resv, db, baseUrl, "guest");
            const renderedButtons = (defTpl.buttons || []).map(b => ({
              ...b,
              url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl, "guest") : undefined
            }));
            db.whatsappQueue.push({
              id: `q_ota_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              reservationId: resv.id,
              reservationCode: resv.code,
              guestName: resv.guestName,
              guestPhone: resv.guestPhone,
              recipientType: "guest",
              recipientName: resv.guestName,
              channel: resvChannel,
              triggerEvent: "room_ready_ota",
              templateId: defTpl.id,
              title: defTpl.title,
              footer: defTpl.footer,
              scheduledFor: otaEarliest.toISOString(),
              status: "scheduled",
              sentAt: null,
              renderedMessage,
              renderedButtons,
              createdAt: now.toISOString()
            });
            if (typeof saveDatabase === "function") saveDatabase();
          }
          continue;
        }
      } else {
        // 2. Regra para Diretas (Site / WhatsApp): Early Check-in a partir das 10:00
        const directEarliest = new Date();
        directEarliest.setHours(10, 0, 0, 0);

        if (now < directEarliest) {
          console.log(`[Room Ready Direct] Flat ${flatNumber} limpo antes das 10:00 (${now.toLocaleTimeString("pt-BR")}). Agendando disparo de early check-in para as 10:00 pontualmente.`);
          if (!db.whatsappQueue) db.whatsappQueue = [];
          const defTpl = (db.whatsappTemplates || []).find(t => t.id === "tpl_room_ready_direct") ||
                         DEFAULT_WHATSAPP_TEMPLATES.find(t => t.id === "tpl_room_ready_direct");
          const alreadyQueued = db.whatsappQueue.some(q =>
            (q.reservationCode === resv.code || q.reservationId === resv.id) &&
            q.triggerEvent === "room_ready" &&
            (q.status === "scheduled" || q.status === "sent")
          );
          if (!alreadyQueued && defTpl) {
            const renderedMessage = resolveWhatsAppTags(defTpl.message, resv, db, baseUrl, "guest");
            const renderedButtons = (defTpl.buttons || []).map(b => ({
              ...b,
              url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl, "guest") : undefined
            }));
            db.whatsappQueue.push({
              id: `q_direct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              reservationId: resv.id,
              reservationCode: resv.code,
              guestName: resv.guestName,
              guestPhone: resv.guestPhone,
              recipientType: "guest",
              recipientName: resv.guestName,
              channel: resvChannel,
              triggerEvent: "room_ready",
              templateId: defTpl.id,
              title: defTpl.title,
              footer: defTpl.footer,
              scheduledFor: directEarliest.toISOString(),
              status: "scheduled",
              sentAt: null,
              renderedMessage,
              renderedButtons,
              createdAt: now.toISOString()
            });
            if (typeof saveDatabase === "function") saveDatabase();
          }
          continue;
        }
      }

      const eventName = isOtaChannel ? "room_ready_ota" : "room_ready";
      console.log(`[Room Ready] Disparando '${eventName}' para ${resv.guestName} (Flat ${flatNumber} / Canal: ${resvChannel})...`);
      await triggerImmediateWhatsApp(db, saveDatabase, eventName, resv, baseUrl);
    }
  } catch (err) {
    console.error("[Room Ready WhatsApp Error]:", err.message);
  }
}
