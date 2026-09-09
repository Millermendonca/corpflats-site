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

// ── Templates Padrão de Alta Conversão & Boas Práticas Hoteleiras ──────────────
export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: "tpl_new_reservation",
    triggerEvent: "reservation_created",
    title: "Nova Reserva • Confirmação & Resumo",
    description: "Enviado imediatamente quando uma nova reserva é criada ou confirmada no sistema/site.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_hospede}}*! 🌟
Sua reserva no *{{nome_hotel}}* está confirmada!

📋 *Resumo da sua Estadia:*
• Código da Reserva: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Entrada (Check-in): *{{data_checkin}} a partir das {{horario_checkin}}*
• Saída (Check-out): *{{data_checkout}} até às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*
• Valor Total: *{{valor_total}}* ({{status_pagamento}})

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
    id: "tpl_reservation_updated",
    triggerEvent: "reservation_updated",
    title: "Modificação de Reserva • Dados Atualizados",
    description: "Enviado quando datas, quarto ou número de hóspedes forem alterados.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! 🔄
Informamos que sua reserva *{{numero_reserva}}* no *{{nome_hotel}}* foi atualizada com sucesso:

• Quarto: *Flat {{quarto}}*
• Período: *{{data_checkin}} às {{horario_checkin}}* até *{{data_checkout}} às {{horario_checkout}}*
• Total de Hóspedes: *{{num_hospedes}}*
• Situação do Pagamento: *{{status_pagamento}}*

Qualquer dúvida, estamos à inteira disposição!`,
    footer: "CorpFlats • Central de Reservas",
    buttons: [
      { id: "btn_portal", type: "URL", label: "🏨 Acessar Minha Reserva", url: "{{link_portal_hospede}}" }
    ]
  },
  {
    id: "tpl_pre_checkin_reminder",
    triggerEvent: "pre_checkin_reminder",
    title: "Lembrete de Pré-Check-in Digital",
    description: "Enviado 24 horas antes do check-in para agilizar o cadastro de portaria.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    triggerTiming: "before_event",
    offsetValue: 24,
    offsetUnit: "hours",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! Tudo bem? ⏳
Sua chegada ao *{{nome_hotel}}* está próxima (*{{data_checkin}}*)!

Para que a portaria do Edifício Soho libere sua entrada imediatamente na chegada, pedimos que adiante o cadastro dos hóspedes pelo link abaixo:`,
    footer: "CorpFlats • Entrada Rápida & Segura",
    buttons: [
      { id: "btn_pre", type: "URL", label: "📝 Preencher Ficha Digital", url: "{{link_checkin_digital}}" }
    ]
  },
  {
    id: "tpl_checkin_day_instructions",
    triggerEvent: "checkin_day_instructions",
    title: "Dia do Check-in • Instruções de Chegada",
    description: "Enviado no dia do check-in às 09:00 com localização, regras e senha de Wi-Fi.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    triggerTiming: "fixed_time_day_of",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "09:00",
    message: `Bom dia, *{{primeiro_nome}}*! ☀️
Hoje é o dia da sua chegada ao *{{nome_hotel}}*!

🔑 *Seu Flat:* {{quarto}}
⏰ *Horário de Check-in:* A partir das {{horario_checkin}}
📍 *Endereço:* {{endereco_hotel}}

Ao chegar, dirija-se à portaria 24h e informe seu nome e o número do seu flat.

📶 *Wi-Fi do Flat:*
• Rede: *{{wifi_rede}}*
• Senha: *{{wifi_senha}}*

Desejamos uma ótima viagem até aqui! Se precisar de suporte, estamos à disposição.`,
    footer: "CorpFlats • Boas-vindas!",
    buttons: [
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
    buttons: [
      { id: "btn_portal", type: "URL", label: "🌐 Abrir Portal do Flat", url: "{{link_portal_hospede}}" },
      { id: "btn_call", type: "CALL", label: "📞 Ligar Administração", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_breakfast_reminder",
    triggerEvent: "breakfast_reminder",
    title: "Café da Manhã • Montagem da Bandeja",
    description: "Enviado às 18:00 da véspera para hóspedes com café agendarem a bandeja.",
    enabled: true,
    channels: ["site", "whatsapp"],
    triggerTiming: "fixed_time_day_before",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "18:00",
    message: `Olá, *{{primeiro_nome}}*! ☕🥐
Está na hora de montar a sua bandeja de café da manhã para amanhã no *Flat {{quarto}}*!

Preparamos tudo fresquinho com frutas, pães e café quente no horário de sua preferência. Escolha seus itens favoritos clicando no botão abaixo:`,
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
    id: "tpl_post_checkout_review",
    triggerEvent: "post_checkout_review",
    title: "Pós Check-out • Agradecimento & Avaliação Google",
    description: "Enviado 2 horas após a saída convidando para avaliação 5 estrelas no Google.",
    enabled: true,
    channels: ["site", "whatsapp", "booking", "airbnb", "outros"],
    triggerTiming: "after_event",
    offsetValue: 2,
    offsetUnit: "hours",
    fixedTime: "",
    message: `Olá, *{{primeiro_nome}}*! 💙
Foi um prazer imenso ter você conosco no *{{nome_hotel}}*!

Esperamos que sua hospedagem tenha sido nota 10. Você poderia nos dedicar 30 segundos deixando sua avaliação no Google?

Sua opinião ajuda outros hóspedes e motiva nossa equipe a evoluir sempre:`,
    footer: "CorpFlats • Até a próxima!",
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
    title: "Cobrança • Pagamento Pendente / Concluir Reserva",
    description: "Enviado quando uma reserva está com status Aguardando Pagamento, com links para PIX e Cartão de Crédito.",
    enabled: true,
    channels: ["site", "whatsapp"],
    triggerTiming: "immediate",
    offsetValue: 0,
    offsetUnit: "minutes",
    fixedTime: "",
    message: `Olá, *{{nome_hospede}}*! ⏳
Sua pré-reserva no *{{nome_hotel}}* foi recebida e está *Aguardando Pagamento* para confirmação definitiva:

📋 *Detalhes da Estadia:*
• Código: *{{numero_reserva}}*
• Acomodação: *Flat {{quarto}}*
• Período: *{{data_checkin}} a {{data_checkout}}*
• Valor Pendente: *{{valor_total}}*

Para garantir sua acomodação, você pode pagar via PIX ou em até 12x no cartão de crédito acessando o portal seguro abaixo:`,
    footer: "CorpFlats • Pagamento Seguro",
    buttons: [
      { id: "btn_pagar", type: "URL", label: "💳 Pagar e Confirmar", url: "{{link_portal_hospede}}" },
      { id: "btn_chk", type: "URL", label: "🏨 Ver Minha Reserva", url: "{{link_portal_hospede}}" }
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

// ── Motor de Resolução de Tags Dinâmicas ───────────────────────────────────────
export function resolveWhatsAppTags(text, reservation = {}, db = {}, baseUrl = "") {
  if (!text) return "";

  const guestName = reservation.guestName || "Hóspede";
  const firstName = guestName.trim().split(" ")[0] || guestName;
  const flatNumber = reservation.flatNumber || reservation.flatId || "Pendente";
  const resCode = reservation.code || reservation.reservationCode || `RES-${flatNumber}-${reservation.id || "0000"}`;
  
  const checkinBr = formatDateBr(reservation.checkinDate);
  const checkoutBr = formatDateBr(reservation.checkoutDate);
  
  const checkinTime = db.settings?.checkinTime || "14:00";
  const checkoutTime = db.settings?.checkoutTime || "12:00";
  
  const guestCount = reservation.guestCount || reservation.adults || 1;
  const chanLower = String(reservation.channel || "").toLowerCase();
  const isOta = chanLower.includes("booking") || chanLower.includes("airbnb");
  const isPaid = isOta || reservation.paymentStatus === "pago" || reservation.paymentStatus === "pago_total" || (Number(reservation.paidAmount) >= Number(reservation.totalAmount) && Number(reservation.totalAmount) > 0);
  const paymentStatus = isPaid
    ? "Confirmado / Pago" 
    : "Aguardando Pagamento";
  const channel = reservation.channel || "Site CorpFlats";
  
  const hotelName = db.siteConfig?.branding?.brandName || "CorpFlats";
  const hotelAddress = db.settings?.hotelAddress || "Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ";
  const mapsUrl = db.settings?.googleMapsUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ";
  
  const zapiCfg = db.zapiConfig || {};
  const wifiNetwork = zapiCfg.wifiNetwork || "CorpFlats-Hospedes";
  const wifiPassword = zapiCfg.wifiPassword || "corpflats2026";
  const adminWhatsApp = db.settings?.adminWhatsApp || "5522997124021";
  const googleReviewUrl = zapiCfg.googleReviewUrl || "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ";

  // URL Base pública do sistema (prioriza domínio de produção ou host)
  const appOrigin = baseUrl || "https://corpflats.onrender.com";

  // Links inteligentes com autenticação por código de reserva
  const linkCheckinDigital = `${appOrigin}/pre-checkin/${resCode}`;
  const linkPortalHospede = `${appOrigin}/minha-reserva/${resCode}`;
  const linkPagamento = `${appOrigin}/minha-reserva/${resCode}`;
  const linkCafeManha = `${appOrigin}/cafe/${resCode}`;
  const linkCheckout = `${appOrigin}/checkout/${resCode}`;

  let totalNights = 1;
  if (reservation.checkinDate && reservation.checkoutDate) {
    const d1 = new Date(reservation.checkinDate);
    const d2 = new Date(reservation.checkoutDate);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) totalNights = diff;
  }

  const tagsMap = {
    "{{nome_hospede}}": guestName,
    "{{primeiro_nome}}": firstName,
    "{{telefone_hospede}}": reservation.guestPhone || "",
    "{{numero_reserva}}": resCode,
    "{{quarto}}": flatNumber,
    "{{data_checkin}}": checkinBr,
    "{{data_checkout}}": checkoutBr,
    "{{horario_checkin}}": checkinTime,
    "{{horario_checkout}}": checkoutTime,
    "{{num_hospedes}}": String(guestCount),
    "{{num_diarias}}": String(totalNights),
    "{{valor_total}}": formatCurrency(reservation.totalAmount || 0),
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
    "{{link_avaliacao_google}}": googleReviewUrl
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
  const validButtons = (buttons || []).filter(b => b && b.label && (b.url || b.phone || b.type === "REPLY"));

  if (validButtons.length > 0) {
    const linkItems = validButtons
      .filter(b => b.url || b.phone)
      .map(b => {
        if (b.type === "CALL" || b.phone) {
          return `📞 *${b.label}:* ${b.phone}`;
        }
        return `👉 *${b.label}:*\n${b.url}`;
      });

    if (linkItems.length > 0) {
      text += `\n\n🔗 *Links de Acesso Rápido:*\n` + linkItems.join("\n\n");
    }
  }

  if (footer) {
    text += `\n\n_${footer}_`;
  }

  return text;
}

// ── Disparo Oficial Z-API ──────────────────────────────────────────────────────
export async function sendZapiMessage(config, { phone, message, title = "", footer = "", buttons = [], sendMode = "auto" }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  const fallbackToText = config?.fallbackToText !== false;
  const configuredDeliveryMode = config?.deliveryMode || "text_links"; // "text_links" (padrão 100% seguro contra bloqueios de botões da Meta), "buttons", "auto"

  // Se não configurado, simula sucesso em ambiente de desenvolvimento/teste sem travar
  if (!instanceId || !token) {
    console.warn(`[Z-API Mock] Credenciais não configuradas. Mensagem para ${cleanPhone} simulada.`);
    return {
      success: true,
      simulated: true,
      messageId: `mock_${Date.now()}`,
      phone: cleanPhone,
      message: message
    };
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
        return {
          success: true,
          method: "text_links",
          messageId: data.zaapId || data.id,
          data
        };
      }

      return {
        success: false,
        error: data.message || data.error || `Erro HTTP ${res.status} ao enviar texto via Z-API`
      };
    } catch (err) {
      console.error(`[Z-API] Exceção ao enviar texto:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // 2. Tentativa com Botões Interativos (/send-button-actions)
  const buttonActionsUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-actions`;

  // Tratamento e validação estrita conforme documentação oficial da Z-API (developer.z-api.io):
  // 1. WhatsApp rejeita misturar botões REPLY com CALL/URL simultaneamente.
  // 2. URLs devem obrigatoriamente iniciar com http:// ou https://.
  // 3. Suporte ao link nativo de cópia OTP do WhatsApp: https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=...
  // 4. Telefones para CALL devem conter DDI + DDD + números limpos.
  const hasCallOrUrl = validButtons.some(b => b.type === "CALL" || b.type === "URL");
  const hasReply = validButtons.some(b => b.type === "REPLY");

  let filteredButtons = validButtons;
  if (hasCallOrUrl && hasReply) {
    console.warn("[Z-API] Mistura de botões REPLY com CALL/URL detectada. Priorizando CALL e URL para evitar rejeição pelo WhatsApp Web.");
    filteredButtons = validButtons.filter(b => b.type !== "REPLY");
  }

  const formattedActions = filteredButtons.slice(0, 3).map((b, idx) => {
    let type = (b.type || "URL").toUpperCase();
    if (type !== "CALL" && type !== "REPLY") type = "URL";

    const action = {
      id: String(b.id || `btn_${idx + 1}`),
      type,
      label: String(b.label || "Acessar").trim().substring(0, 25)
    };

    if (type === "URL") {
      let rawUrl = String(b.url || "").trim();
      if (b.copyCode) {
        rawUrl = `https://www.whatsapp.com/otp/code/?otp_type=COPY_CODE&code=${encodeURIComponent(b.copyCode)}`;
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
    ...(title ? { title } : {}),
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
      return {
        success: true,
        method: "buttons",
        messageId: data.zaapId || data.id || "ok",
        data
      };
    }

    console.warn(`[Z-API] Falha ao enviar com botões (HTTP ${res.status}):`, data);

    // Se der erro nos botões e fallback de texto estiver ativo, converte para texto normal com links
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
        return {
          success: true,
          method: "fallback_text",
          warning: "A Z-API ou WhatsApp não renderizou os botões interativos (exigência de aceite dos termos de botões no painel da Z-API ou limitação da Meta). Mensagem entregue via texto com os links diretos.",
          buttonError: data.message || data.error || `Erro HTTP ${res.status}`,
          messageId: textData.zaapId || textData.id,
          data: textData
        };
      }
    }

    return {
      success: false,
      error: data.message || data.error || `Erro HTTP ${res.status} na Z-API`
    };
  } catch (err) {
    console.error(`[Z-API] Exceção no envio:`, err.message);
    return { success: false, error: err.message };
  }
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

  return now.toISOString();
}

// ── Gerenciador da Fila & Background Scheduler ────────────────────────────────
export function initWhatsAppEngine(app, dbOrGetter, saveDatabase) {
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
        googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
      };
    } else if (!db.zapiConfig.deliveryMode) {
      db.zapiConfig.deliveryMode = "text_links";
    }

    if (!db.whatsappTemplates || db.whatsappTemplates.length === 0) {
      db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES;
    } else {
      for (const defTpl of DEFAULT_WHATSAPP_TEMPLATES) {
        if (!db.whatsappTemplates.some(t => t.id === defTpl.id)) {
          db.whatsappTemplates.push(defTpl);
        }
      }
      // Garante que templates existentes possuam a propriedade channels inicializada
      for (const tpl of db.whatsappTemplates) {
        if (!tpl.channels || !Array.isArray(tpl.channels) || tpl.channels.length === 0) {
          if (tpl.id === "tpl_breakfast_reminder") {
            tpl.channels = ["site", "whatsapp"];
          } else {
            tpl.channels = ["site", "whatsapp", "booking", "airbnb", "outros"];
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
    }

    if (!db.whatsappQueue) {
      db.whatsappQueue = [];
    }

    if (!db.whatsappHistory) {
      db.whatsappHistory = [];
    }
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
      buttons: item.renderedButtons
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
      status: item.status,
      method: item.method,
      error: item.error,
      sentAt: item.sentAt
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
      sendMode = "text" // Padrão seguro para entrega garantida em qualquer conta
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

    const result = await sendZapiMessage(db?.zapiConfig, {
      phone,
      message: finalMessage,
      title,
      footer,
      buttons: finalButtons,
      sendMode
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
      status: result.success ? "sent" : "failed",
      method: result.method || (sendMode === "text" ? "text_links" : "buttons"),
      error: result.error || null,
      sentAt: new Date().toISOString()
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
      if (templateId === "tpl_payment_pending" || templateId === "qm_payment_pending") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_payment_pending") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_payment_pending");
      } else if (templateId === "tpl_new_reservation" || templateId === "qm_summary_checkin") {
        template = (db?.whatsappQuickMessages || []).find(t => t.id === "qm_summary_checkin") || (db?.whatsappTemplates || []).find(t => t.id === "tpl_new_reservation");
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
    const renderedMessage = resolveWhatsAppTags(template.message, reservation, db, baseUrl);
    const renderedButtons = (template.buttons || []).map(b => ({
      ...b,
      url: b.url ? resolveWhatsAppTags(b.url, reservation, db, baseUrl) : undefined,
      phone: b.phone ? resolveWhatsAppTags(b.phone, reservation, db, baseUrl) : undefined
    }));

    const result = await sendZapiMessage(db?.zapiConfig, {
      phone: reservation.guestPhone,
      message: renderedMessage,
      title: template.title,
      footer: template.footer,
      buttons: renderedButtons
    });

    if (!db.whatsappHistory) db.whatsappHistory = [];
    db.whatsappHistory.push({
      id: `manual_${Date.now()}`,
      reservationCode: reservation.code || reservation.reservationCode || String(reservation.id),
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone,
      triggerEvent: template.triggerEvent,
      message: renderedMessage,
      buttons: renderedButtons,
      status: result.success ? "sent" : "failed",
      method: result.method || "manual",
      error: result.error || null,
      sentAt: new Date().toISOString()
    });
    saveDatabase();

    res.json(result);
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

  // ── Background Runner Contínuo (Verifica e Dispara a Cada 60 Segundos) ──────
  setInterval(async () => {
    try {
      const db = getDb();
      if (!db || !db.zapiConfig?.enabled) return;

      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Processa itens da fila que atingiram o horário de disparo
      const pendingItems = (db.whatsappQueue || []).filter(item => 
        item.status === "scheduled" && item.scheduledFor <= nowIso
      );

      for (const item of pendingItems) {
        // Revalidação de segurança: se o template desautorizou este canal após o agendamento
        const tpl = (db.whatsappTemplates || []).find(t => t.id === item.templateId);
        const itemChannel = item.channel || (db.reservations || []).find(r => r.id === item.reservationId || r.code === item.reservationCode)?.channel;
        if (tpl && itemChannel && !isTemplateAllowedForChannel(tpl, itemChannel)) {
          console.log(`[Auto-WhatsApp] Cancelando disparo agendado de ${item.guestName}: canal '${itemChannel}' desativado no template '${tpl.title}'`);
          item.status = "cancelled";
          item.error = `Canal '${itemChannel}' desativado nas regras do template`;
          item.updatedAt = nowIso;
          saveDatabase();
          continue;
        }

        console.log(`[Auto-WhatsApp] Disparando agendamento automático para ${item.guestName} (${item.triggerEvent} / Canal: ${itemChannel || 'Padrão'})...`);
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
          triggerEvent: item.triggerEvent,
          message: item.renderedMessage,
          buttons: item.renderedButtons,
          status: item.status,
          method: item.method,
          error: item.error,
          sentAt: item.sentAt
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
  const activeTemplates = db.whatsappTemplates.filter(t => t.enabled && t.triggerTiming !== "immediate");
  if (activeTemplates.length === 0) return;

  const confirmedReservations = (db.reservations || []).filter(r => 
    r.status !== "cancelada" && r.status !== "checkout" && r.guestPhone
  );

  let hasChanges = false;

  for (const resv of confirmedReservations) {
    const resvChannel = resv.channel || resv.source || "site";

    for (const tpl of activeTemplates) {
      // 1. Verifica se o canal da reserva está permitido no template (ex: site/whatsapp sim, booking/airbnb não)
      if (!isTemplateAllowedForChannel(tpl, resvChannel)) {
        continue;
      }

      // 2. Ignora café da manhã se reserva não inclui café
      if (tpl.triggerEvent === "breakfast_reminder" && !resv.includeBreakfast) {
        continue;
      }

      // Verifica se já existe agendamento ou envio para essa combinação
      const alreadyQueued = (db.whatsappQueue || []).some(q => 
        (q.reservationCode === resv.code || q.reservationId === resv.id) &&
        q.triggerEvent === tpl.triggerEvent &&
        (q.status === "scheduled" || q.status === "sent")
      );

      if (!alreadyQueued) {
        const scheduledTime = calculateScheduledTime(tpl, resv, db);
        const scheduledDate = new Date(scheduledTime);

        // Se a data de agendamento for futura (ou de até 30 min atrás), coloca na fila
        const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
        if (scheduledDate >= thirtyMinAgo) {
          const baseUrl = "https://corpflats.onrender.com";
          const renderedMessage = resolveWhatsAppTags(tpl.message, resv, db, baseUrl);
          const renderedButtons = (tpl.buttons || []).map(b => ({
            ...b,
            url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl) : undefined,
            phone: b.phone ? resolveWhatsAppTags(b.phone, resv, db, baseUrl) : undefined
          }));

          db.whatsappQueue.push({
            id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            reservationId: resv.id,
            reservationCode: resv.code,
            guestName: resv.guestName,
            guestPhone: resv.guestPhone,
            channel: resvChannel,
            triggerEvent: tpl.triggerEvent,
            templateId: tpl.id,
            title: tpl.title,
            footer: tpl.footer,
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

  if (hasChanges && typeof saveDatabase === "function") {
    saveDatabase();
  }
}

// ── Disparo Imediato ao Ocorrer Evento (Nova Reserva, Cancelamento, etc.) ──────
export async function triggerImmediateWhatsApp(dbOrGetter, saveDatabase, eventName, reservation, baseUrl = "") {
  try {
    const db = typeof dbOrGetter === "function" ? dbOrGetter() : dbOrGetter;
    if (!db || !db.zapiConfig?.enabled) return;
    if (!reservation || !reservation.guestPhone) return;

    const resvChannel = reservation.channel || reservation.source || "site";

    const templates = (db.whatsappTemplates || []).filter(t => 
      t.enabled && 
      t.triggerEvent === eventName && 
      t.triggerTiming === "immediate" &&
      isTemplateAllowedForChannel(t, resvChannel)
    );

    for (const tpl of templates) {
      const renderedMessage = resolveWhatsAppTags(tpl.message, reservation, db, baseUrl);
      const renderedButtons = (tpl.buttons || []).map(b => ({
        ...b,
        url: b.url ? resolveWhatsAppTags(b.url, reservation, db, baseUrl) : undefined,
        phone: b.phone ? resolveWhatsAppTags(b.phone, reservation, db, baseUrl) : undefined
      }));

      console.log(`[Z-API Instant Trigger] Disparando '${tpl.title}' para ${reservation.guestName} (${reservation.guestPhone})...`);

      const result = await sendZapiMessage(db.zapiConfig, {
        phone: reservation.guestPhone,
        message: renderedMessage,
        title: tpl.title,
        footer: tpl.footer,
        buttons: renderedButtons
      });

      if (!db.whatsappHistory) db.whatsappHistory = [];
      db.whatsappHistory.push({
        id: `auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        reservationCode: reservation.code,
        guestName: reservation.guestName,
        guestPhone: reservation.guestPhone,
        triggerEvent: eventName,
        message: renderedMessage,
        buttons: renderedButtons,
        status: result.success ? "sent" : "failed",
        method: result.method || "instant_trigger",
        error: result.error || null,
        sentAt: new Date().toISOString()
      });

      if (typeof saveDatabase === "function") {
        saveDatabase();
      }
    }
  } catch (err) {
    console.error(`[Z-API Instant Trigger Error]:`, err.message);
  }
}
