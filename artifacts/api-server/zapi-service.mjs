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

// ── Templates Padrão de Alta Conversão & Boas Práticas Hoteleiras ──────────────
export const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    id: "tpl_new_reservation",
    triggerEvent: "reservation_created",
    title: "Nova Reserva • Confirmação & Resumo",
    description: "Enviado imediatamente quando uma nova reserva é criada ou confirmada no sistema/site.",
    enabled: true,
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
      { id: "btn_call", type: "CALL", label: "📞 Ligar Recepção", phone: "{{telefone_hotel}}" }
    ]
  },
  {
    id: "tpl_breakfast_reminder",
    triggerEvent: "breakfast_reminder",
    title: "Café da Manhã • Montagem da Bandeja",
    description: "Enviado às 18:00 da véspera para hóspedes com café agendarem a bandeja.",
    enabled: true,
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
    triggerTiming: "fixed_time_day_of",
    offsetValue: 0,
    offsetUnit: "hours",
    fixedTime: "09:30",
    message: `Bom dia, *{{primeiro_nome}}*! ☀️
Lembramos que hoje é a data de encerramento da sua estadia no *Flat {{quarto}}*.

⏰ *Horário limite de saída:* Até às *{{horario_checkout}}*.

Ao sair, por favor certifique-se de desligar luzes e ar-condicionado e entregue as chaves/cartão na portaria.
Caso necessite estender o horário (Late Check-out), solicite diretamente à recepção.`,
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
  }
];

// ── Sanitização de Telefone WhatsApp ───────────────────────────────────────────
export function cleanWhatsAppPhone(rawPhone) {
  if (!rawPhone) return "";
  let digits = String(rawPhone).replace(/\D/g, "");
  if (!digits) return "";
  
  // Remove zero à esquerda
  if (digits.startsWith("0")) digits = digits.substring(1);

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
  const paymentStatus = (reservation.paymentStatus === "pago" || (reservation.paidAmount >= reservation.totalAmount && reservation.totalAmount > 0))
    ? "Confirmado / Pago" 
    : "Pendente";
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
  const linkPortalHospede = `${appOrigin}/portal-hospede/${resCode}`;
  const linkCafeManha = `${appOrigin}/cafe/${resCode}`;
  const linkCheckout = `${appOrigin}/checkout?code=${resCode}`;

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

// ── Disparo Oficial Z-API ──────────────────────────────────────────────────────
export async function sendZapiMessage(config, { phone, message, title = "", footer = "", buttons = [] }) {
  const cleanPhone = cleanWhatsAppPhone(phone);
  if (!cleanPhone) {
    return { success: false, error: "Número de WhatsApp do destinatário inválido ou ausente." };
  }

  const instanceId = config?.instanceId?.trim();
  const token = config?.token?.trim();
  const clientToken = config?.clientToken?.trim();
  const fallbackToText = config?.fallbackToText !== false;

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

  // 1. Tentativa com Botões Interativos (/send-button-actions)
  if (validButtons.length > 0) {
    const buttonActionsUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-button-actions`;
    const buttonActionsPayload = {
      phone: cleanPhone,
      message: message,
      ...(title ? { title } : {}),
      ...(footer ? { footer } : {}),
      buttonActions: validButtons.slice(0, 3).map((b, idx) => ({
        id: b.id || `btn_${idx + 1}`,
        type: b.type || "URL",
        label: b.label.substring(0, 20), // Z-API recomenda labels concisos
        ...(b.type === "URL" ? { url: b.url } : {}),
        ...(b.type === "CALL" ? { phone: cleanWhatsAppPhone(b.phone || config.adminWhatsApp || "5522997124021") } : {})
      }))
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
        console.log(`[Z-API ✓] Mensagem com botões entregue para ${cleanPhone}. ID: ${data.zaapId || data.id}`);
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
        let textWithLinks = message;
        
        const linksList = validButtons
          .filter(b => b.url)
          .map(b => `👉 *${b.label}:* ${b.url}`)
          .join("\n");
        
        if (linksList) {
          textWithLinks += `\n\n📌 *Acesse pelos links:*\n${linksList}`;
        }
        if (footer) {
          textWithLinks += `\n\n_${footer}_`;
        }

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
            warning: "Destinatário ou conta não suporta botões interativos. Mensagem entregue via texto tradicional com os links integrados.",
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

  // 2. Envio de Texto Simples (/send-text)
  const sendTextUrl = `${baseUrl}/instances/${instanceId}/token/${token}/send-text`;
  try {
    let finalMessage = message;
    if (footer) {
      finalMessage += `\n\n_${footer}_`;
    }

    const res = await fetch(sendTextUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: cleanPhone, message: finalMessage })
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && (data.zaapId || data.id)) {
      return {
        success: true,
        method: "text",
        messageId: data.zaapId || data.id,
        data
      };
    }
    return {
      success: false,
      error: data.message || data.error || `Erro HTTP ${res.status}`
    };
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
  const headers = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const res = await fetch(statusUrl, { headers });
    const data = await res.json();
    return {
      connected: Boolean(data.connected),
      configured: true,
      smartphone: data.smartphone || null,
      phone: data.phone || data.smartphone?.phone || "",
      battery: data.battery || data.smartphone?.battery || null,
      details: data
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
export function initWhatsAppEngine(app, db, saveDatabase) {
  // Inicialização no banco caso não existam
  if (!db.zapiConfig) {
    db.zapiConfig = {
      instanceId: "",
      token: "",
      clientToken: "",
      enabled: false,
      fallbackToText: true,
      wifiNetwork: "CorpFlats-Hospedes",
      wifiPassword: "corpflats2026",
      googleReviewUrl: "https://maps.google.com/?q=Rua+Conselheiro+Otaviano,+209+-+Centro,+Campos+dos+Goytacazes+-+RJ"
    };
  }

  if (!db.whatsappTemplates || db.whatsappTemplates.length === 0) {
    db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES;
  }

  if (!db.whatsappQueue) {
    db.whatsappQueue = [];
  }

  if (!db.whatsappHistory) {
    db.whatsappHistory = [];
  }

  // ── Rotas Express do WhatsApp ───────────────────────────────────────────────

  // 1. Obter Configurações
  app.get("/api/whatsapp/config", (req, res) => {
    res.json(db.zapiConfig || {});
  });

  // 2. Salvar Configurações
  app.post("/api/whatsapp/config", (req, res) => {
    db.zapiConfig = {
      ...db.zapiConfig,
      ...req.body
    };
    saveDatabase();
    res.json({ success: true, config: db.zapiConfig });
  });

  // 3. Status Z-API
  app.get("/api/whatsapp/status", async (req, res) => {
    const status = await getZapiStatus(db.zapiConfig);
    res.json(status);
  });

  // 4. QR Code Z-API
  app.get("/api/whatsapp/qr-code", async (req, res) => {
    const qr = await getZapiQrCode(db.zapiConfig);
    res.json(qr);
  });

  // 5. Listar Templates
  app.get("/api/whatsapp/templates", (req, res) => {
    res.json(db.whatsappTemplates || []);
  });

  // 6. Salvar / Atualizar Templates
  app.post("/api/whatsapp/templates", (req, res) => {
    const incoming = req.body;
    if (Array.isArray(incoming)) {
      db.whatsappTemplates = incoming;
    } else if (incoming && incoming.id) {
      const idx = (db.whatsappTemplates || []).findIndex(t => t.id === incoming.id);
      if (idx >= 0) {
        db.whatsappTemplates[idx] = incoming;
      } else {
        db.whatsappTemplates.push(incoming);
      }
    }
    saveDatabase();
    res.json({ success: true, templates: db.whatsappTemplates });
  });

  // 7. Restaurar Templates Originais
  app.post("/api/whatsapp/reset-templates", (req, res) => {
    db.whatsappTemplates = DEFAULT_WHATSAPP_TEMPLATES;
    saveDatabase();
    res.json({ success: true, templates: db.whatsappTemplates });
  });

  // 8. Fila de Envios Agendados & Histórico
  app.get("/api/whatsapp/queue", (req, res) => {
    const queue = (db.whatsappQueue || []).slice(-150).reverse();
    const history = (db.whatsappHistory || []).slice(-100).reverse();
    res.json({ queue, history });
  });

  // 9. Ação "Enviar Agora" (Antecipar Disparo Manual)
  app.post("/api/whatsapp/queue/:id/send-now", async (req, res) => {
    const id = req.params.id;
    const item = (db.whatsappQueue || []).find(q => q.id === id);
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
    const id = req.params.id;
    const item = (db.whatsappQueue || []).find(q => q.id === id);
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
    const { phone, message, title = "", footer = "", buttons = [], reservationId = null } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: "Informe o número de telefone para o teste." });
    }

    let finalMessage = message || "Mensagem de teste CorpFlats Z-API";
    let finalButtons = buttons || [];

    // Se vinculou uma reserva para o teste, resolve as tags reais
    if (reservationId) {
      const resv = (db.reservations || []).find(r => r.id === Number(reservationId) || r.code === String(reservationId));
      if (resv) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        finalMessage = resolveWhatsAppTags(finalMessage, resv, db, baseUrl);
        finalButtons = finalButtons.map(b => ({
          ...b,
          url: b.url ? resolveWhatsAppTags(b.url, resv, db, baseUrl) : undefined,
          phone: b.phone ? resolveWhatsAppTags(b.phone, resv, db, baseUrl) : undefined
        }));
      }
    }

    const result = await sendZapiMessage(db.zapiConfig, {
      phone,
      message: finalMessage,
      title,
      footer,
      buttons: finalButtons
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
      method: result.method || "test",
      error: result.error || null,
      sentAt: new Date().toISOString()
    });
    saveDatabase();

    res.json(result);
  });

  // 12. Disparo de Template para Reserva Específica (ex: do PMS ou CRM)
  app.post("/api/whatsapp/dispatch-reservation", async (req, res) => {
    const { templateId, reservationCode } = req.body;
    const template = (db.whatsappTemplates || []).find(t => t.id === templateId);
    if (!template) {
      return res.status(404).json({ error: "Template não encontrado." });
    }

    const reservation = (db.reservations || []).find(r => 
      r.code?.toUpperCase() === reservationCode?.toUpperCase() || 
      String(r.id) === String(reservationCode)
    );
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

    const result = await sendZapiMessage(db.zapiConfig, {
      phone: reservation.guestPhone,
      message: renderedMessage,
      title: template.title,
      footer: template.footer,
      buttons: renderedButtons
    });

    db.whatsappHistory.push({
      id: `manual_${Date.now()}`,
      reservationCode: reservation.code,
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

  // ── Background Runner Contínuo (Verifica e Dispara a Cada 60 Segundos) ──────
  setInterval(async () => {
    try {
      if (!db.zapiConfig?.enabled) return;

      const now = new Date();
      const nowIso = now.toISOString();

      // 1. Processa itens da fila que atingiram o horário de disparo
      const pendingItems = (db.whatsappQueue || []).filter(item => 
        item.status === "scheduled" && item.scheduledFor <= nowIso
      );

      for (const item of pendingItems) {
        console.log(`[Auto-WhatsApp] Disparando agendamento automático para ${item.guestName} (${item.triggerEvent})...`);
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
export function scheduleUpcomingReservationTriggers(db, saveDatabase) {
  if (!db.whatsappTemplates || !db.reservations) return;

  const now = new Date();
  const activeTemplates = db.whatsappTemplates.filter(t => t.enabled && t.triggerTiming !== "immediate");
  if (activeTemplates.length === 0) return;

  const confirmedReservations = (db.reservations || []).filter(r => 
    r.status !== "cancelada" && r.status !== "checkout" && r.guestPhone
  );

  let hasChanges = false;

  for (const resv of confirmedReservations) {
    for (const tpl of activeTemplates) {
      // Ignora café da manhã se reserva não inclui café
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
export async function triggerImmediateWhatsApp(db, saveDatabase, eventName, reservation, baseUrl = "") {
  try {
    if (!db.zapiConfig?.enabled) return;
    if (!reservation || !reservation.guestPhone) return;

    const templates = (db.whatsappTemplates || []).filter(t => 
      t.enabled && t.triggerEvent === eventName && t.triggerTiming === "immediate"
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
