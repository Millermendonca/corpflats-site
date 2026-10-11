/**
 * CorpFlats / Guest Flow Manager - WhatsApp AI Agent Service
 * 
 * Recursos:
 * - Atuação Híbrida: Respostas autônomas no WhatsApp via Z-API e Copiloto para operadores
 * - Transbordo Humano Inteligente: Pausa automática da IA ao detectar pedido de atendente ou intervenção humana
 * - Reconhecimento de Contexto do Hóspede: Consulta em tempo real de reservas, flats e status de limpeza/liberação
 * - Google Gemini AI com cascata de modelos e Contingência Heurística Local garantida
 * - Function Calling Adaptativo: Chave mestra e ações granulares (checkAvailability, calculateQuote, generatePayment, createPreReservation, commitReservation)
 * - Loop Multi-Turn de Execução de Ferramentas com fallback gracioso e proteção anti-crash
 * - Base de conhecimento rica sobre o CorpFlats (Wi-Fi, garagem, café, horários, localização, comodidades)
 */

import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES, isFaqApplicableToClient, matchClientPhone, generateStaticPixPayload, linkOperatorResponseToPendingFaq, captureOperatorResponseForFaq } from "./zapi-service.mjs";
import { getCheckinUrlSync as getSerproCheckinUrlSync } from "./fnrh-serpro-service.mjs";

export { isFaqApplicableToClient, matchClientPhone, linkOperatorResponseToPendingFaq, captureOperatorResponseForFaq };

/**
 * Resolução dinâmica e unificada de URL de check-in para o agente de IA WhatsApp
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
  const internalCheckinUrl = `${hostBase}/pre-checkin/${resCode}?guest=${safeGuestIndex}`;

  if (currentProvider === "gov_fnrh" && (reservation?.serproPrecheckinUrl || reservation?.link_precheckin)) {
    return reservation.serproPrecheckinUrl || reservation.link_precheckin;
  }

  return internalCheckinUrl;
}

export const DEFAULT_AI_CONFIG = {
  enabled: true,
  mode: "autonomous", // "autonomous" | "copilot" | "off_hours"
  agentName: "Sofia",
  agentRole: "Concierge Virtual CorpFlats",
  responseDelaySeconds: 3,
  offHoursStart: "18:00",
  offHoursEnd: "08:00",
  handoverKeywords: [
    "humano", "atendente", "falar com pessoa", "falar com atendente",
    "gerente", "recepcao", "recepção", "pessoa real", "outro atendente",
    "reclamar", "reclamacao", "reclamação", "cancelar reserva", "cancelamento",
    "falar com alguém", "suporte humano", "atendimento humano"
  ],
  systemPrompt: `Você é a Sofia, concierge virtual inteligente e acolhedora dos flats de alto padrão da CorpFlats em Campos dos Goytacazes/RJ.
Seu objetivo é encantar os hóspedes, responder dúvidas com precisão e fornecer assistência ágil e atenciosa.

DIRETRIZES DE ATENDIMENTO:
1. Responda em português brasileiro de forma acolhedora, prestativa e concisa (ideal para leitura dinâmica em telas de celular no WhatsApp).
2. Use emojis amigáveis com moderação (🏨, ✨, 🔑, ☕, 🚗, 🕒, 📍).
3. Seja sempre fidedigna às informações fornecidas no CONTEXTO DO HÓSPEDE e na BASE DE CONHECIMENTO. NUNCA invente números de apartamentos, códigos ou senhas que não constem nos dados oficiais.
4. Se o hóspede solicitar expressamente falar com um atendente humano, transborde o atendimento com gentileza informando que a equipe da recepção assumirá a conversa em instantes.
5. Para hóspedes que chegam hoje: confira o status de limpeza informado no contexto. Se estiver "LIMPO E LIBERADO", comemore que o apartamento já está pronto para recebê-lo! Se estiver "EM PREPARAÇÃO", informe que a governança está caprichando na higienização para liberar o flat até o horário oficial das 14:00 (ou antes se finalizado).
6. Para novos clientes / sem reserva: apresente a CorpFlats como a melhor opção de flats executivos mobiliados e climatizados em Campos dos Goytacazes (Av. Pelinca, melhor ponto da cidade), convide a reservar pelo site oficial e tire dúvidas de diárias e comodidades.`,
  knowledgeBase: {
    address: "Av. Pelinca, 100 - Parque Pelinca, Campos dos Goytacazes - RJ (Excelente localização, próximo a restaurantes, bancos e comércio)",
    checkinTime: "14:00 (Check-in padrão a partir das 14h)",
    checkoutTime: "12:00 (Check-out padrão até às 12h)",
    earlyCheckinPolicy: "Entrada antecipada a partir das 10:00 é um benefício gratuito para reservas diretas (Site ou WhatsApp), ESTRITAMENTE MEDIANTE DISPONIBILIDADE de limpeza prévia do flat pela governança.",
    lateCheckoutPolicy: "Saída após as 12:00 deve ser combinada previamente com a recepção e depende de disponibilidade de outros hóspedes.",
    wifiNetwork: "CorpFlats-Hospedes",
    wifiPassword: "corpflats2026",
    breakfastInfo: "O café da manhã é servido das 06:30 às 10:00. Hóspedes com café incluso desfrutam de buffet completo; hóspedes sem café podem solicitar inclusão avulsa ou delivery na recepção.",
    garageInfo: "Estacionamento privativo com vaga coberta disponível. É necessário informar placa, modelo e cor do veículo com antecedência para cadastro e autorização na portaria.",
    petPolicy: "Aceitamos pets de pequeno porte em apartamentos selecionados mediante aviso prévio e taxa de higienização diferenciada.",
    smokingPolicy: "Ambiente 100% livre de fumo! É estritamente proibido fumar dentro dos apartamentos e nas áreas fechadas do edifício.",
    amenities: "Apartamentos completos com cama box confortável, ar-condicionado Split, Smart TV, Wi-Fi veloz, cozinha equipada com micro-ondas e frigobar, enxoval completo de hotelaria e ducha aquecida.",
    directBookingBenefits: "Melhor tarifa garantida sem taxas de intermediários, prioridade de early check-in a partir das 10h (quando disponível) e suporte direto com a nossa administração.",
    receptionPhone: "5522998505276",
    siteUrl: "https://corpflats.onrender.com"
  }
};

/**
 * Garante e retorna a configuração do Agente de IA em db.zapiConfig.aiAgent
 */
export function getWhatsAppAiConfig(db) {
  if (!db) return JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
  if (!db.zapiConfig) {
    db.zapiConfig = {};
  }
  if (!db.zapiConfig.aiAgent) {
    db.zapiConfig.aiAgent = JSON.parse(JSON.stringify(DEFAULT_AI_CONFIG));
  } else {
    // Mescla campos faltantes
    const current = db.zapiConfig.aiAgent;
    if (current.enabled === undefined) current.enabled = DEFAULT_AI_CONFIG.enabled;
    if (!current.mode) current.mode = DEFAULT_AI_CONFIG.mode;
    if (!current.agentName) current.agentName = DEFAULT_AI_CONFIG.agentName;
    if (!current.agentRole) current.agentRole = DEFAULT_AI_CONFIG.agentRole;
    if (current.responseDelaySeconds === undefined) current.responseDelaySeconds = DEFAULT_AI_CONFIG.responseDelaySeconds;
    if (!current.offHoursStart) current.offHoursStart = DEFAULT_AI_CONFIG.offHoursStart;
    if (!current.offHoursEnd) current.offHoursEnd = DEFAULT_AI_CONFIG.offHoursEnd;
    if (!Array.isArray(current.handoverKeywords)) current.handoverKeywords = [...DEFAULT_AI_CONFIG.handoverKeywords];
    if (!current.systemPrompt) current.systemPrompt = DEFAULT_AI_CONFIG.systemPrompt;
    if (!current.knowledgeBase) current.knowledgeBase = { ...DEFAULT_AI_CONFIG.knowledgeBase };
    for (const [k, v] of Object.entries(DEFAULT_AI_CONFIG.knowledgeBase)) {
      if (current.knowledgeBase[k] === undefined) {
        current.knowledgeBase[k] = v;
      }
    }
  }
  return db.zapiConfig.aiAgent;
}

/**
 * Normaliza número para dígitos
 */
export function normalizePhone(raw = "") {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Detecta se a mensagem expressa vontade de falar com atendimento humano
 */
export function detectHandoverIntent(text = "", customKeywords = null) {
  if (!text || typeof text !== "string") return { shouldHandover: false };
  const lower = text.toLowerCase().trim();

  // Expressões diretas comuns de transbordo humano
  const directPatterns = [
    /\b(?:falar|conversar)\s+com\s+(?:um\s+|uma\s+)?(?:humano|pessoa|atendente|algu[eé]m|recep[cç][aã]o|recepcionista|gerente|operador)\b/i,
    /\b(?:passa|transfere|chama|conecta)\s+(?:para|pra|a|ao)?\s*(?:um\s+|uma\s+)?(?:humano|pessoa|atendente|algu[eé]m|recep[cç][aã]o|recepcionista|gerente)\b/i,
    /\b(?:atendente|humano|recepcionista)\s+por\s+favor\b/i,
    /\b(?:quero|preciso)\s+(?:de\s+)?(?:um\s+|uma\s+)?(?:atendente|humano|pessoa|suporte\s+humano)\b/i,
    /\b(?:reclama[cç][aã]o|reclamar|cancelar\s+reserva|cancelamento)\b/i
  ];

  for (const pat of directPatterns) {
    if (pat.test(lower)) {
      return { shouldHandover: true, matchedKeyword: pat.source };
    }
  }

  const keywords = Array.isArray(customKeywords) && customKeywords.length > 0 
    ? customKeywords 
    : DEFAULT_AI_CONFIG.handoverKeywords;

  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    if (lower.includes(k)) {
      return { shouldHandover: true, matchedKeyword: kw };
    }
  }
  return { shouldHandover: false };
}

/**
 * Constrói o contexto em tempo real do hóspede consultando reservas, flats e governança
 */
export function buildGuestContext(db, phone) {
  const cleanPhone = normalizePhone(phone);
  const now = new Date();
  // Horário de Brasília (UTC-3)
  const brasiliaOffset = -3 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brDate = new Date(utc + (brasiliaOffset * 60000));
  const todayStr = brDate.toISOString().slice(0, 10);
  const timeStr = brDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  let matchedReservation = null;
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  // 1. Busca reserva que coincida com o telefone
  if (cleanPhone) {
    // Procura reserva ativa para hoje ou futura
    matchedReservation = reservations.find(r => {
      if (r.status === "cancelada" || r.status === "cancelled") return false;
      const rPhone = normalizePhone(r.guestPhone || r.phone || "");
      if (!rPhone) return false;
      const match = cleanPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(cleanPhone.slice(-8));
      return match && (r.checkinDate === todayStr || r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr));
    });

    // Se não encontrou reserva em curso, procura a mais recente ou futura
    if (!matchedReservation) {
      const candidates = reservations.filter(r => {
        if (r.status === "cancelada" || r.status === "cancelled") return false;
        const rPhone = normalizePhone(r.guestPhone || r.phone || "");
        if (!rPhone) return false;
        return cleanPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(cleanPhone.slice(-8));
      });
      if (candidates.length > 0) {
        // Ordena por check-in decrescente
        candidates.sort((a, b) => (b.checkinDate || "").localeCompare(a.checkinDate || ""));
        matchedReservation = candidates[0];
      }
    }
  }

  // 2. Busca cadastro de hóspede
  let guestRecord = null;
  if (Array.isArray(db?.guests) && cleanPhone) {
    guestRecord = db.guests.find(g => {
      const gPhone = normalizePhone(g.phone || g.whatsapp || "");
      return gPhone && (cleanPhone.endsWith(gPhone.slice(-8)) || gPhone.endsWith(cleanPhone.slice(-8)));
    });
  }

  // 3. Monta resumo do hóspede
  const guestName = matchedReservation?.guestName || guestRecord?.name || null;

  let stayStatus = "sem_reserva_ativa";
  let flatNumber = matchedReservation?.flatNumber || null;
  let flatId = matchedReservation?.flatId || null;
  let cleaningStatus = "desconhecido";
  let isRoomReady = false;

  if (matchedReservation) {
    const checkin = matchedReservation.checkinDate;
    const checkout = matchedReservation.checkoutDate;

    if (checkin === todayStr) {
      stayStatus = "checkin_hoje";
    } else if (checkout === todayStr) {
      stayStatus = "checkout_hoje";
    } else if (checkin < todayStr && checkout > todayStr) {
      stayStatus = "em_estadia";
    } else if (checkin > todayStr) {
      stayStatus = "reserva_futura";
    } else {
      stayStatus = "estadia_passada";
    }

    // Consulta governança se for check-in hoje ou em estadia
    if (flatNumber && Array.isArray(db?.cleaningRequests)) {
      const cleanReq = db.cleaningRequests.find(c => 
        (String(c.flatNumber) === String(flatNumber) || c.flatId === flatId) &&
        (c.requestDate === todayStr || c.effectiveDate === todayStr)
      );
      if (cleanReq) {
        cleaningStatus = cleanReq.status || "pendente";
        isRoomReady = cleanReq.status === "clean" || cleanReq.completedAt != null;
      } else {
        // Se não há chamado de limpeza hoje, verifica status do flat
        const flatObj = (db?.flats || []).find(f => String(f.number) === String(flatNumber) || f.id === flatId);
        if (flatObj && flatObj.status === "clean") {
          cleaningStatus = "clean";
          isRoomReady = true;
        }
      }
    }
  }

  const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
  const checkinUrl = matchedReservation ? getCheckinUrlSync(matchedReservation, 1, appOrigin, db) : null;

  return {
    todayStr,
    timeStr,
    phone: cleanPhone,
    guestName,
    hasReservation: Boolean(matchedReservation),
    checkinUrl,
    reservation: matchedReservation ? {
      code: matchedReservation.code || matchedReservation.reservationCode || `RES-${flatNumber}`,
      guestName: matchedReservation.guestName,
      checkinDate: matchedReservation.checkinDate,
      checkoutDate: matchedReservation.checkoutDate,
      flatNumber: matchedReservation.flatNumber,
      status: matchedReservation.status,
      paymentStatus: matchedReservation.paymentStatus,
      channel: matchedReservation.channel,
      totalAmount: matchedReservation.totalAmount,
      checkinUrl
    } : null,
    stayStatus,
    flatNumber,
    cleaningStatus,
    isRoomReady
  };
}

/**
 * Lê e sanitiza as configurações de ações do bot (Chave Mestra e Ações Granulares)
 */
export function getBotActionsSettings(db) {
  if (db?.botActionsSettings) {
    const s = db.botActionsSettings;
    return {
      apiActionsEnabled: s.apiActionsEnabled !== false,
      allowedActions: {
        checkAvailability: s.allowedActions?.checkAvailability !== false,
        calculateQuote: s.allowedActions?.calculateQuote !== false,
        generatePayment: s.allowedActions?.generatePayment !== false,
        createPreReservation: s.allowedActions?.createPreReservation !== false,
        commitReservation: s.allowedActions?.commitReservation !== false,
        ...(s.allowedActions || {})
      },
      preReservationHoldMinutes: Number(s.preReservationHoldMinutes) || 30,
      handoverMessage: s.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
    };
  }
  return {
    apiActionsEnabled: true,
    allowedActions: {
      checkAvailability: true,
      calculateQuote: true,
      generatePayment: true,
      createPreReservation: true,
      commitReservation: true
    },
    preReservationHoldMinutes: 30,
    handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
  };
}

/**
 * Constrói as declarações de ferramentas (Function Calling) do Gemini adaptativamente
 * de acordo com a chave mestra e as permissões granulares ativas.
 */
export function buildGeminiTools(actionsSettings = {}) {
  if (!actionsSettings || actionsSettings.apiActionsEnabled === false) {
    return [];
  }

  const allowed = actionsSettings.allowedActions || {};
  const declarations = [];

  if (allowed.checkAvailability !== false && allowed.checkAvailability) {
    declarations.push({
      name: "checkAvailability",
      description: "Consulta a disponibilidade de flats para um intervalo de datas (check-in e check-out) e quantidade de hóspedes.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de check-in (formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de check-out (formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Número total de hóspedes (opcional, padrão 1)"
          }
        },
        required: ["checkIn", "checkOut"]
      }
    });
  }

  if (allowed.calculateQuote !== false && allowed.calculateQuote) {
    declarations.push({
      name: "calculateQuote",
      description: "Calcula o orçamento completo e detalhado (diárias com motor tarifário inteligente, taxas e valor total) para uma estadia.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Número total de hóspedes (opcional, padrão 1)"
          },
          flatId: {
            type: "STRING",
            description: "ID ou número do flat desejado (opcional)"
          },
          channel: {
            type: "STRING",
            description: "Canal de venda (ex: 'direct', 'whatsapp')"
          },
          ratePlan: {
            type: "STRING",
            description: "Plano tarifário ('room_only' ou 'with_breakfast')"
          }
        },
        required: ["checkIn", "checkOut"]
      }
    });
  }

  if (allowed.createPreReservation !== false && allowed.createPreReservation) {
    declarations.push({
      name: "createPreReservation",
      description: "Cria uma pré-reserva provisória com bloqueio temporário (hold de 30 minutos) no PMS e gera cobrança PIX para garantia.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (YYYY-MM-DD)"
          },
          guestName: {
            type: "STRING",
            description: "Nome completo do hóspede"
          },
          guestPhone: {
            type: "STRING",
            description: "Telefone/WhatsApp do hóspede com DDD"
          },
          flatId: {
            type: "STRING",
            description: "ID ou número do flat escolhido"
          },
          total: {
            type: "NUMBER",
            description: "Valor total da reserva"
          },
          guests: {
            type: "INTEGER",
            description: "Número de hóspedes (padrão 1)"
          }
        },
        required: ["checkIn", "checkOut", "guestName", "flatId"]
      }
    });
  }

  if (allowed.generatePayment !== false && allowed.generatePayment) {
    declarations.push({
      name: "generatePayment",
      description: "Gera ou recupera dados de pagamento PIX (código Copia e Cola e QR Code) para uma pré-reserva ou reserva.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "Código ou ID da reserva/pré-reserva (ex: 'CF-123456')"
          },
          amount: {
            type: "NUMBER",
            description: "Valor a pagar (opcional se já constar na reserva)"
          },
          guestName: {
            type: "STRING",
            description: "Nome do hóspede (opcional)"
          }
        },
        required: ["reservationId"]
      }
    });
  }

  if (allowed.commitReservation !== false && allowed.commitReservation) {
    declarations.push({
      name: "commitReservation",
      description: "Efetiva e confirma definitivamente uma pré-reserva no PMS após a confirmação do pagamento, realizando o bloqueio permanente das datas.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "Código ou ID da pré-reserva a ser confirmada"
          }
        },
        required: ["reservationId"]
      }
    });
  }

  if (declarations.length === 0) {
    return [];
  }

  return [
    {
      functionDeclarations: declarations
    }
  ];
}

/**
 * Calcula a diária efetiva considerando motor tarifário, overrides e markup de canais
 */
export function computeDailyRate(db, flatId, dateStr, channel = "direct") {
  const normDate = String(dateStr).substring(0, 10);
  let normChan = String(channel || "direct").toLowerCase().trim();
  if (["whatsapp", "site", "direta", "direto"].includes(normChan)) {
    normChan = "direct";
  }

  // 1. Overrides
  const overrides = Array.isArray(db?.tariffOverrides) ? db.tariffOverrides : [];
  let targetFlatId = flatId ? String(flatId) : null;
  let targetFlatNumber = null;
  if (targetFlatId && Array.isArray(db?.flats)) {
    const fObj = db.flats.find(f => String(f.id) === targetFlatId || String(f.number) === targetFlatId);
    if (fObj) {
      targetFlatId = String(fObj.id);
      targetFlatNumber = String(fObj.number);
    }
  }

  let matchedOverride = null;
  if (targetFlatId || targetFlatNumber) {
    matchedOverride = overrides.find(o =>
      o.date === normDate &&
      (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
      String(o.channel || "").toLowerCase() === normChan
    ) || overrides.find(o =>
      o.date === normDate &&
      (String(o.flatId) === targetFlatId || (targetFlatNumber && String(o.flatNumber) === targetFlatNumber)) &&
      (!o.channel || String(o.channel).toLowerCase() === "all")
    );
  }

  if (!matchedOverride) {
    matchedOverride = overrides.find(o =>
      o.date === normDate &&
      (!o.flatId || String(o.flatId) === "all" || o.flatId === null) &&
      String(o.channel || "").toLowerCase() === normChan
    ) || overrides.find(o =>
      o.date === normDate &&
      (!o.flatId || String(o.flatId) === "all" || o.flatId === null) &&
      (!o.channel || String(o.channel).toLowerCase() === "all")
    );
  }

  if (matchedOverride && matchedOverride.rate != null) {
    return Math.round(Number(matchedOverride.rate) * 100) / 100;
  }

  // 2. Base rate
  const tSettings = db?.tariffSettings || {};
  let baseRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);

  // 3. Weekend markup (Sexta=5, Sábado=6)
  const dParts = normDate.split("-").map(Number);
  const dateObj = new Date(Date.UTC(dParts[0], (dParts[1] || 1) - 1, dParts[2] || 1, 12, 0, 0));
  const dayOfWeek = dateObj.getUTCDay();
  const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
  let weekendMarkup = 0;
  if (isWeekend) {
    const weekendPct = Number(tSettings.weekendMarkupPct != null ? tSettings.weekendMarkupPct : 0.15);
    weekendMarkup = baseRate * weekendPct;
  }

  const rateBeforeChan = baseRate + weekendMarkup;

  // 4. Channel markup
  const chanCfg = tSettings.channelMarkups?.[normChan] ||
    (normChan === "direct" ? { markupPct: 0.0 } :
     normChan === "booking" ? { markupPct: 0.18 } :
     normChan === "airbnb" ? { markupPct: 0.15 } : { markupPct: 0.0 });
  const chanPct = Number(chanCfg.markupPct || 0);
  const finalRate = rateBeforeChan * (1 + chanPct);

  return Math.round(finalRate * 100) / 100;
}

// ── Handlers Internos para Bot Actions ──────────────────────────────────────

function handleCheckAvailability(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));

  if (!inDate || !outDate) {
    return {
      error: "MISSING_DATES",
      message: "checkIn e checkOut são obrigatórios no formato YYYY-MM-DD."
    };
  }

  if (inDate >= outDate) {
    return {
      error: "INVALID_DATE_RANGE",
      message: "checkIn deve ser anterior a checkOut."
    };
  }

  const nowMs = Date.now();
  // 1. Limpeza de pré-reservas vencidas
  (db?.reservations || []).forEach(r => {
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt) {
      if (new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") {
        r.status = "expirada";
        r.updatedAt = new Date().toISOString();
      }
    }
  });

  // 2. Mapeamento de conflitos
  const busyFlatSet = new Set();
  (db?.reservations || []).forEach(r => {
    if (r.status === "cancelada" || r.status === "expirada") return;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return;

    if (r.checkinDate < outDate && r.checkoutDate > inDate) {
      if (r.flatId != null) busyFlatSet.add(String(r.flatId));
      if (r.flatNumber != null) busyFlatSet.add(String(r.flatNumber));
    }
  });

  (db?.roomBlocks || []).forEach(b => {
    if (b.startDate < outDate && b.endDate > inDate) {
      if (b.flatId != null) busyFlatSet.add(String(b.flatId));
      if (b.flatNumber != null) busyFlatSet.add(String(b.flatNumber));
    }
  });

  // 3. Unidades habitacionais disponíveis
  const allFlats = (db?.flats || []).filter(f => !f.status || f.status !== "manutencao_bloqueada");
  const siteCfg = db?.siteConfig || {};
  const maxCapacity = siteCfg?.extraBedConfig?.enabled ? (siteCfg.extraBedConfig.maxGuests || 3) : 2;

  const availableFlats = allFlats.filter(f => {
    const isBusy = busyFlatSet.has(String(f.id)) || busyFlatSet.has(String(f.number));
    if (isBusy) return false;
    if (guests > maxCapacity) return false;
    return true;
  });

  return {
    success: true,
    available: availableFlats.length > 0,
    totalAvailable: availableFlats.length,
    checkIn: inDate,
    checkOut: outDate,
    guests,
    flats: availableFlats.map(f => ({
      id: f.id,
      number: f.number,
      name: f.colName || `Flat ${f.number}`,
      isOccupied: false
    }))
  };
}

function handleCalculateQuote(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));
  const flatId = args.flatId || null;
  const channel = args.channel || "direct";
  const ratePlan = args.ratePlan || "room_only";

  if (!inDate || !outDate) {
    return {
      error: "MISSING_DATES",
      message: "checkIn e checkOut são obrigatórios."
    };
  }

  const start = new Date(inDate + "T12:00:00Z");
  const end = new Date(outDate + "T12:00:00Z");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return {
      error: "INVALID_DATE_RANGE",
      message: "checkIn deve ser uma data anterior a checkOut."
    };
  }

  const nightsDiff = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (nightsDiff > 90) {
    return {
      error: "MAX_STAY_EXCEEDED",
      message: "O período máximo para cotação automatizada é de 90 noites."
    };
  }

  const dailyRates = [];
  const cur = new Date(start);
  while (cur < end) {
    const dStr = cur.toISOString().substring(0, 10);
    const rate = computeDailyRate(db, flatId, dStr, channel);
    dailyRates.push({
      date: dStr,
      rate
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const nights = dailyRates.length;
  const roomTotal = Math.round(dailyRates.reduce((acc, n) => acc + n.rate, 0) * 100) / 100;

  const siteCfg = db?.siteConfig || {};
  const plans = siteCfg.ratePlans || {};
  const selectedPlan = plans[ratePlan] || plans["room_only"] || { cleaningFeeAmount: 70 };

  let cleaningFee = 0;
  if (ratePlan !== "with_breakfast" && selectedPlan.cleaningFeeEnabled !== false) {
    cleaningFee = Number(selectedPlan.cleaningFeeAmount != null ? selectedPlan.cleaningFeeAmount : 70);
  }

  let extraBedFee = 0;
  const extraBedCfg = siteCfg.extraBedConfig || { enabled: true, feeAmount: 60 };
  if (guests > 2 && extraBedCfg.enabled) {
    extraBedFee = Number(extraBedCfg.feeAmount || 60);
  }

  let breakfastFee = 0;
  if (ratePlan === "with_breakfast") {
    const planBreakfastRate = Number(plans.with_breakfast?.dailyRate || 225);
    const planRoomOnlyRate = Number(plans.room_only?.dailyRate || 190);
    const breakfastDiffPerNight = Math.max(35, planBreakfastRate - planRoomOnlyRate);
    breakfastFee = Math.round(breakfastDiffPerNight * nights * 100) / 100;
  }

  const total = Math.round((roomTotal + cleaningFee + extraBedFee + breakfastFee) * 100) / 100;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  return {
    success: true,
    quoteId: `quote_${Date.now()}`,
    checkIn: inDate,
    checkOut: outDate,
    nights,
    guests,
    flatId,
    channel,
    ratePlan,
    roomTotal,
    cleaningFee,
    extraBedFee,
    breakfastFee,
    total,
    dailyRates,
    expiresAt
  };
}

async function handleCreatePreReservation(db, args = {}) {
  const inDate = args.checkIn || args.checkin;
  const outDate = args.checkOut || args.checkout;
  const guestName = args.guestName;
  const guestPhone = args.guestPhone || "";
  const flatId = args.flatId;
  const total = Number(args.total || 0);
  const channel = args.channel || "whatsapp";
  const guests = Math.max(1, Number(args.guests || args.guestsCount || 1));

  if (!inDate || !outDate || !guestName || !flatId) {
    return {
      error: "MISSING_FIELDS",
      message: "flatId, checkIn, checkOut e guestName são obrigatórios."
    };
  }

  const flat = (db?.flats || []).find(f => String(f.id) === String(flatId) || String(f.number) === String(flatId));
  if (!flat) {
    return {
      error: "FLAT_NOT_FOUND",
      message: "Apartamento informado não foi encontrado."
    };
  }

  // Verificação de conflito
  const nowMs = Date.now();
  const hasConflict = (db?.reservations || []).some(r => {
    if (r.status === "cancelada" || r.status === "expirada") return false;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
    if (String(r.flatId) !== String(flat.id) && String(r.flatNumber) !== String(flat.number)) return false;
    return r.checkinDate < outDate && r.checkoutDate > inDate;
  });

  if (hasConflict) {
    return {
      error: "FLAT_UNAVAILABLE",
      message: `O Flat ${flat.number} já possui reserva ou bloqueio para o período selecionado.`
    };
  }

  const botSettings = getBotActionsSettings(db);
  const holdMinutes = botSettings.preReservationHoldMinutes || 30;
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  const nextId = db?.reservations && db.reservations.length > 0
    ? Math.max(...db.reservations.map(r => r.id || 0)) + 1
    : 1;
  const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
  const cleanTxId = code.replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);

  const pixPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
    amount: total,
    merchantName: "CORPFLATS LTDA",
    merchantCity: "CAMPOS DOS GOYTACAZES",
    txid: cleanTxId
  });

  let qrCodeBase64 = "";
  try {
    const qrcodeMod = await import("qrcode").catch(() => null);
    const QRCode = qrcodeMod?.default || qrcodeMod;
    if (QRCode && typeof QRCode.toDataURL === "function") {
      qrCodeBase64 = await QRCode.toDataURL(pixPayload);
    }
  } catch (_) {}

  const newReservation = {
    id: nextId,
    code,
    flatId: flat.id,
    flatNumber: String(flat.number),
    guestName: String(guestName).trim(),
    guestPhone: cleanWhatsAppPhone(guestPhone || ""),
    phone: cleanWhatsAppPhone(guestPhone || ""),
    guestsCount: guests,
    checkinDate: inDate,
    checkoutDate: outDate,
    channel,
    status: "pre_reserva",
    paymentStatus: "pendente",
    totalAmount: total,
    paidAmount: 0,
    expiresAt,
    pixCopiaECola: pixPayload,
    pixTxId: cleanTxId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!Array.isArray(db.reservations)) db.reservations = [];
  db.reservations.unshift(newReservation);

  return {
    success: true,
    reservationId: newReservation.id,
    code: newReservation.code,
    flatId: newReservation.flatId,
    flatNumber: newReservation.flatNumber,
    checkIn: newReservation.checkinDate,
    checkOut: newReservation.checkoutDate,
    guestName: newReservation.guestName,
    total: newReservation.totalAmount,
    status: "pre_reserva",
    expiresAt: newReservation.expiresAt,
    pixCopiaECola: pixPayload,
    qrCodeBase64,
    holdMinutes
  };
}

async function handleGeneratePayment(db, args = {}) {
  const targetId = args.reservationId || args.reservationCode || args.code;
  let resObj = null;
  if (targetId) {
    resObj = (db?.reservations || []).find(r =>
      String(r.id) === String(targetId) || String(r.code) === String(targetId)
    );
  }

  const resolvedAmount = Number(args.amount || resObj?.totalAmount || 0);
  if (isNaN(resolvedAmount) || resolvedAmount <= 0) {
    return {
      error: "INVALID_AMOUNT",
      message: "O valor do pagamento deve ser maior que zero."
    };
  }

  const resolvedGuestName = args.guestName || resObj?.guestName || "Hospede CorpFlats";
  const cleanTxId = (resObj?.code || `PIX${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").substring(0, 25);

  const pixPayload = generateStaticPixPayload({
    pixKey: db?.settings?.interConfig?.pixKey || "47964813000165",
    amount: resolvedAmount,
    merchantName: "CORPFLATS LTDA",
    merchantCity: "CAMPOS DOS GOYTACAZES",
    txid: cleanTxId
  });

  let qrCodeBase64 = "";
  try {
    const qrcodeMod = await import("qrcode").catch(() => null);
    const QRCode = qrcodeMod?.default || qrcodeMod;
    if (QRCode && typeof QRCode.toDataURL === "function") {
      qrCodeBase64 = await QRCode.toDataURL(pixPayload);
    }
  } catch (_) {}

  const botSettings = getBotActionsSettings(db);
  const holdMinutes = botSettings.preReservationHoldMinutes || 30;
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();

  if (resObj) {
    resObj.pixCopiaECola = pixPayload;
    resObj.pixTxId = cleanTxId;
    resObj.updatedAt = new Date().toISOString();
  }

  return {
    success: true,
    reservationId: resObj ? resObj.id : null,
    reservationCode: resObj ? resObj.code : null,
    amount: resolvedAmount,
    guestName: resolvedGuestName,
    pixCopiaECola: pixPayload,
    qrCodeBase64,
    expiresAt
  };
}

function handleCommitReservation(db, args = {}) {
  const targetId = args.reservationId || args.reservationCode || args.code;
  if (!targetId) {
    return {
      error: "MISSING_RESERVATION_ID",
      message: "reservationId é obrigatório."
    };
  }

  const reservation = (db?.reservations || []).find(r =>
    String(r.id) === String(targetId) || String(r.code) === String(targetId)
  );

  if (!reservation) {
    return {
      error: "RESERVATION_NOT_FOUND",
      message: "Reserva não encontrada."
    };
  }

  if (reservation.status === "cancelada") {
    return {
      error: "RESERVATION_CANCELLED",
      message: "Esta reserva está cancelada e não pode ser efetivada."
    };
  }

  const nowMs = Date.now();
  const isExpired = reservation.status === "expirada" ||
    ((reservation.status === "pre_reserva" || reservation.status === "pendente") &&
      reservation.expiresAt &&
      new Date(reservation.expiresAt).getTime() < nowMs &&
      reservation.paymentStatus !== "pago_total");

  if (isExpired) {
    reservation.status = "expirada";
    reservation.updatedAt = new Date().toISOString();
    return {
      error: "PRE_RESERVATION_EXPIRED",
      message: "Esta pré-reserva expirou e não pode ser efetivada. Realize uma nova cotação."
    };
  }

  const hasConflict = (db?.reservations || []).some(r => {
    if (String(r.id) === String(reservation.id) || String(r.code) === String(reservation.code)) return false;
    if (r.status === "cancelada" || r.status === "expirada") return false;
    if ((r.status === "pre_reserva" || r.status === "pendente") && r.expiresAt && new Date(r.expiresAt).getTime() < nowMs && r.paymentStatus !== "pago_total") return false;
    if (String(r.flatId) !== String(reservation.flatId) && String(r.flatNumber) !== String(reservation.flatNumber)) return false;
    return r.checkinDate < reservation.checkoutDate && r.checkoutDate > reservation.checkinDate;
  });

  if (hasConflict) {
    return {
      error: "FLAT_UNAVAILABLE",
      message: `O Flat ${reservation.flatNumber || reservation.flatId} já possui outra reserva confirmada para o período selecionado.`
    };
  }

  reservation.status = "confirmada";
  reservation.paymentStatus = "pago_total";
  reservation.paidAmount = reservation.totalAmount;
  reservation.pmsConfirmed = true;
  reservation.confirmedAt = new Date().toISOString();
  reservation.updatedAt = new Date().toISOString();

  return {
    success: true,
    reservationId: reservation.id,
    code: reservation.code,
    status: "confirmada",
    flatNumber: reservation.flatNumber,
    pmsConfirmed: true
  };
}

/**
 * Executa uma ação interna do bot com checagem de permissão e chave mestra
 */
export async function executeBotAction(db, actionName, args = {}) {
  const settings = getBotActionsSettings(db);

  if (!settings.apiActionsEnabled || !settings.allowedActions?.[actionName]) {
    return {
      error: "ACTION_DISABLED",
      action: actionName,
      requiresHandover: true,
      message: settings.handoverMessage || "Esta ação do sistema está pausada ou requer atendimento humano."
    };
  }

  switch (actionName) {
    case "checkAvailability":
      return handleCheckAvailability(db, args);
    case "calculateQuote":
      return handleCalculateQuote(db, args);
    case "createPreReservation":
      return handleCreatePreReservation(db, args);
    case "generatePayment":
      return handleGeneratePayment(db, args);
    case "commitReservation":
      return handleCommitReservation(db, args);
    default:
      return {
        error: "UNKNOWN_ACTION",
        action: actionName,
        message: `Ação '${actionName}' não é reconhecida.`
      };
  }
}

const PORTUGUESE_STOP_WORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas",
  "de", "do", "da", "dos", "das",
  "em", "no", "na", "nos", "nas",
  "por", "pelo", "pela", "pelos", "pelas",
  "com", "para", "pra", "pro",
  "e", "que", "se", "como", "qual", "quais",
  "quando", "onde", "quem", "tem", "ha", "eh",
  "voce", "voces"
]);

/**
 * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
 */
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null) {
  const text = (messageText || "").toLowerCase().trim();
  const kb = aiConfig.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";

  // Extrai e filtra itens de FAQ ativos e aplicáveis ao cliente
  let candidateFaqs = [];
  if (Array.isArray(dbOrFaqs)) {
    candidateFaqs = dbOrFaqs;
  } else if (dbOrFaqs && typeof dbOrFaqs === "object") {
    const raw = dbOrFaqs.faqItems || dbOrFaqs.knowledgeBaseFaq || [];
    candidateFaqs = Array.isArray(raw) ? raw : [];
  } else if (aiConfig && Array.isArray(aiConfig.faqItems)) {
    candidateFaqs = aiConfig.faqItems;
  } else if (typeof globalThis !== "undefined" && Array.isArray(globalThis.db?.faqItems)) {
    candidateFaqs = globalThis.db.faqItems;
  }

  const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
  const activeFaqs = candidateFaqs.filter(faq => {
    return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, clientPhone);
  });

  // Base Dinâmica de FAQs Ativas (Prioridade Máxima para Perguntas, Variações e Palavras-chave Oficiais)
  if (activeFaqs.length > 0) {
    const cleanQuery = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .trim();
    const queryTokens = cleanQuery.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

    let bestFaq = null;
    let highestScore = 0;

    for (const faq of activeFaqs) {
      let score = 0;
      const qNorm = (faq.question || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .trim();
      const qTokens = qNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

      // Coincidência com pergunta principal (match dominante)
      if (cleanQuery.includes(qNorm) || (qNorm.length > 5 && qNorm.includes(cleanQuery))) {
        score += 200;
      } else {
        const commonWithQ = qTokens.filter(t => queryTokens.includes(t));
        if (commonWithQ.length > 0) {
          score += commonWithQ.length * 30;
        }
      }

      // Coincidência com variações da pergunta
      if (Array.isArray(faq.variations)) {
        let bestVarScore = 0;
        for (const variation of faq.variations) {
          if (!variation) continue;
          const vNorm = variation
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .trim();
          if (cleanQuery.includes(vNorm) || (vNorm.length > 5 && vNorm.includes(cleanQuery))) {
            bestVarScore = Math.max(bestVarScore, 150);
            break;
          }
          const vTokens = vNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
          const common = vTokens.filter(t => queryTokens.includes(t));
          if (vTokens.length > 0 && common.length >= Math.min(2, vTokens.length)) {
            bestVarScore = Math.max(bestVarScore, 40 + (common.length * 10));
          }
        }
        score += bestVarScore;
      }

      // Coincidência com palavras-chave com boost para termos distintivos
      if (Array.isArray(faq.keywords)) {
        for (const keyword of faq.keywords) {
          if (!keyword) continue;
          const kNorm = keyword
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w\s]/g, " ")
            .trim();
          if (!kNorm || PORTUGUESE_STOP_WORDS.has(kNorm)) continue;

          // Boost para keywords distintivas que diferenciam temas específicos (louças/bandeja, pet, convênio, early check-in)
          const isDistinctive = [
            "loucas", "louças", "bandeja", "recolhimento", "pratos", "talheres",
            "convenio", "corporativo", "faturamento", "empresa", "tarifa corporativa",
            "pet", "pets", "cachorro", "cao", "gato", "taxa pet",
            "early check in", "early checkin", "checkin antecipado", "entrada antecipada"
          ].includes(kNorm);
          const boost = isDistinctive ? 40 : 0;

          if (kNorm.includes(" ")) {
            if (cleanQuery.includes(kNorm)) {
              score += 60 + boost;
            }
          } else if (kNorm.length >= 3) {
            if (queryTokens.includes(kNorm)) {
              score += 30 + boost;
            } else if (cleanQuery.includes(kNorm)) {
              score += 15 + Math.floor(boost / 2);
            }
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestFaq = faq;
      }
    }

    if (bestFaq && highestScore >= 25) {
      return `Olá${name}! ${bestFaq.answer}`;
    }
  }

  // 1. Wi-Fi / Internet
  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text)) {
    return `Olá${name}! 📶 Aqui estão as informações de conexão:\n\n*Rede:* ${kb.wifiNetwork}\n*Senha:* \`${kb.wifiPassword}\`\n\nA rede é de alta velocidade e fica disponível em todo o apartamento. Se precisar de algo mais, estou à disposição! ✨`;
  }

  // 2. Café da Manhã (verificado antes de termos genéricos de acomodação)
  if (/caf[eé]|desjejum/i.test(text)) {
    return `Olá${name}! 🥐☕ ${kb.breakfastInfo}\n\nQualquer dúvida sobre opções ou pedidos de delivery, estamos por aqui!`;
  }

  // 3. Garagem / Estacionamento / Carro
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa/i.test(text)) {
    return `Olá${name}! 🚗 ${kb.garageInfo}\n\nSe ainda não informou os dados do veículo, pode mandar aqui a *Placa, Modelo e Cor* que já providenciamos a autorização na portaria!`;
  }

  // 4. Localização / Endereço / Onde fica
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa/i.test(text)) {
    return `Olá${name}! 📍 Estamos localizados na *${kb.address}*.\n\nÉ um ponto nobre e privilegiado no coração da Pelinca em Campos dos Goytacazes! Se precisar de instruções de rota, nos avise. 🏨`;
  }

  // 5. Check-out / Horário de Saída
  if (/check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da|que\s+horas\s+sair|deixar\s+a\s+chave/i.test(text)) {
    return `Olá${name}! O horário padrão de check-out é até às *${kb.checkoutTime}* ⏰.\n\nPara fazer a saída, pedimos que desligue ar-condicionado e luzes e entregue as chaves/cartão na portaria do condomínio. Caso necessite de late check-out, fale conosco com antecedência! 🙏`;
  }

  // 6. Status do Quarto / Posso entrar? / Está pronto?
  if (/(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)|(?:pront|liberad).*(?:quarto|flat|apartamento)|posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)) {
    if (guestContext.stayStatus === "checkin_hoje") {
      if (guestContext.isRoomReady) {
        return `Ótima notícia${name}! 🎉 O seu *Flat ${guestContext.flatNumber}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`;
      } else {
        return `Olá${name}! O seu *Flat ${guestContext.flatNumber}* está sendo finalizado com todo carinho pela nossa governança para garantir máxima higiene e conforto ✨. O horário oficial de entrada é a partir das *${kb.checkinTime}*. Assim que a limpeza for 100% liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`;
      }
    }
    if (guestContext.stayStatus === "em_estadia") {
      return `Olá${name}! Você está acomodado(a) no *Flat ${guestContext.flatNumber}*. Caso precise de alguma manutenção, toalhas extras ou limpeza durante a estadia, é só nos avisar por aqui que cuidaremos para você! 🛎️`;
    }
  }

  // 7. Cotação / Nova Reserva / Preço
  if (/reserva|diaria|diária|preco|preço|valor|alugar|vaga|disponibilidade/i.test(text)) {
    return `Olá${name}! ✨ Será um enorme prazer receber você no CorpFlats!\n\nDispomos de 19 flats executivos finamente decorados, equipados com ar-condicionado Split, cozinha completa, Wi-Fi veloz e vaga de garagem no melhor ponto de Campos/RJ.\n\nPara consultar disponibilidade exata e garantir a melhor tarifa direta sem taxas de intermediários, acesse nosso site oficial:\n👉 ${kb.siteUrl}\n\nOu me informe as datas desejadas (entrada e saída) que posso te ajudar! 🏨`;
  }

  // 7.5 Pré-Check-in / Link de Check-in
  if (/check-?in\s+online|pr[eé]-?check-?in|ficha(?:\s+de\s+check-?in)?|link(?:\s+do|\s+de)?\s+check-?in/i.test(text)) {
    if (guestContext.checkinUrl) {
      return `Olá${name}! Você pode realizar o seu Pré-Check-in Digital pelo link seguro abaixo:\n👉 ${guestContext.checkinUrl}\n\nO preenchimento antecipado garante a liberação rápida da portaria na sua chegada! Qualquer dúvida, conte conosco. 🏨✨`;
    }
  }

  // 8. Saudação Genérica
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!.]*$/i.test(text)) {
    if (guestContext.hasReservation) {
      return `Olá${name}! Tudo bem? Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats. Como posso tornar a sua estadia ainda mais agradável hoje? 🏨✨`;
    }
    return `Olá${name}! Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats em Campos dos Goytacazes. Como posso te ajudar hoje? Ficou com alguma dúvida sobre nossas acomodações ou sobre sua estadia? 😊`;
  }

  // 9. Resposta padrão prestativa
  return `Olá${name}! Recebi sua mensagem. Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨.\n\nPosso te ajudar com informações sobre *Wi-Fi, horários de check-in/out, status do flat, garagem, café da manhã e localização*. Como posso te ajudar? Se preferir falar com um atendente da recepção, basta me avisar! ✨`;
}

/**
 * Chama o Google Gemini com lista de candidatos e suporte multi-turn a Function Calling
 */
export async function callGeminiAi({ apiKey, systemInstruction, prompt, history = [], db, tools = [] }) {
  if (!apiKey) return { ok: false, error: "Sem chave Gemini" };

  const candidateModels = [
    { ver: "v1beta", model: "gemini-2.0-flash" },
    { ver: "v1beta", model: "gemini-2.0-flash-lite" },
    { ver: "v1beta", model: "gemini-1.5-flash" },
    { ver: "v1", model: "gemini-1.5-flash" },
    { ver: "v1beta", model: "gemini-1.5-pro" }
  ];

  // Monta histórico de mensagens
  const formattedHistory = (history || []).slice(-6).map(m => ({
    role: m.fromMe ? "model" : "user",
    parts: [{ text: String(m.text || "") }]
  })).filter(c => c.parts[0].text.trim().length > 0);

  const fullPrompt = `${systemInstruction}\n\n[MENSAGEM ATUAL DO HÓSPEDE]:\n${prompt}\n\n[INSTRUÇÃO DE RESPOSTA]: Responda diretamente ao hóspede de forma concisa, educada e pronta para envio no WhatsApp.`;

  for (const { ver, model } of candidateModels) {
    try {
      const bodyPayload = {
        contents: [
          ...formattedHistory,
          { role: "user", parts: [{ text: fullPrompt }] }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800
        }
      };

      if (Array.isArray(tools) && tools.length > 0) {
        bodyPayload.tools = tools;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Verifica se houve solicitação de chamada de ferramenta (Function Calling)
      const callPart = parts.find(p => p.functionCall);

      if (!callPart) {
        const text = parts.find(p => p.text)?.text || "";
        if (text && text.trim().length > 0) {
          return { ok: true, text: text.trim(), model };
        }
        continue;
      }

      // ── Loop Multi-Turn de Execução de Ferramentas ──
      const fnName = callPart.functionCall.name;
      const fnArgs = callPart.functionCall.args || {};

      let actionResult;
      try {
        actionResult = await executeBotAction(db, fnName, fnArgs);
      } catch (actErr) {
        actionResult = {
          error: "ACTION_FAILED",
          action: fnName,
          requiresHandover: true,
          message: actErr.message || "Erro interno ao executar a ação do sistema."
        };
      }

      // Anexa as partes ao histórico:
      // Turno 1 Model: functionCall
      // Turno 2 Function: functionResponse
      const turn2Contents = [
        ...formattedHistory,
        { role: "user", parts: [{ text: fullPrompt }] },
        { role: "model", parts },
        {
          role: "function",
          parts: [
            {
              functionResponse: {
                name: fnName,
                response: actionResult
              }
            }
          ]
        }
      ];

      const turn2Payload = {
        contents: turn2Contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 800
        }
      };

      if (Array.isArray(tools) && tools.length > 0) {
        turn2Payload.tools = tools;
      }

      const turn2Response = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(turn2Payload),
        signal: AbortSignal.timeout(8000)
      });

      if (turn2Response.ok) {
        const turn2Data = await turn2Response.json();
        const turn2Parts = turn2Data.candidates?.[0]?.content?.parts || [];
        const turn2Text = turn2Parts.find(p => p.text)?.text || "";
        if (turn2Text && turn2Text.trim().length > 0) {
          return {
            ok: true,
            text: turn2Text.trim(),
            model,
            functionCall: { name: fnName, args: fnArgs },
            functionResult: actionResult,
            requiresHandover: Boolean(actionResult?.requiresHandover || actionResult?.error === "ACTION_DISABLED")
          };
        }
      }

      // Se o Turno 2 não responder texto mas requer transbordo:
      if (actionResult?.requiresHandover || actionResult?.error === "ACTION_DISABLED") {
        return {
          ok: true,
          text: actionResult.message || "Esta operação do sistema requer acompanhamento humano. Já estou transferindo para a recepção! 🛎️",
          model,
          functionCall: { name: fnName, args: fnArgs },
          functionResult: actionResult,
          requiresHandover: true
        };
      }
    } catch (e) {
      console.warn(`[Gemini WhatsApp AI] Falha no modelo ${model}:`, e.message);
      continue;
    }
  }

  return { ok: false, error: "Nenhum modelo Gemini respondeu com sucesso" };
}

/**
 * Gera a resposta completa do Agente de IA para WhatsApp
 */
export async function generateAiWhatsAppResponse({ db, phone, messageText, history = [], isCopilot = false }) {
  const aiConfig = getWhatsAppAiConfig(db);
  const guestContext = buildGuestContext(db, phone);

  // 1. Verifica intenção de transbordo humano
  const handoverCheck = detectHandoverIntent(messageText, aiConfig.handoverKeywords);
  if (handoverCheck.shouldHandover) {
    const handoverReply = `Com certeza! Já estou transferindo seu atendimento para a nossa equipe humana da recepção 🛎️. Um momento, por favor, logo alguém dará continuidade por aqui! 🙏`;
    return {
      shouldHandover: true,
      matchedKeyword: handoverCheck.matchedKeyword,
      replyText: handoverReply,
      guestContext,
      intent: "handover_requested"
    };
  }

  // 2. Prepara o contexto estruturado para o prompt
  const botSettings = getBotActionsSettings(db);
  const tools = buildGeminiTools(botSettings);

  let systemActionsNotice = "";
  if (!botSettings.apiActionsEnabled) {
    systemActionsNotice = `
[STATUS DO SISTEMA: OPERAÇÕES AUTOMATIZADAS PAUSADAS]
Atenção: O acesso a operações diretas do sistema (consulta de disponibilidade em tempo real, cálculo de cotação/tarifas, geração de pagamento PIX e criação/confirmação de reservas) está TEMPORARIAMENTE DESATIVADO pela administração.
DIRETRIZES ESPECÍFICAS:
- Responda normalmente a dúvidas institucionais, localização, comodidades, horários e políticas usando a BASE DE CONHECIMENTO.
- Para qualquer solicitação de reserva, cotação, checagem de vagas ou pagamento, oriente com extrema cordialidade que as operações automatizadas estão em manutenção e que você está transferindo o contato para a equipe humana da recepção assumir com máxima atenção.
`;
  } else {
    const activeActionsList = Object.keys(botSettings.allowedActions || {}).filter(k => botSettings.allowedActions[k]).join(", ");
    systemActionsNotice = `
[STATUS DO SISTEMA: OPERAÇÕES AUTOMATIZADAS ATIVAS]
Você tem acesso a ferramentas de sistema (Function Calling) autorizadas: ${activeActionsList || "nenhuma"}.
DIRETRIZES ESPECÍFICAS:
- Use essas ferramentas de forma precisa quando o hóspede solicitar cotação, consulta de disponibilidade de datas, pré-reserva ou pagamento PIX.
- Formate a resposta final com os dados retornados de maneira acolhedora, clara e pronta para leitura no WhatsApp.
`;
  }

  // 2.1 Carrega e filtra FAQs dinâmicos ativos aplicáveis ao cliente
  const allFaqItems = Array.isArray(db?.faqItems)
    ? db.faqItems
    : (Array.isArray(db?.knowledgeBaseFaq) ? db.knowledgeBaseFaq : []);

  const applicableFaqs = allFaqItems.filter(faq => {
    return faq && faq.status === "ativo" && isFaqApplicableToClient(faq, phone);
  });

  let dynamicFaqPromptSection = "";
  if (applicableFaqs.length > 0) {
    const formattedFaqs = applicableFaqs.map((faq, idx) => {
      const vars = Array.isArray(faq.variations) && faq.variations.length > 0
        ? `\n  - Variações comuns: ${faq.variations.slice(0, 3).join("; ")}`
        : "";
      const kw = Array.isArray(faq.keywords) && faq.keywords.length > 0
        ? ` (Palavras-chave: ${faq.keywords.join(", ")})`
        : "";
      return `[FAQ #${idx + 1} - Categoria: ${(faq.category || "geral").toUpperCase()}]
- Pergunta: ${faq.question}${kw}${vars}
- Resposta Oficial: ${faq.answer}`;
    }).join("\n\n");

    dynamicFaqPromptSection = `
## BASE DE CONHECIMENTO & REGRAS (FAQS ATIVAS):
Abaixo estão as perguntas e respostas oficiais da CorpFlats ativas e aplicáveis a este hóspede. Priorize rigorosamente estas respostas oficiais para quaisquer dúvidas correspondentes:

${formattedFaqs}
`;
  }

  const contextString = `
[CONTEXTO EM TEMPO REAL]
- Data atual: ${guestContext.todayStr} | Horário: ${guestContext.timeStr} (Brasília)
- Telefone do contato: ${guestContext.phone}
- Nome do contato: ${guestContext.guestName || "Não identificado ainda (possível novo cliente / lead)"}
- Status da estadia: ${guestContext.stayStatus}
- Possui reserva: ${guestContext.hasReservation ? "SIM" : "NÃO"}
${guestContext.hasReservation ? `- Flat atribuído: ${guestContext.flatNumber || "A definir"}
- Período da reserva: ${guestContext.reservation?.checkinDate} até ${guestContext.reservation?.checkoutDate}
- Status da reserva: ${guestContext.reservation?.status}
- Link do Pré-Check-in Digital: ${guestContext.checkinUrl || "Não aplicável"}
- Status da higienização/limpeza hoje: ${guestContext.cleaningStatus.toUpperCase()} (Liberado/Pronto: ${guestContext.isRoomReady ? "SIM" : "NÃO"})` : "- Modo: Atendimento a novo cliente / Cotação"}

[BASE DE CONHECIMENTO OFICIAL CORPFLATS]
- Endereço: ${aiConfig.knowledgeBase.address}
- Horário de Check-in: ${aiConfig.knowledgeBase.checkinTime}
- Horário de Check-out: ${aiConfig.knowledgeBase.checkoutTime}
- Benefício Early Check-in: ${aiConfig.knowledgeBase.earlyCheckinPolicy}
- Política de Late Check-out: ${aiConfig.knowledgeBase.lateCheckoutPolicy}
- Wi-Fi Oficial: Rede "${aiConfig.knowledgeBase.wifiNetwork}" | Senha: "${aiConfig.knowledgeBase.wifiPassword}"
- Café da Manhã: ${aiConfig.knowledgeBase.breakfastInfo}
- Garagem e Estacionamento: ${aiConfig.knowledgeBase.garageInfo}
- Animais / Pets: ${aiConfig.knowledgeBase.petPolicy}
- Fumo: ${aiConfig.knowledgeBase.smokingPolicy}
- Comodidades dos Flats: ${aiConfig.knowledgeBase.amenities}
- Benefícios Reserva Direta: ${aiConfig.knowledgeBase.directBookingBenefits}
- Site Oficial para Reservas: ${aiConfig.knowledgeBase.siteUrl}
- WhatsApp da Recepção: ${aiConfig.knowledgeBase.receptionPhone}
${dynamicFaqPromptSection}
${systemActionsNotice}
`;

  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  // 3. Tenta responder via Google Gemini (com Function Calling adaptativo se disponível)
  if (apiKey) {
    try {
      const geminiRes = await callGeminiAi({
        apiKey,
        systemInstruction: `${aiConfig.systemPrompt}\n\n${contextString}`,
        prompt: messageText,
        history,
        db,
        tools
      });

      if (geminiRes.ok && geminiRes.text) {
        return {
          shouldHandover: Boolean(geminiRes.requiresHandover),
          requiresHandover: Boolean(geminiRes.requiresHandover),
          replyText: geminiRes.text,
          guestContext,
          modelUsed: geminiRes.model,
          source: "gemini",
          functionCall: geminiRes.functionCall || null,
          functionResult: geminiRes.functionResult || null
        };
      }
    } catch (err) {
      console.warn("[WhatsApp AI] Falha inesperada ao invocar Gemini AI:", err?.message || err);
    }
  }

  // 4. Contingência Heurística Local de Alta Precisão (Zero-Crash Fallback)
  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs);
  return {
    shouldHandover: false,
    replyText: heuristicText,
    guestContext,
    modelUsed: "heuristic_fallback",
    source: "heuristic"
  };
}

// ── Detecção e Auto-Aprendizado de Perguntas Não Mapeadas (FAQ Sofia) ─────────

export function isPotentialGuestQuestion(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 5) return false;

  const lower = t.toLowerCase();

  // Descartar saudações puras, cortesias ou confirmações simples (mesmo com pontuação ou interrogação)
  if (/^(?:(?:oi|ol[aá]|opa|ei|hello|hi|bom dia|boa tarde|boa noite)\s*,?\s*)?(?:tudo\s+b[eé]m|tudo\s+bom|como\s+vai|como\s+est[aá]|beleza)[?!.\s]*$/i.test(lower)) return false;
  if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[?!.\s]*$/i.test(lower)) return false;
  if (/^(ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá] bom|blz|agrade[cç]o|sim|n[aã]o|positivo)[?!.\s]*$/i.test(lower)) return false;
  if (/^(?:quero|preciso|gostaria)?\s*(?:de\s+)?(?:falar\s+com\s+)?(?:um\s+|uma\s+)?(?:humano|atendente|pessoa|algu[eé]m|recep[cç][aã]o|recepcionista|gerente|operador)(?:\s+urgente)?[?!.\s]*$/i.test(lower)) return false;

  // Interrogação explícita
  if (t.includes("?")) return true;

  // Padrões interrogativos
  const patterns = [
    /\b(como|onde|quando|qual|quais|quanto|quantos|quanta|quantas|por que|porque)\b/i,
    /\b(tem|teria|posso|pode|podemos|consegue|consigo|d[aá]\s+para|d[aá]\s+pra)\b/i,
    /\b(aceita|aceitam|possui|possuem|existe|existem|funciona|hor[aá]rio)\b/i,
    /\b(sabe me dizer|gostaria de saber|queria saber|voc[eê]s?\s+t[eê]m?|tem como)\b/i,
    /\b(preciso saber|informa[cç][aã]o|d[uú]vida|procedimento|como fa[cç]o)\b/i
  ];

  return patterns.some(p => p.test(lower));
}

export function inferFaqCategory(text) {
  if (!text || typeof text !== "string") return "reservas";
  const lower = text.toLowerCase();

  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar|rede|conex[aã]o|sinal|computador|smart\s*tv/i.test(lower)) return "wifi_tecnologia";
  if (/caf[eé]|desjejum|bandeja|lou[cç]a|garrafa\s+t[eé]rmica|cafeteira|p[aã]o|leite|fruta/i.test(lower)) return "cafe_manha";
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa|moto|estacionar|recarga/i.test(lower)) return "garagem";
  if (/check-?in|entrada|cheg(?:ada|ar)|portaria|chave|cart[aã]o|fechadura|acesso|port[aã]o|early|entrar\s+no\s+quarto/i.test(lower)) return "checkin_acesso";
  if (/check-?out|sa[ií]da|desocupa|deixar\s+o\s+flat|entregar\s+(?:chave|cart[aã]o)|late\s+check/i.test(lower)) return "checkout";
  if (/visit(?:a|ante)|convidad|pet|cachorro|c[aã]o|gato|animal|fumo|fumar|cigarro|pernoite|barulho|norma|regra/i.test(lower)) return "regras_visitas_pets";
  if (/piscina|jacuzzi|sauna|academia|cobertura|lazer|churrasqueira|sal[aã]o|condom[ií]nio|pr[eé]dio|edif[ií]cio/i.test(lower)) return "lazer_condominio";
  if (/flat|quarto|apartamento|frigobar|[aá]gua|ar[- ]condicionado|ar\s+condicionado|tomada|voltagem|110|220|ferro|t[aá]bua|secador|toalha|cama|travesseiro|len[cç]ol|chuveiro|banheiro|cozinha|micro-ondas|utens[ií]lio|panela|copo|fog[aã]o|ber[cç]o/i.test(lower)) return "estrutura_flat";

  return "reservas";
}

export function extractFaqKeywords(text) {
  if (!text || typeof text !== "string") return [];
  const stopWords = new Set([
    "de", "a", "o", "que", "e", "do", "da", "em", "um", "para", "com", "nao", "não",
    "uma", "os", "no", "se", "na", "por", "mais", "as", "dos", "como", "mas", "foi",
    "ao", "ele", "das", "tem", "seu", "sua", "ou", "ser", "quando", "muito", "ha", "há",
    "nos", "ja", "já", "esta", "está", "eu", "tambem", "também", "so", "só", "pelo",
    "pela", "ate", "até", "isso", "ela", "entre", "era", "depois", "sem", "mesmo",
    "aos", "ter", "seus", "quem", "nas", "me", "esse", "eles", "estao", "estão",
    "voce", "você", "tinha", "foram", "essa", "num", "nem", "suas", "meu", "minha",
    "qual", "quais", "onde", "posso", "pode", "favor", "gostaria", "queria", "bom",
    "boa", "dia", "tarde", "noite", "ola", "olá", "corpflats", "hotel"
  ]);

  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ");

  const words = clean.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

export function isQuestionMappedInFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return false;
  const lower = text.toLowerCase().trim();
  const cleanTokens = lower
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[\s,.;:?!+=\-_/\\()]+/)
    .filter(w => w.length > 2);

  for (const item of db.faqItems) {
    if (!item || item.status !== "ativo") continue;
    if (typeof isFaqApplicableToClient === "function" && !isFaqApplicableToClient(item, clientPhone)) continue;

    const qLower = (item.question || "").toLowerCase().trim();
    if (qLower && (lower.includes(qLower) || qLower.includes(lower))) return true;

    if (Array.isArray(item.variations)) {
      for (const v of item.variations) {
        if (!v) continue;
        const vLower = String(v).toLowerCase().trim();
        if (vLower && (lower.includes(vLower) || vLower.includes(lower))) return true;
      }
    }

    if (Array.isArray(item.keywords) && item.keywords.length > 0) {
      const kwMatches = item.keywords.filter(k => {
        if (!k) return false;
        const kNorm = String(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return cleanTokens.includes(kNorm) || lower.includes(kNorm);
      });
      if (kwMatches.length >= 2) return true;
    }
  }

  return false;
}

export function findExistingPendingFaq(text, db, clientPhone) {
  if (!db || !Array.isArray(db.faqItems) || !text) return null;
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const cleanPhone = clientPhone ? cleanWhatsAppPhone(clientPhone) : null;

  return db.faqItems.find(item => {
    if (!item || (item.status !== "pendente" && item.status !== "aguardando_aprovacao")) return false;
    const qLower = (item.question || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (qLower === lower) return true;
    if (cleanPhone && (item.sourceClientPhone || (Array.isArray(item.clientPhones) && item.clientPhones.length > 0))) {
      const phoneMatches = (item.sourceClientPhone && matchClientPhone(item.sourceClientPhone, cleanPhone)) ||
        (Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone)));
      if (phoneMatches && (lower.includes(qLower) || qLower.includes(lower))) return true;
    }
    return false;
  }) || null;
}

export function autoCreatePendingFaq({
  db,
  questionText,
  senderPhone,
  senderName,
  saveDatabase,
  createNotification
}) {
  if (!db) return null;
  if (!Array.isArray(db.faqItems)) db.faqItems = [];

  const text = (questionText || "").trim();
  if (!text) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  const existing = findExistingPendingFaq(text, db, cleanPhone);
  if (existing) {
    if (Array.isArray(existing.variations) && !existing.variations.includes(text)) {
      existing.variations.push(text);
    }
    existing.updatedAt = new Date().toISOString();
    if (cleanPhone && !existing.clientPhones?.some(p => matchClientPhone(p, cleanPhone))) {
      if (!Array.isArray(existing.clientPhones)) existing.clientPhones = [];
      existing.clientPhones.push(cleanPhone);
    }
    if (typeof saveDatabase === "function") {
      try { saveDatabase(); } catch (_) {}
    }
    return existing;
  }

  const now = new Date().toISOString();
  const category = inferFaqCategory(text);
  const keywords = extractFaqKeywords(text);
  const randomSuffix = Math.random().toString(36).substring(2, 7);

  const newFaq = {
    id: `faq_${Date.now()}_${randomSuffix}`,
    question: text,
    answer: "",
    category,
    keywords,
    variations: [text],
    status: "pendente",
    source: "auto_aprendizado",
    scope: "all",
    clientPhones: cleanPhone ? [cleanPhone] : [],
    sourceClientPhone: cleanPhone,
    sourceClientName: senderName || "Hóspede",
    metadata: {
      customerPhone: cleanPhone,
      customerName: senderName || "Hóspede",
      askedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  db.faqItems.push(newFaq);

  if (typeof saveDatabase === "function") {
    try { saveDatabase(); } catch (_) {}
  }

  if (typeof createNotification === "function") {
    try {
      createNotification({
        title: `❓ Nova Dúvida Hóspede: ${senderName || cleanPhone}`,
        message: `Pergunta não mapeada recebida: "${text.substring(0, 100)}". Registrada como pendente no FAQ.`,
        type: "whatsapp_faq_pending",
        link: "/whatsapp-automation"
      });
    } catch (_) {}
  }

  console.log(`[Auto-Aprendizado FAQ] Nova dúvida não mapeada registrada como pendente: "${text}" (${cleanPhone})`);

  return newFaq;
}

/**
 * Processa mensagens recebidas no Webhook Z-API e aciona o Agente de IA de forma autônoma
 */
export async function processAiInboundMessage({
  db,
  incomingInfo,
  cleanTarget,
  saveDatabase,
  createNotification,
  sendZapiMessage,
  appendMessageFn
}) {
  if (!incomingInfo || incomingInfo.fromMe || incomingInfo.isGroup || !incomingInfo.text || !cleanTarget) {
    return { skipped: true, reason: "not_eligible" };
  }

  const aiConfig = getWhatsAppAiConfig(db);

  // 1. Verifica se a IA está habilitada globalmente
  if (aiConfig.enabled === false) {
    return { skipped: true, reason: "ai_disabled" };
  }

  // 2. Verifica se está em Modo de Teste
  if (db?.zapiConfig?.testModeOnly === true) {
    const allowed = [...DEFAULT_TEST_ALLOWED_PHONES, ...String(db.zapiConfig.testAllowedPhones || "").split(/[,\s]+/)]
      .map(p => cleanWhatsAppPhone(p))
      .filter(Boolean);
    const targetNorm = cleanWhatsAppPhone(cleanTarget);
    const isAllowed = allowed.some(a => targetNorm.endsWith(a.slice(-8)) || a.endsWith(targetNorm.slice(-8)));
    if (!isAllowed) {
      console.log(`[WhatsApp AI] Modo de Teste ativo: mensagem de ${cleanTarget} ignorada pela IA.`);
      return { skipped: true, reason: "test_mode_not_allowed" };
    }
  }

  // 3. Obtém ou cria a conversa
  const conv = (db?.whatsappConversations || []).find(c => {
    const p = cleanWhatsAppPhone(c.phone);
    return p && (p.endsWith(cleanTarget.slice(-8)) || cleanTarget.endsWith(p.slice(-8)));
  });

  // Se a conversa estiver pausada manualmente (operador assumiu ou hóspede pediu humano)
  if (conv && conv.aiPaused === true) {
    console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
    return { skipped: true, reason: "conversation_ai_paused" };
  }

  // 4. Verifica Modo de Atuação
  if (aiConfig.mode === "copilot") {
    // Modo apenas Copiloto: não responde sozinho
    return { skipped: true, reason: "mode_copilot_only" };
  }

  if (aiConfig.mode === "off_hours") {
    // Horário fora de expediente
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const brDate = new Date(utc + (-3 * 60 * 60000));
    const currentHour = brDate.getHours() + (brDate.getMinutes() / 60);

    const [startH, startM] = (aiConfig.offHoursStart || "18:00").split(":").map(Number);
    const [endH, endM] = (aiConfig.offHoursEnd || "08:00").split(":").map(Number);
    const startVal = startH + (startM / 60);
    const endVal = endH + (endM / 60);

    let isOffHours = false;
    if (startVal > endVal) {
      // Ex: 18:00 às 08:00 (cruza meia-noite)
      isOffHours = currentHour >= startVal || currentHour <= endVal;
    } else {
      isOffHours = currentHour >= startVal && currentHour <= endVal;
    }

    if (!isOffHours) {
      console.log(`[WhatsApp AI] Modo Fora do Expediente ativo, mas está em horário comercial (${brDate.toLocaleTimeString()}).`);
      return { skipped: true, reason: "business_hours_active" };
    }
  }

  // 5. Histórico da conversa
  const history = conv?.messages || [];

  // 6. Gera a resposta do Agente de IA
  const aiResult = await generateAiWhatsAppResponse({
    db,
    phone: cleanTarget,
    messageText: incomingInfo.text,
    history,
    isCopilot: false
  });

  // 6.5. Auto-Aprendizado: Detecção e Registro de Perguntas Não Mapeadas (R2)
  const isQuestion = isPotentialGuestQuestion(incomingInfo.text);
  const isMapped = isQuestionMappedInFaq(incomingInfo.text, db, cleanTarget);
  const isFallback = aiResult.modelUsed === "heuristic_fallback" || aiResult.source === "heuristic";
  const needsHandoverOrFallback = Boolean(aiResult.shouldHandover || aiResult.requiresHandover || isFallback);

  let unmappedFaq = null;
  if (isQuestion && !isMapped && needsHandoverOrFallback) {
    unmappedFaq = autoCreatePendingFaq({
      db,
      questionText: incomingInfo.text,
      senderPhone: incomingInfo.senderPhone || cleanTarget,
      senderName: incomingInfo.senderName || conv?.name || "Hóspede",
      saveDatabase,
      createNotification
    });
  }

  // 7. Se for transbordo humano:
  if (aiResult.shouldHandover) {
    if (conv) {
      conv.aiPaused = true;
      conv.aiPausedAt = new Date().toISOString();
      conv.aiPausedReason = "guest_requested_human";
    }

    // Envia mensagem educada de transbordo
    if (typeof sendZapiMessage === "function") {
      await sendZapiMessage(db.zapiConfig, {
        phone: cleanTarget,
        message: aiResult.replyText,
        bypassTestMode: true
      });
    }

    // Registra a mensagem no histórico do chat
    if (typeof appendMessageFn === "function") {
      appendMessageFn(db, {
        phone: cleanTarget,
        senderName: aiConfig.agentName || "Sofia",
        fromMe: true,
        text: aiResult.replyText,
        type: "text",
        status: "delivered",
        timestamp: new Date().toISOString()
      });
    }

    // Notificação de alta prioridade para o operador
    if (typeof createNotification === "function") {
      createNotification({
        title: `🚨 Transbordo Humano: ${conv?.name || cleanTarget}`,
        message: `Hóspede solicitou atendimento humano no WhatsApp ("${incomingInfo.text}"). IA pausada na conversa.`,
        type: "whatsapp_handover",
        link: `/whatsapp-chat?phone=${cleanTarget}`
      });
    }

    if (typeof saveDatabase === "function") saveDatabase();
    return {
      handled: true,
      handover: true,
      replyText: aiResult.replyText,
      unmappedFaqCreated: Boolean(unmappedFaq),
      unmappedFaq
    };
  }

  // 8. Resposta Autônoma Normal:
  const delaySec = typeof aiConfig.responseDelaySeconds === "number" ? aiConfig.responseDelaySeconds : 3;
  const delayMs = (process.env.NODE_ENV === "test" || delaySec === 0) ? 0 : Math.max(500, delaySec * 1000);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  if (typeof sendZapiMessage === "function") {
    await sendZapiMessage(db.zapiConfig, {
      phone: cleanTarget,
      message: aiResult.replyText,
      bypassTestMode: true
    });
  }

  if (typeof appendMessageFn === "function") {
    appendMessageFn(db, {
      phone: cleanTarget,
      senderName: aiConfig.agentName || "Sofia",
      fromMe: true,
      text: aiResult.replyText,
      type: "text",
      status: "delivered",
      timestamp: new Date().toISOString()
    });
  }

  if (typeof saveDatabase === "function") saveDatabase();

  return {
    handled: true,
    handover: false,
    replyText: aiResult.replyText,
    source: aiResult.source,
    modelUsed: aiResult.modelUsed,
    unmappedFaqCreated: Boolean(unmappedFaq),
    unmappedFaq
  };
}
