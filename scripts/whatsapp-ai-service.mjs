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

import { cleanWhatsAppPhone, DEFAULT_TEST_ALLOWED_PHONES, isFaqApplicableToClient, matchClientPhone, generateStaticPixPayload, linkOperatorResponseToPendingFaq, captureOperatorResponseForFaq, isDeveloperPhone, DEVELOPER_PHONES, doesReservationMatchPhone, findAllReservationsByPhone, formatPhoneDisplay } from "./zapi-service.mjs";
import { getCheckinUrlSync as getSerproCheckinUrlSync } from "./fnrh-serpro-service.mjs";

export { isFaqApplicableToClient, matchClientPhone, linkOperatorResponseToPendingFaq, captureOperatorResponseForFaq, isDeveloperPhone, DEVELOPER_PHONES, doesReservationMatchPhone, findAllReservationsByPhone, formatPhoneDisplay };

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
  systemPrompt: `Você é a Sofia, concierge virtual inteligente e acolhedora dos flats de alto padrão da CorpFlats no Edifício Soho Residence Service em Campos dos Goytacazes/RJ.
Seu objetivo é encantar os hóspedes, responder dúvidas com precisão e fornecer assistência ágil e atenciosa.

RACIOCÍNIO E DIRETRIZES DE CONVERSAÇÃO:
1. Responda em português brasileiro de forma acolhedora, prestativa e concisa (ideal para leitura dinâmica em telas de celular no WhatsApp).
2. Use emojis amigáveis com moderação (🏨, ✨, 🔑, ☕, 🚗, 🕒, 📍).
3. Postura de Escuta Ativa e Saudação Natural:
- Se o hóspede ou cliente enviou apenas uma saudação inicial (ex: "olá", "oi", "bom dia", "boa tarde", "boa noite", "tudo bem?"): responda com simpatia natural, cumprimente pelo nome se souber e apenas pergunte abertamente como pode ajudar hoje (ex: "Olá, Miller! Tudo bem? Sou a Sofia, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊").
- NUNCA presuma que já sabe do que se trata o contato logo na saudação. Não faça suposições precipitadas nem despeje datas ou status de reserva logo de início sem que o hóspede tenha perguntado.
- NUNCA ofereça ajuda com malas ou bagagens (o condomínio Soho não dispõe de serviço de maleiros/carregadores e essa oferta não condiz com a nossa operação).
4. Uso Contextual do Conhecimento (Sob Demanda):
- Tenha total consciência do CONTEXTO DO HÓSPEDE nos bastidores (número do flat, status da estadia, datas de check-in/out, regras de Wi-Fi, garagem, café, etc., ou a ausência de reserva).
- Use esse conhecimento para formular uma resposta coerente, precisa e personalizada CONFORME O QUE O HÓSPEDE PERGUNTAR.
  * Exemplo: se ele perguntar a senha da internet, use o Flat do contexto para informar a rede e senha daquele quarto.
  * Exemplo: se perguntar sobre horários de saída ou check-in, use os dados da reserva dele.
  * Exemplo: se perguntar "minha reserva está confirmada?", confirme com o número do flat e datas. Se não encontrar reserva para o número, informe com gentileza e peça o nome ou código.
  * Exemplo: se não tiver reserva e perguntar sobre diárias ou flats, apresente as opções da CorpFlats com entusiasmo.
5. Seja sempre fidedigna às informações fornecidas no CONTEXTO DO HÓSPEDE e na BASE DE CONHECIMENTO. NUNCA invente números de apartamentos, códigos ou senhas que não constem nos dados oficiais.
6. Se o hóspede solicitar expressamente falar com um atendente humano, transborde o atendimento com gentileza informando que a equipe da recepção assumirá a conversa em instantes.`,
  knowledgeBase: {
    address: "Edifício Soho Residence Service, Rua Conselheiro Otaviano, 209 - Centro, Campos dos Goytacazes - RJ",
    checkinTime: "14:00 (Check-in padrão a partir das 14h)",
    checkoutTime: "12:00 (Check-out padrão até às 12h)",
    earlyCheckinPolicy: "Entrada antecipada a partir das 10:00 é um benefício gratuito para reservas diretas (Site ou WhatsApp), ESTRITAMENTE MEDIANTE DISPONIBILIDADE de limpeza prévia do flat pela governança.",
    lateCheckoutPolicy: "Saída após as 12:00 deve ser combinada previamente com a administração e depende de disponibilidade de outros hóspedes.",
    wifiNetwork: "apto {{quarto}} (rede individual por flat com o número do quarto)",
    wifiPassword: "1234567890123",
    breakfastInfo: "O café da manhã é servido exclusivamente via bandeja diretamente no quarto das 05:00 às 09:30, com escolha de itens e agendamento pelo portal /cafe até a véspera. Não há buffet presencial nem restaurante no condomínio. A recepção do condomínio não vende nem gerencia café. Reservas sem café incluso podem solicitar inclusão avulsa com antecedência via WhatsApp da administração CorpFlats.",
    garageInfo: "Garagem rotativa gratuita no condomínio Soho (qualquer vaga livre). É obrigatório cadastrar a placa no Pré-Check-in Digital com antecedência para autorização de entrada na portaria 24h. Comporta veículos normais, SUVs e caminhonetes (altura do portão ~2,10m a 2,20m).",
    petPolicy: "Aceitamos exclusivamente cães (apenas cachorros), máximo de 1 pet até 10kg por apartamento. Custo adicional de R$ 40,00 por dia (diária).",
    smokingPolicy: "Ambiente 100% livre de fumo! É estritamente proibido fumar dentro dos apartamentos e nas áreas fechadas do edifício.",
    amenities: "Flats climatizados (Split), Smart TV, Wi-Fi veloz individual em cada flat, tomadas 127V, ferro de passar disponível (sem tábua), frigobar vazio e ligado para uso particular (sem cortesia de água), cozinha com micro-ondas e utensílios, enxoval completo de hotelaria e ducha aquecida.",
    leisureInfo: "Piscina/jacuzzi aquecida e academia na cobertura funcionando diariamente das 06:00 às 22:00, exclusivo para hóspedes cadastrados (não é permitida a entrada de visitantes na cobertura e proibido vidro na área molhada).",
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
    else {
      // Remove menções legadas a bagagens ou presunções antigas de saudação
      if (current.systemPrompt.includes("bagagem") || current.systemPrompt.includes("malas")) {
        current.systemPrompt = current.systemPrompt.replace(/- Se 'checkout_hoje':.*bagagem\./g, "- Se 'checkout_hoje': o hóspede sai hoje (até 12h); responda cordialmente sem assumir perguntas nem oferecer auxílio com malas.");
      }
      if (current.systemPrompt.includes("5.2. Para saudações iniciais")) {
        current.systemPrompt = current.systemPrompt.replace(/5\.2\. Para saudações iniciais.*?(?=6\.|$)/s, `5.2. Postura de Escuta Ativa e Saudação Natural:
- Se o hóspede ou cliente enviou apenas uma saudação inicial (ex: 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem?'): responda com simpatia natural, cumprimente pelo nome se souber e apenas pergunte abertamente como pode ajudar hoje (ex: 'Olá, Miller! Tudo bem? Sou a Sofia, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊').
- NUNCA presuma que já sabe do que se trata o contato logo na saudação. Não faça suposições precipitadas nem despeje datas ou status de reserva logo de início sem que o hóspede tenha perguntado.
- NUNCA ofereça ajuda com malas ou bagagens (o condomínio Soho não dispõe de serviço de maleiros/carregadores e essa oferta não condiz com a nossa operação).
- Uso Contextual do Conhecimento (Sob Demanda): Mantenha total consciência do CONTEXTO DO HÓSPEDE nos bastidores (número do flat, status da estadia, datas de check-in/out, regras de Wi-Fi, garagem, café, etc., ou a ausência de reserva). Use esse conhecimento para formular uma resposta coerente, precisa e personalizada CONFORME O QUE O HÓSPEDE PERGUNTAR.\n\n`);
      }
    }
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
 * Utilitário Canônico de Fuso Horário de Brasília (America/Sao_Paulo)
 */
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

/**
 * Constrói o contexto em tempo real do hóspede consultando reservas, flats e governança
 */
export function buildGuestContext(db, phone) {
  const cleanPhone = normalizePhone(phone);
  const now = new Date();
  const { todayStr, timeStr } = getBrasiliaDateParts(now);

  let matchedReservation = null;
  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];

  // 1. Busca reserva que coincida com o telefone (prioriza ativa hoje, depois futura confirmada, depois passada)
  if (cleanPhone) {
    const allMatching = typeof findAllReservationsByPhone === "function"
      ? findAllReservationsByPhone(db, cleanPhone)
      : reservations.filter(r => {
          if (!r) return false;
          const rPhone = normalizePhone(r.guestPhone || r.phone || "");
          return rPhone && (cleanPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(cleanPhone.slice(-8)));
        });

    const nonCancelled = allMatching.filter(r => r && r.status !== "cancelada" && r.status !== "cancelled");

    // 1.1 Ativa hoje (em estadia, check-in hoje ou check-out hoje)
    matchedReservation = nonCancelled.find(r => 
      (r.checkinDate === todayStr || r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr))
    );

    // 1.2 Se não está em estadia hoje, procura reserva futura confirmada (ordenada pela data de check-in mais próxima)
    if (!matchedReservation) {
      const futureCandidates = nonCancelled
        .filter(r => (r.checkinDate || "") >= todayStr)
        .sort((a, b) => (a.checkinDate || "").localeCompare(b.checkinDate || ""));
      if (futureCandidates.length > 0) {
        matchedReservation = futureCandidates[0];
      }
    }

    // 1.3 Se não há futura nem ativa, pega a passada mais recente
    if (!matchedReservation && nonCancelled.length > 0) {
      const pastCandidates = nonCancelled
        .sort((a, b) => (b.checkoutDate || b.checkinDate || "").localeCompare(a.checkoutDate || a.checkinDate || ""));
      matchedReservation = pastCandidates[0];
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
    hasReservation: Boolean(matchedReservation && matchedReservation.status !== "cancelada" && matchedReservation.status !== "cancelled" && stayStatus !== "estadia_passada"),
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

// ── Mapeamento Contínuo de Demandas Sem Acesso & Oportunidades de Automação ──

export const UNMET_DEMAND_CATEGORIES = {
  efetivacao_reserva: {
    category: "efetivacao_reserva",
    title: "Efetivação de Reserva no PMS",
    defaultSuggested: "Ativar a chave 'commitReservation' no painel de Ações do Bot para permitir confirmação automática."
  },
  cotacao_diarias: {
    category: "cotacao_diarias",
    title: "Cálculo de Orçamento / Cotação",
    defaultSuggested: "Ativar a chave 'calculateQuote' no painel de Ações do Bot para cálculos automatizados."
  },
  consulta_disponibilidade: {
    category: "consulta_disponibilidade",
    title: "Consulta de Vagas e Disponibilidade",
    defaultSuggested: "Ativar a chave 'checkAvailability' no painel de Ações do Bot para consulta em tempo real."
  },
  geracao_pix: {
    category: "geracao_pix",
    title: "Geração de Cobrança / PIX",
    defaultSuggested: "Ativar a chave 'generatePayment' no painel de Ações do Bot para envio de PIX automático."
  },
  pre_reserva: {
    category: "pre_reserva",
    title: "Criação de Pré-Reserva com Hold",
    defaultSuggested: "Ativar a chave 'createPreReservation' no painel de Ações do Bot para bloqueio temporário."
  },
  cancelamento_reserva: {
    category: "cancelamento_reserva",
    title: "Cancelamento e Estorno de Reserva",
    defaultSuggested: "Desenvolver endpoint de cancelamento com política de reembolso e estorno."
  },
  alteracao_datas: {
    category: "alteracao_datas",
    title: "Alteração de Datas e Remarcação",
    defaultSuggested: "Desenvolver fluxo autônomo de remarcação com recálculo de diárias."
  },
  enxoval_toalhas: {
    category: "enxoval_toalhas",
    title: "Solicitação de Enxoval / Toalhas Extras",
    defaultSuggested: "Integrar com fila de governança para solicitação automática de itens de enxoval."
  },
  chamado_manutencao: {
    category: "chamado_manutencao",
    title: "Abertura de Chamado de Manutenção",
    defaultSuggested: "Integrar com ordens de serviço (serviceOrders) para abertura automática de chamados."
  },
  limpeza_avulsa: {
    category: "limpeza_avulsa",
    title: "Solicitação de Limpeza Avulsa",
    defaultSuggested: "Integrar com agendamento de limpezas da equipe de camareiras."
  },
  late_checkout: {
    category: "late_checkout",
    title: "Solicitação de Late Check-out",
    defaultSuggested: "Desenvolver checagem automática de disponibilidade pós-12h com cobrança proporcional."
  },
  garagem_veiculo: {
    category: "garagem_veiculo",
    title: "Cadastro / Alteração de Placa de Veículo",
    defaultSuggested: "Criar ferramenta para registrar e autorizar veículo diretamente em garageAuthorizations."
  },
  emissao_nota_fiscal: {
    category: "emissao_nota_fiscal",
    title: "Solicitação de Emissão de Nota Fiscal",
    defaultSuggested: "Integrar com módulo fiscal (invoices) para emissão e envio automático de PDF/XML da NF."
  },
  troca_flat: {
    category: "troca_flat",
    title: "Solicitação de Troca de Quarto / Flat",
    defaultSuggested: "Criar fluxo de verificação de troca de UH no PMS com confirmação da recepção."
  },
  cafe_quarto: {
    category: "cafe_quarto",
    title: "Solicitação de Café no Quarto",
    defaultSuggested: "Integrar com módulo de produção de café da manhã para entrega no flat."
  },
  operacoes_sistema_pausadas: {
    category: "operacoes_sistema_pausadas",
    title: "Operação com Chave Mestra Pausada",
    defaultSuggested: "Reativar Chave Mestra Global de Ações do Bot no painel do Agente de IA."
  },
  outros: {
    category: "outros",
    title: "Demanda Não Mapeada com Transbordo Humano",
    defaultSuggested: "Analisar mensagem para mapear novo recurso ou ferramenta de automação no bot."
  }
};

export function classifyUnmetDemand(text = "", actionTarget = null, explicitReason = null) {
  const cleanText = String(text || "").trim();
  const lower = cleanText.toLowerCase();

  // 1. Se veio por target de ação do sistema (chave desativada)
  if (actionTarget) {
    if (actionTarget === "commitReservation") {
      return {
        category: "efetivacao_reserva",
        demandTitle: UNMET_DEMAND_CATEGORIES.efetivacao_reserva.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.efetivacao_reserva.defaultSuggested
      };
    }
    if (actionTarget === "calculateQuote") {
      return {
        category: "cotacao_diarias",
        demandTitle: UNMET_DEMAND_CATEGORIES.cotacao_diarias.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.cotacao_diarias.defaultSuggested
      };
    }
    if (actionTarget === "checkAvailability") {
      return {
        category: "consulta_disponibilidade",
        demandTitle: UNMET_DEMAND_CATEGORIES.consulta_disponibilidade.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.consulta_disponibilidade.defaultSuggested
      };
    }
    if (actionTarget === "generatePayment") {
      return {
        category: "geracao_pix",
        demandTitle: UNMET_DEMAND_CATEGORIES.geracao_pix.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.geracao_pix.defaultSuggested
      };
    }
    if (actionTarget === "createPreReservation") {
      return {
        category: "pre_reserva",
        demandTitle: UNMET_DEMAND_CATEGORIES.pre_reserva.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.pre_reserva.defaultSuggested
      };
    }
  }

  // 2. Se a razão explícita for chave mestra desativada
  if (explicitReason === "master_switch_disabled") {
    return {
      category: "operacoes_sistema_pausadas",
      demandTitle: UNMET_DEMAND_CATEGORIES.operacoes_sistema_pausadas.title,
      reason: "action_disabled",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.operacoes_sistema_pausadas.defaultSuggested
    };
  }

  // 3. Regras de Heurística Semântica para Novas Funcionalidades / Gaps
  if (/\b(?:cancelar|cancelamento|cancele|desistir|desisti|estorno|estornar)\b/i.test(lower)) {
    return {
      category: "cancelamento_reserva",
      demandTitle: UNMET_DEMAND_CATEGORIES.cancelamento_reserva.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.cancelamento_reserva.defaultSuggested
    };
  }

  if (/\b(?:alterar|mudar|trocar|adiar|antecipar|remarcar)\s+(?:as?|os?|minhas?|meus?|de)?\s*(?:data|datas|check-?in|check-?out|dia|dias|estadia|periodo|per[ií]odo)\b/i.test(lower)) {
    return {
      category: "alteracao_datas",
      demandTitle: UNMET_DEMAND_CATEGORIES.alteracao_datas.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.alteracao_datas.defaultSuggested
    };
  }

  if (/\b(?:toalha|toalhas|len[cç]ol|len[cç][oó]is|travesseiro|travesseiros|cobertor|cobertores|enxoval|manta|edredom)\b/i.test(lower)) {
    return {
      category: "enxoval_toalhas",
      demandTitle: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.defaultSuggested
    };
  }

  if (/\b(?:ar\s*(?:condicionado|split)?\s*(?:n[aã]o\s*gela|parou|quebrou|n[aã]o\s*liga)|chuveiro\s*(?:n[aã]o\s*esquenta|queimou|frio)|vazamento|pia\s*entupida|vaso\s*entupido|l[aâ]mpada\s*queimada|fechadura|porta\s*(?:n[aã]o\s*abre|emperrou)|tv\s*(?:n[aã]o\s*liga|sem\s*sinal)|manuten[cç][aã]o)\b/i.test(lower)) {
    return {
      category: "chamado_manutencao",
      demandTitle: UNMET_DEMAND_CATEGORIES.chamado_manutencao.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.chamado_manutencao.defaultSuggested
    };
  }

  if (/\b(?:limpeza\s*(?:extra|avulsa|hoje|agora)|pedir\s*(?:limpeza|faxina)|faxina|camareira\s*(?:no\s*quarto|pode\s*limpar)|limpar\s*(?:o\s*)?(?:meu\s*)?quarto\s*(?:hoje|agora))\b/i.test(lower)) {
    return {
      category: "limpeza_avulsa",
      demandTitle: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.defaultSuggested
    };
  }

  if (/\b(?:late\s*check-?out|sair\s*mais\s*tarde|sa[ií]da\s*tardia|estender\s*(?:a\s*)?(?:estadia|sa[ií]da|di[aá]ria)|desocupar\s*mais\s*tarde|sair\s*(?:as|às)\s*(?:1[3-9]|20)\b)/i.test(lower)) {
    return {
      category: "late_checkout",
      demandTitle: UNMET_DEMAND_CATEGORIES.late_checkout.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.late_checkout.defaultSuggested
    };
  }

  if (/\b(?:placa|garagem|estacionamento|cadastrar\s*ve[ií]culo|trocar\s*de\s*carro|mudei\s*de\s*carro|carro\s*novo|autorizar\s*carro)\b/i.test(lower)) {
    return {
      category: "garagem_veiculo",
      demandTitle: UNMET_DEMAND_CATEGORIES.garagem_veiculo.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.garagem_veiculo.defaultSuggested
    };
  }

  if (/\b(?:nota\s*fiscal|nf|nfe|fatura|recibo\s*fiscal|comprovante\s*fiscal|cnpj\s*(?:na\s*nota)?)\b/i.test(lower)) {
    return {
      category: "emissao_nota_fiscal",
      demandTitle: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.emissao_nota_fiscal.defaultSuggested
    };
  }

  if (/\b(?:trocar\s*de\s*(?:quarto|flat|apartamento)|mudar\s*de\s*(?:quarto|flat|apartamento)|outro\s*flat|andar\s*mais\s*alto)\b/i.test(lower)) {
    return {
      category: "troca_flat",
      demandTitle: UNMET_DEMAND_CATEGORIES.troca_flat.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.troca_flat.defaultSuggested
    };
  }

  if (/\b(?:caf[eé]\s*(?:da\s*manh[aã])?\s*(?:no\s*quarto|servido\s*no\s*quarto)|room\s*service|delivery\s*de\s*caf[eé])\b/i.test(lower)) {
    return {
      category: "cafe_quarto",
      demandTitle: UNMET_DEMAND_CATEGORIES.cafe_quarto.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.cafe_quarto.defaultSuggested
    };
  }

  return {
    category: "outros",
    demandTitle: UNMET_DEMAND_CATEGORIES.outros.title,
    reason: explicitReason || "requires_operator",
    actionTarget: null,
    suggestedFeature: UNMET_DEMAND_CATEGORIES.outros.defaultSuggested
  };
}

export function findExistingUnmetDemand(db, category, text, cleanPhone) {
  if (!db || !Array.isArray(db.unmetDemands)) return null;

  return db.unmetDemands.find(item => {
    if (!item || item.status === "descartada" || item.status === "implementada") return false;
    if (item.category !== category) return false;

    // Se tiver telefone e for a mesma categoria, agrupa com alta preferência
    if (cleanPhone && Array.isArray(item.clientPhones) && item.clientPhones.some(p => matchClientPhone(p, cleanPhone))) {
      return true;
    }

    // Se for a mesma categoria e não for 'outros'
    if (category !== "outros") {
      return true;
    }

    const itemText = (item.rawMessage || "").toLowerCase();
    const curText = (text || "").toLowerCase();
    return itemText === curText || (item.variations || []).some(v => v.toLowerCase() === curText);
  });
}

export function detectAndRecordUnmetDemand({
  db,
  text,
  senderPhone,
  senderName,
  guestContext = null,
  actionTarget = null,
  reason = null,
  saveDatabase = null,
  createNotification = null
}) {
  if (!db) return null;
  if (!Array.isArray(db.unmetDemands)) db.unmetDemands = [];

  const rawText = String(text || "").trim();
  if (!rawText && !actionTarget) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  // Descarta mensagens que são apenas saudações ou despedidas sem demanda
  if (rawText && !actionTarget) {
    const isGreeting = /^(?:oi|ol[aá]|opa|ei|bom dia|boa tarde|boa noite|tchau|obrigado|obrigada|valeu|ok|beleza|sim|n[aã]o)[.!?\s]*$/i.test(rawText);
    if (isGreeting) return null;
  }

  const classification = classifyUnmetDemand(rawText, actionTarget, reason);
  const now = new Date().toISOString();

  // Verifica se já existe uma demanda em aberto similar
  const existing = findExistingUnmetDemand(db, classification.category, rawText, cleanPhone);

  if (existing) {
    existing.occurrencesCount = (existing.occurrencesCount || 1) + 1;
    existing.lastDetectedAt = now;
    if (rawText && Array.isArray(existing.variations) && !existing.variations.includes(rawText)) {
      existing.variations.push(rawText);
      if (existing.variations.length > 20) existing.variations = existing.variations.slice(-20);
    }
    if (cleanPhone && Array.isArray(existing.clientPhones) && !existing.clientPhones.includes(cleanPhone)) {
      existing.clientPhones.push(cleanPhone);
    }
    if (senderName && senderName !== "Hóspede" && (!existing.senderName || existing.senderName === "Hóspede")) {
      existing.senderName = senderName;
    }
    if (guestContext && Object.keys(guestContext).length > 0) {
      existing.guestContext = { ...(existing.guestContext || {}), ...guestContext };
    }
    if (typeof saveDatabase === "function") {
      try { saveDatabase("unmet_demand_updated"); } catch (_) {}
    }
    return existing;
  }

  // Cria novo registro de demanda
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const newDemand = {
    id: `demand_${Date.now()}_${randomSuffix}`,
    category: classification.category,
    demandTitle: classification.demandTitle,
    reason: classification.reason,
    actionTarget: classification.actionTarget || null,
    suggestedFeature: classification.suggestedFeature,
    rawMessage: rawText,
    variations: rawText ? [rawText] : [],
    senderPhone: cleanPhone,
    clientPhones: cleanPhone ? [cleanPhone] : [],
    senderName: senderName || "Hóspede",
    guestContext: guestContext || null,
    status: "nova",
    occurrencesCount: 1,
    firstDetectedAt: now,
    lastDetectedAt: now,
    adminNotes: ""
  };

  db.unmetDemands.unshift(newDemand);

  if (typeof saveDatabase === "function") {
    try { saveDatabase("unmet_demand_created"); } catch (_) {}
  }

  if (typeof createNotification === "function") {
    try {
      createNotification("demanda_ia", `💡 Nova Demanda Mapeada: ${newDemand.demandTitle} (${senderName || cleanPhone})`, {
        link: "/whatsapp-automation?tab=demands_backlog",
        demandId: newDemand.id
      });
    } catch (_) {}
  }

  console.log(`[Demandas IA] Nova demanda mapeada: "${newDemand.demandTitle}" (Motivo: ${newDemand.reason}, Categoria: ${newDemand.category})`);

  return newDemand;
}

/**
 * Executa uma ação interna do bot com checagem de permissão e chave mestra
 */
export async function executeBotAction(db, actionName, args = {}) {
  const settings = getBotActionsSettings(db);

  if (!settings.apiActionsEnabled || !settings.allowedActions?.[actionName]) {
    try {
      detectAndRecordUnmetDemand({
        db,
        text: args.messageText || `Tentativa de acionar a ação '${actionName}'`,
        senderPhone: args.phone || args.guestPhone || "",
        senderName: args.guestName || "Hóspede",
        guestContext: args.guestContext || null,
        actionTarget: actionName,
        reason: "action_disabled"
      });
    } catch (_) {}

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
  "voce", "voces", "você", "vocês",
  "possui", "possuem", "ter", "deve", "devem",
  "alguem", "alguém", "pessoa", "pessoas",
  "esta", "está", "estao", "estão", "estou",
  "favor", "por favor", "gostaria", "queria", "saber",
  "verificar", "perguntar", "dizer", "falar", "responder"
]);

// ── Motor de Treinamento Inteligente, Calibração de Tom e Modo Desenvolvedor ──

/**
 * Sintetiza o texto de coaching do desenvolvedor em uma diretriz profissional
 * sem repetir erros de digitação ou frases informais literais ("Anti-Papagaio")
 */
export function synthesizeGuidelineFromText(rawText, category = "geral") {
  const text = String(rawText || "").trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Caso 1: Regra sobre malas / bagagens
  if (/malas?|bagag/i.test(lower)) {
    return "Nunca oferecer auxílio com malas ou bagagens. O condomínio Soho não dispõe de serviço de maleiros ou carregadores, mantendo o atendimento focado no acolhimento e nas dúvidas do hóspede.";
  }

  // Caso 2: Regra sobre postura de escuta ativa / sem presunção em saudações
  if (/(?:n[aã]o\s+assumir|s[oó]\s+pergunt|como\s+pode\s+ajudar|racioc[ií]nio|apenas\s+responder)/i.test(lower) || (/(?:sauda[cç][aã]o|bom\s+dia|ol[aá])/i.test(lower) && /(?:h[oó]spede|reserva|ajud)/i.test(lower))) {
    return "Adotar postura de escuta ativa: em saudações iniciais (olá, bom dia, etc.), cumprimentar cordialmente e apenas perguntar abertamente como pode ajudar hoje, sem presumir o assunto e sem despejar detalhes da reserva logo de início. O conhecimento sobre o hóspede ou reserva deve ser usado nos bastidores para responder com coerência sob demanda, conforme o que for perguntado.";
  }

  // Caso 3: Regra sobre checagem de reserva
  if (/pergu?i?nt.*reserva|verific.*reserva/i.test(lower)) {
    return "Ao ser questionada se tem reserva ou se a reserva está confirmada ('minha reserva está confirmada?'), verificar no sistema se o hóspede possui reserva ativa para data atual ou futura. Se confirmada, apresentar os detalhes do flat, check-in, check-out e link do pré-check-in. Se não localizada pelo número, solicitar o nome completo do titular ou código da reserva com cortesia.";
  }

  // Caso 1.5: Regra sobre saudação ou perguntar sobre estadia agradável
  if (/(?:perguntar\s+assim|sauda[cç][aã]o|hospedad[ao]|esteja\s+hospedad[ao]|em\s+estadia|tornar\s+a\s+estadia)/i.test(lower)) {
    return "Ao saudar o hóspede, verificar primeiro o status da estadia no sistema: só perguntar sobre 'tornar a estadia mais agradável' se a pessoa já estiver hospedada (em estadia). Se for reserva futura, check-in hoje que ainda não entrou ou sem reserva, adaptar a saudação ao momento exato da chegada.";
  }

  // Caso 2: Regra sobre café com horário específico informado
  if (/caf[eé]|desjejum/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário do café da manhã é ${timeMatch[0]} em bandeja servida no quarto, com agendamento até a véspera pelo portal.`;
    }
  }

  // Caso 3: Regra sobre check-in / check-out com horário específico
  if (/check-?in|entrada/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário de check-in é a partir das ${timeMatch[0]}.`;
    }
  }

  // Caso 4: Regra genérica bem sintetizada preservando fatos
  let synthesized = text
    .replace(/^sofia\s*[,:]\s*/i, "")
    .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:quando|sempre\s+que|toda\s+vez\s+que|se)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+pergu?i?nt[^,.:;]+(?:voc[eê]\s+deve|favor|deve-se|tem\s+que)\s+/i, "Ao ser questionada sobre este tema: ")
    .replace(/^voc[eê]\s+deve\s+/i, "Sempre ")
    .trim();

  if (synthesized.length > 0) {
    synthesized = synthesized.charAt(0).toUpperCase() + synthesized.slice(1);
    if (!synthesized.endsWith(".")) synthesized += ".";
  }

  return synthesized;
}

/**
 * Classifica a intenção de mensagens enviadas pelo desenvolvedor/gestor:
 * - tone_calibration: comandos de ajuste estilístico/tom (não literais)
 * - factual_coaching: regras factuais, horários, correções de flats
 * - guest_simulation: simulação de dúvidas de hotelaria/hóspede
 */
export function classifyDeveloperMessage(messageText, db = null) {
  if (!messageText || typeof messageText !== "string") {
    return { type: "guest_simulation", originalText: "" };
  }
  const text = messageText.trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Detecção de Calibração de Tom / Estilo (tone_calibration)
  const toneKeywords = [
    /\b(mais curt[ao]|mais concis[ao]|mais objetiv[ao]|mais sucint[ao]|respostas? curtas?|mais breve|menos prolix[ao]|seja breve|seja curt[ao]|seja concis[ao]|seja objetiv[ao]|reduza o tamanho|responda curto)\b/,
    /\b(mais detalhad[ao]|mais explicativ[ao]|mais complet[ao]|respostas? longas?)\b/,
    /\b(menos emojis?|sem emojis?|n[aã]o use emojis?|evite emojis?|zero emojis?|reduza os emojis?|tire os emojis?)\b/,
    /\b(mais emojis?|use emojis?|bastante emojis?)\b/,
    /\b(mais executiv[ao]|tom executiv[ao]|mais formal|tom formal|mais corporativ[ao]|mais polid[ao])\b/,
    /\b(mais descontra[ií]d[ao]|mais informal|tom informal|tom descontra[ií]d[ao]|mais acolhedor[ao]|mais amig[aá]vel|mais caloros[ao])\b/,
    /\b(calibre seu tom|ajuste o tom|mude o tom|altere o tom|novo tom|estilo de resposta)\b/
  ];

  const isToneMatch = toneKeywords.some(pattern => pattern.test(lower));
  if (isToneMatch) {
    const updates = {};
    if (/\b(mais curt[ao]|mais concis[ao]|mais objetiv[ao]|mais sucint[ao]|respostas? curtas?|mais breve|menos prolix[ao]|seja breve|seja curt[ao]|seja concis[ao]|seja objetiv[ao]|reduza o tamanho|responda curto)\b/.test(lower)) {
      updates.conciseness = "compact";
      updates.ruleText = "Responda de forma curta e objetiva (ideal de 1 a 3 frases para WhatsApp).";
    } else if (/\b(mais detalhad[ao]|mais explicativ[ao]|mais complet[ao]|respostas? longas?)\b/.test(lower)) {
      updates.conciseness = "detailed";
      updates.ruleText = "Forneça explicações detalhadas e completas.";
    }

    if (/\b(sem emojis?|n[aã]o use emojis?|zero emojis?|tire os emojis?)\b/.test(lower)) {
      updates.emojiUsage = "none";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Não utilize emojis.";
    } else if (/\b(menos emojis?|evite emojis?|reduza os emojis?)\b/.test(lower)) {
      updates.emojiUsage = "minimal";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Use emojis com moderação estrita (no máximo 1 emoji pontual).";
    } else if (/\b(mais emojis?|use emojis?|bastante emojis?)\b/.test(lower)) {
      updates.emojiUsage = "expressive";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Utilize emojis acolhedores com mais frequência.";
    }

    if (/\b(mais executiv[ao]|tom executiv[ao]|mais formal|tom formal|mais corporativ[ao]|mais polid[ao])\b/.test(lower)) {
      updates.formality = "executive";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Adote tom executivo, formal e polido.";
    } else if (/\b(mais descontra[ií]d[ao]|mais informal|tom informal|tom descontra[ií]d[ao]|mais amig[aá]vel|mais caloros[ao])\b/.test(lower)) {
      updates.formality = "casual";
      updates.ruleText = (updates.ruleText ? updates.ruleText + " " : "") + "Adote tom descontraído, amigável e caloroso.";
    }

    return {
      type: "tone_calibration",
      updates,
      originalText: text
    };
  }

  // 2. Detecção de Treinamento Factual / Aprendizado de Diretriz (factual_coaching)
  const isDirectDevCoaching = (
    // Miller se identificando como criador/dev
    /\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|sou\s+(?:o\s+)?(?:desenvolvedor|dev|criador|programador))\b/i.test(lower) ||
    // Feedback de erro / crítica comportamental
    /\b(?:n[aã]o\s+deve|n[aã]o\s+pode|n[aã]o\s+pergunte|n[aã]o\s+diga|n[aã]o\s+fale|n[aã]o\s+responda|n[aã]o\s+mande)\s+(?:assim|dessa\s+forma|desse\s+jeito|isso)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+deve\s+(?:perguntar|dizer|falar|responder|mandar|agir|tratar|usar|oferecer))\b/i.test(lower) ||
    /\b(?:malas?|bagag(?:em|ens)?)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+assumir|s[oó]\s+deve\s+usar|apenas\s+responder|esse\s+seja\s+o\s+racioc[ií]nio|racioc[ií]nio)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+faz\s+sentido|a\s+menos\s+que|s[oó]\s+se\s+a\s+pessoa|s[oó]\s+(?:pergunte|fale|diga|mande)\s+se)\b/i.test(lower) ||
    /\b(?:voc[eê]\s+verificou|verifique\s+(?:primeiro|antes)|verificou\s+(?:primeiro|antes)|cheque\s+(?:primeiro|antes))\b/i.test(lower) ||
    /\b(?:t[aá]\s+errad[ao]|est[aá]\s+errad[ao]|t[aá]\s+burra|est[aá]\s+burra|falhando|melhor(?:e|ar)\s+(?:a\s+resposta|isso)|corrij?a|aprenda\s+a)\b/i.test(lower) ||
    /\b(?:por\s+que\s+voc[eê]\s+(?:disse|falou|perguntou|respondeu))\b/i.test(lower) ||
    // Instruções condicionais de atendimento ("quando alguém...", "se o hóspede...")
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+.*?\bpergu?i?nt/i.test(lower) ||
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+pergu?i?nt/i.test(lower) ||
    /\b(?:voc[eê]\s+(?:deve|precisa|tem\s+que)|sempre\s+verifique|favor\s+verificar|verifique\s+se|n[aã]o\s+(?:responda|diga|fale|mande)|responda\s+que|oriente\s+que)\b/i.test(lower) ||
    /\b(informa[cç][aã]o\s+correta|o\s+correto\s+[eé]|nova\s+regra|regra\s+(?:geral|[eé])|aprenda\s+que|anote\s+(?:a[ií]|isso)|grave\s+que|lembre\s+que|hor[aá]rio\s+mudou|mudou\s+para|n[aã]o\s+diga\s+que|nunca\s+diga\s+que|n[aã]o\s+informe\s+que|retifique|corre[cç][aã]o:)\b/i.test(lower) ||
    // Sofia sendo chamada com diretriz ou correção
    (/^sofia\s*[,:]/i.test(lower) && !/^(?:sofia\s*[,:]\s*)?(?:qual|quanto|tem|como|onde|posso|voc[eê]s?\s+t[eê]m|aceita)\s+(?:a\s+senha|o\s+wi-?fi|o\s+hor[aá]rio|o\s+valor|a\s+di[aá]ria|vaga|garagem|caf[eé]|pet|ferro)/i.test(lower)) ||
    (/\b(?:para\s+o\s+flat|no\s+flat|sobre\s+o\s+flat)\s+(\d{2,4})\b/i.test(lower) && /\b(informa[cç][aã]o|corret|regra|senha|mudou)\b/i.test(lower))
  );

  if (isDirectDevCoaching) {
    const flatMatch = text.match(/\b(?:flat|apto|apartamento|quarto)\s*(\d{2,4})\b/i);
    const targetFlat = flatMatch ? flatMatch[1] : null;

    let cleanText = text
      .replace(/^sofia\s*[,:]\s*/i, "")
      .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador)[.!?,;:]*\s*)/i, "")
      .trim();

    let category = "geral";
    if (/(?:sauda[cç][aã]o|hospedad[ao]|esteja\s+hospedad[ao]|perguntar\s+assim|tornar\s+a\s+estadia|n[aã]o\s+assumir|racioc[ií]nio)/i.test(lower)) category = "saudacao";
    else if (/(?:malas?|bagag)/i.test(lower)) category = "malas";
    else if (/reserva|estadia|check-?in\s+futuro|h[oó]spede\s+com\s+reserva/i.test(lower)) category = "reserva";
    else if (/caf[eé]|desjejum/i.test(lower)) category = "cafe";
    else if (/check-?in|entrada/i.test(lower)) category = "checkin";
    else if (/check-?out|sa[ií]da/i.test(lower)) category = "checkout";
    else if (/wi-?fi|internet|senha/i.test(lower)) category = "wifi";
    else if (/garagem|estacionamento|vaga|carro/i.test(lower)) category = "garagem";
    else if (/pet|cachorro|animal/i.test(lower)) category = "pet";
    else if (targetFlat) category = `flat_${targetFlat}`;

    const synthesizedRule = synthesizeGuidelineFromText(cleanText, category);

    return {
      type: "factual_coaching",
      guideline: {
        text: synthesizedRule,
        category,
        targetFlat,
        rawInput: text
      },
      originalText: text
    };
  }

  // 3. Simulação de Hóspede (guest_simulation)
  return {
    type: "guest_simulation",
    originalText: text
  };
}

/**
 * Atualiza a seção de estilo do systemPrompt da Sofia sem apagar as diretrizes essenciais
 */
export function updateSystemPromptTone(basePrompt, tone) {
  if (!basePrompt) return basePrompt;
  const toneBlock = `\n\n[CALIBRAÇÃO DE ESTILO & TOM (ATUALIZADO)]:
- Concisão: ${tone.conciseness === "compact" ? "Alta concisão. Respostas curtas, objetivas (1 a 3 frases), ideais para leitura dinâmica no WhatsApp." : tone.conciseness === "detailed" ? "Explicativo e completo." : "Equilibrado."}
- Emojis: ${tone.emojiUsage === "none" ? "NÃO utilizar emojis." : tone.emojiUsage === "minimal" ? "Emojis mínimos e pontuais (no máximo 1)." : "Moderado e amigável."}
- Formalidade: ${tone.formality === "executive" ? "Executivo e formal." : tone.formality === "casual" ? "Descontraído e acolhedor." : "Profissional acolhedor."}
${Array.isArray(tone.customRules) && tone.customRules.length > 0 ? `- Regras de Estilo Ativas:\n  • ${tone.customRules.join("\n  • ")}` : ""}`;

  if (basePrompt.includes("[CALIBRAÇÃO DE ESTILO & TOM")) {
    return basePrompt.replace(/\[CALIBRAÇÃO DE ESTILO & TOM[\s\S]*?(?=\n\n\[|$)/, toneBlock.trim());
  }
  return basePrompt.trim() + toneBlock;
}

/**
 * Aplica calibração de tom às configurações do sistema (db.whatsappAiSettings e aiConfig)
 */
export function applyToneCalibration(db, updates = {}) {
  if (!db) return null;
  if (!db.whatsappAiSettings) {
    db.whatsappAiSettings = { developerGuidelines: [] };
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

  const tone = db.whatsappAiSettings.toneSettings;
  if (updates.conciseness) tone.conciseness = updates.conciseness;
  if (updates.emojiUsage) tone.emojiUsage = updates.emojiUsage;
  if (updates.formality) tone.formality = updates.formality;
  if (updates.ruleText) {
    if (!Array.isArray(tone.customRules)) tone.customRules = [];
    if (!tone.customRules.includes(updates.ruleText)) {
      tone.customRules.unshift(updates.ruleText);
    }
  }
  tone.updatedAt = new Date().toISOString();

  // Sincroniza com db.zapiConfig.aiAgent se configurado
  if (db.zapiConfig?.aiAgent) {
    db.zapiConfig.aiAgent.toneSettings = { ...tone };
    const basePrompt = db.zapiConfig.aiAgent.systemPrompt || DEFAULT_AI_CONFIG.systemPrompt;
    db.zapiConfig.aiAgent.systemPrompt = updateSystemPromptTone(basePrompt, tone);
  }

  return tone;
}

/**
 * Persiste uma nova diretriz ensinada pelo desenvolvedor em db.whatsappAiSettings.developerGuidelines
 */
export function saveDeveloperGuideline(db, guidelineData = {}) {
  if (!db) return null;
  if (!db.whatsappAiSettings) {
    db.whatsappAiSettings = { developerGuidelines: [] };
  }
  if (!Array.isArray(db.whatsappAiSettings.developerGuidelines)) {
    db.whatsappAiSettings.developerGuidelines = [];
  }

  const newGuideline = {
    id: guidelineData.id || `guideline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: (guidelineData.text || "").trim(),
    category: guidelineData.category || inferFaqCategory(guidelineData.text || "") || "geral",
    targetFlat: guidelineData.targetFlat || null,
    active: guidelineData.active !== undefined ? Boolean(guidelineData.active) : true,
    createdAt: guidelineData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: guidelineData.source || "whatsapp_developer"
  };

  db.whatsappAiSettings.developerGuidelines.unshift(newGuideline);
  return newGuideline;
}

/**
 * Formata confirmação cordial ao desenvolvedor com resumo e amostra no novo tom
 */
export function formatDeveloperToneConfirmation({ toneUpdates = {}, tone = {}, db = null }) {
  const intro = "Entendido perfeitamente, Miller! ⚙️ Diretriz de estilo atualizada no sistema.";

  const summaryItems = [];
  if (tone.conciseness === "compact") {
    summaryItems.push("• *Concisão:* Respostas curtas e objetivas (1 a 3 frases), ideais para WhatsApp.");
  } else if (tone.conciseness === "detailed") {
    summaryItems.push("• *Concisão:* Respostas detalhadas e completas.");
  }
  if (tone.emojiUsage === "none") {
    summaryItems.push("• *Emojis:* Desativados (respostas sem emojis).");
  } else if (tone.emojiUsage === "minimal") {
    summaryItems.push("• *Emojis:* Uso mínimo (no máximo 1 emoji pontual).");
  } else if (tone.emojiUsage === "expressive") {
    summaryItems.push("• *Emojis:* Uso expressivo e caloroso.");
  }
  if (tone.formality === "executive") {
    summaryItems.push("• *Formalidade:* Tom executivo e formal.");
  } else if (tone.formality === "casual") {
    summaryItems.push("• *Formalidade:* Tom descontraído e amigável.");
  }
  if (summaryItems.length === 0 && toneUpdates.ruleText) {
    summaryItems.push(`• *Estilo:* ${toneUpdates.ruleText}`);
  }

  let sample = "";
  if (tone.conciseness === "compact" && tone.emojiUsage === "none") {
    sample = "Olá! Nosso check-in inicia às 14h. Se o flat for liberado antes pela governança, avisamos você imediatamente.";
  } else if (tone.conciseness === "compact") {
    sample = "Olá! Nosso check-in inicia às 14h. Se o flat for liberado antes pela governança, avisamos você imediatamente! 🔑";
  } else if (tone.emojiUsage === "none") {
    sample = "Olá! Nosso check-in inicia às 14h e o check-out é até às 12h. Para reservas diretas, oferecemos early check-in a partir das 10h mediante disponibilidade de higienização.";
  } else if (tone.formality === "executive") {
    sample = "Prezado hóspede, informamos que o procedimento de check-in inicia-se a partir das 14h00. Permanecemos à inteira disposição para qualquer solicitação adicional.";
  } else if (tone.formality === "casual") {
    sample = "Oi! Tudo bem? Nosso check-in começa a partir das 14h, mas se o seu apê ficar pronto antes a gente te dá um toque por aqui! 😊";
  } else {
    sample = "Olá! Nosso check-in inicia às 14h. Se o seu flat estiver pronto antes pela equipe de governança, avisaremos você na hora! 🔑✨";
  }

  return `${intro}\n\n${summaryItems.join("\n")}\n\n👉 *Amostra imediata no novo tom calibrado:*\n"${sample}"\n\nA nova calibração já está em vigor para todas as conversas com hóspedes! 🚀`;
}

/**
 * Formata confirmação cordial ao desenvolvedor para aprendizado de regra factual
 */
export function formatDeveloperCoachingConfirmation({ newGuideline, sampleResponse = null, db = null }) {
  const intro = "Entendido perfeitamente, Miller! 📚 Nova diretriz assimilada na base de conhecimento oficial da Sofia.";
  const details = [
    `• *Regra aprendida:* ${newGuideline.text}`,
    `• *Categoria:* ${newGuideline.category}${newGuideline.targetFlat ? ` (Flat ${newGuideline.targetFlat})` : ""}`,
    `• *Status:* Ativa com prioridade máxima`
  ];

  let sample = sampleResponse;
  if (!sample) {
    if (newGuideline.category === "saudacao" || newGuideline.text.toLowerCase().includes("saudar") || newGuideline.text.toLowerCase().includes("saudação") || newGuideline.text.toLowerCase().includes("hospedada")) {
      sample = "Olá! Vi que você tem uma estadia confirmada a partir de 12/10 no Flat 712. Como posso te ajudar na preparação da sua chegada hoje? 🏨✨";
    } else if (newGuideline.category === "reserva" || newGuideline.text.toLowerCase().includes("reserva")) {
      sample = "Olá! Sim, sua reserva está confirmada! 🏨✨\n• Flat: 605\n• Entrada: 15/10 a partir das 14:00h\n• Saída: 18/10 até as 12:00h\n• Status: Confirmada\n(Se não houver reserva ativa ou futura vinculada ao número, informo com cortesia e solicito o nome do titular ou código da reserva).";
    } else if (newGuideline.category === "cafe" || newGuideline.text.toLowerCase().includes("café")) {
      sample = `Olá! ${newGuideline.text} Qualquer dúvida, estamos à disposição! ☕✨`;
    } else if (newGuideline.targetFlat) {
      sample = `Olá! Sobre o Flat ${newGuideline.targetFlat}: ${newGuideline.text} Conte conosco! 🔑`;
    } else {
      sample = `Olá! Conforme nossa política atualizada: ${newGuideline.text} Estamos à disposição! ✨`;
    }
  }

  return `${intro}\n\n${details.join("\n")}\n\n👉 *Como responderei aos hóspedes:*\n"${sample}"\n\nA diretriz já está ativa e valendo para todos os atendimentos! 🚀`;
}

/**
 * Monta os blocos dinâmicos de instruções de tom e diretrizes para o Gemini
 */
export function buildDynamicSystemInstruction(aiConfig, db, guestContext) {
  const toneSettings = db?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const activeGuidelines = (db?.whatsappAiSettings?.developerGuidelines || [])
    .filter(g => g && g.active !== false);

  let toneSection = "";
  if (toneSettings) {
    const rules = [];
    if (toneSettings.conciseness === "compact") {
      rules.push("SEJA EXTREMAMENTE CONCISA: Responda de forma curta, direta e objetiva (idealmente de 1 a 3 frases). Evite textos longos.");
    } else if (toneSettings.conciseness === "detailed") {
      rules.push("Seja detalhada e forneça explicações completas.");
    }
    if (toneSettings.emojiUsage === "none") {
      rules.push("NÃO USE EMOJIS: Responda sem nenhum emoji.");
    } else if (toneSettings.emojiUsage === "minimal") {
      rules.push("USE EMOJIS COM MODERAÇÃO MÍNIMA: No máximo 1 emoji pontual.");
    }
    if (toneSettings.formality === "executive") {
      rules.push("TOM EXECUTIVO: Adote tom formal, corporativo e polido.");
    } else if (toneSettings.formality === "casual") {
      rules.push("TOM CASUAL: Adote tom descontraído, amigável e caloroso.");
    }
    if (Array.isArray(toneSettings.customRules)) {
      rules.push(...toneSettings.customRules);
    }
    if (rules.length > 0) {
      toneSection = `\n[DIRETRIZES DE ESTILO & CALIBRAÇÃO DE TOM EM VIGOR]\n${rules.map(r => `• ${r}`).join("\n")}\n`;
    }
  }

  let guidelinesSection = "";
  if (activeGuidelines.length > 0) {
    guidelinesSection = `\n[DIRETRIZES DO DESENVOLVEDOR & REGRAS APRENDIDAS (PRIORIDADE MÁXIMA)]\nAs seguintes instruções foram ensinadas pelo gestor/desenvolvedor e POSSUEM PRIORIDADE ABSOLUTA sobre regras gerais anteriores:\n${activeGuidelines.map(g => `• [${g.category || "geral"}${g.targetFlat ? ` | Flat ${g.targetFlat}` : ""}] ${g.text}`).join("\n")}\n`;
  }

  return { toneSection, guidelinesSection };
}

/**
 * Ajusta a resposta heurística para respeitar a calibração de tom
 */
export function applyToneFormatting(text, toneSettings) {
  if (!text || !toneSettings) return text;
  let result = text;

  // 1. Concisão: compact
  if (toneSettings.conciseness === "compact") {
    const paragraphs = result.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length > 1) {
      result = paragraphs[0];
    }
  }

  // 2. Formalidade: executive
  if (toneSettings.formality === "executive") {
    result = result
      .replace(/^Olá,?\s*[^!]*!\s*/i, "Prezado(a) hóspede, informamos que ")
      .replace(/^Oi,?\s*[^!]*!\s*/i, "Prezado(a) hóspede, informamos que ");
  }

  // 3. Emojis: none ou minimal
  if (toneSettings.emojiUsage === "none") {
    result = result.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, "").replace(/\s{2,}/g, " ").trim();
  } else if (toneSettings.emojiUsage === "minimal") {
    const emojis = result.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu);
    if (emojis && emojis.length > 1) {
      let count = 0;
      result = result.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, (match) => {
        count++;
        return count === 1 ? match : "";
      }).replace(/\s{2,}/g, " ").trim();
    }
  }

  return result;
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA
 */
export function formatBrDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return dateStr || "";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
 */
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null, dbParam = null) {
  const text = (messageText || "").toLowerCase().trim();
  const kb = aiConfig.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";

  const activeDb = dbParam || (dbOrFaqs && typeof dbOrFaqs === "object" && !Array.isArray(dbOrFaqs) && dbOrFaqs.whatsappAiSettings ? dbOrFaqs : (typeof globalThis !== "undefined" ? globalThis.db : null));
  const activeGuidelines = (activeDb?.whatsappAiSettings?.developerGuidelines || []).filter(g => g && g.active !== false);
  const toneSettings = activeDb?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings);

  // 0. Diretrizes do Desenvolvedor (Prioridade Máxima)
  if (activeGuidelines.length > 0) {
    // 0.1 Flat específico
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    if (flatNum) {
      const flatGuideline = activeGuidelines.find(g => String(g.targetFlat) === String(flatNum));
      if (flatGuideline) {
        return ret(`Olá${name}! Sobre o Flat ${flatNum}: ${flatGuideline.text} Estamos à disposição! ✨`);
      }
    }

    // 0.2 Café da manhã
    if (/caf[eé]|desjejum/i.test(text)) {
      const cafeGuideline = activeGuidelines.find(g => g.category === "cafe" || (g.text || "").toLowerCase().includes("café"));
      if (cafeGuideline) {
        return ret(`Olá${name}! 🥐☕ ${cafeGuideline.text}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
      }
    }

    // 0.3 Check-in / Horário de Entrada
    if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/pr[eé]-?check-?in/i.test(text)) {
      const checkinGuideline = activeGuidelines.find(g => g.category === "checkin" || (g.text || "").toLowerCase().includes("check-in"));
      if (checkinGuideline) {
        return ret(`Olá${name}! ${checkinGuideline.text} 🔑`);
      }
    }

    // 0.4 Pet / Animais
    if (/pet|cachorro|animal/i.test(text)) {
      const petGuideline = activeGuidelines.find(g => g.category === "pet" || (g.text || "").toLowerCase().includes("pet"));
      if (petGuideline) {
        return ret(`Olá${name}! 🐾 ${petGuideline.text}`);
      }
    }
  }

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
        if (commonWithQ.length >= 2) {
          score += commonWithQ.length * 25;
        } else if (commonWithQ.length === 1 && qTokens.length <= 2) {
          score += 20;
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

    if (bestFaq && highestScore >= 50) {
      return ret(`Olá${name}! ${bestFaq.answer}`);
    }
  }

  // 1. Wi-Fi / Internet
  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text)) {
    const flatNum = guestContext?.flatNumber || "";
    const netName = flatNum ? `apto ${flatNum}` : "apto {número do seu flat}";
    return ret(`Olá${name}! 📶 Cada flat possui sua própria rede Wi-Fi exclusiva para máxima estabilidade e velocidade:\n\n• *Nome da Rede:* ${netName}\n• *Senha:* \`${kb.wifiPassword || "1234567890123"}\`\n\nCaso tenha qualquer dificuldade para conectar, certifique-se de digitar a senha com atenção. Estamos à disposição! ✨`);
  }

  // 2. Café da Manhã (verificado antes de termos genéricos de acomodação)
  if (/caf[eé]|desjejum/i.test(text)) {
    return ret(`Olá${name}! 🥐☕ ${kb.breakfastInfo}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
  }

  // 3. Garagem / Estacionamento / Carro
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa/i.test(text)) {
    return ret(`Olá${name}! 🚗 ${kb.garageInfo}\n\nSe ainda não informou os dados do veículo, acesse seu Pré-Check-in Digital ou envie por aqui a *Placa, Modelo e Cor* que já providenciamos a autorização com a portaria!`);
  }

  // 4. Localização / Endereço / Onde fica
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa/i.test(text)) {
    return ret(`Olá${name}! 📍 Estamos localizados no *${kb.address}*.\n\nLocalização privilegiada no Centro de Campos dos Goytacazes! Se precisar de instruções de rota ou localização no Google Maps, nos avise. 🏨`);
  }

  // 5. Check-in / Horário de Entrada
  if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/pr[eé]-?check-?in/i.test(text)) {
    return ret(`Olá${name}! O horário padrão de check-in é a partir das *${kb.checkinTime}* 🔑.\n\nPara reservas diretas, o early check-in a partir das 10h é gratuito mediante disponibilidade de liberação pela governança.`);
  }

  // 5.1 Check-out / Horário de Saída
  if (/check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da|que\s+horas\s+sair|deixar\s+a\s+chave/i.test(text)) {
    return ret(`Olá${name}! O horário padrão de check-out é até às *${kb.checkoutTime}* ⏰.\n\nPara fazer a saída, pedimos que desligue ar-condicionado e luzes e entregue as chaves/cartão na portaria do condomínio. Caso necessite de late check-out, fale conosco com antecedência! 🙏`);
  }

  // 6. Status do Quarto / Posso entrar? / Está pronto?
  if (/(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)|(?:pront|liberad).*(?:quarto|flat|apartamento)|posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)) {
    if (guestContext.stayStatus === "checkin_hoje") {
      if (guestContext.isRoomReady) {
        return ret(`Ótima notícia${name}! 🎉 O seu *Flat ${guestContext.flatNumber}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`);
      } else {
        return ret(`Olá${name}! O seu *Flat ${guestContext.flatNumber}* está sendo finalizado com todo carinho pela nossa governança para garantir máxima higiene e conforto ✨. O horário oficial de entrada é a partir das *${kb.checkinTime}*. Assim que a limpeza for 100% liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`);
      }
    }
    if (guestContext.stayStatus === "em_estadia") {
      return ret(`Olá${name}! Você está acomodado(a) no *Flat ${guestContext.flatNumber}*. Caso precise de alguma manutenção, toalhas extras ou limpeza durante a estadia, é só nos avisar por aqui que cuidaremos para você! 🛎️`);
    }
  }

  // 6.8 Consulta sobre Reserva Existente / Confirmação de Reserva
  const isExistingReservationInquiry = (
    /(?:m[ij]nhas?\s+reservas?|minhas?\s+di[aá]rias?|minha\s+estadia)/i.test(text) ||
    /(?:reserva|estadia).*(?:confirmad[ao]|aprovad[ao]|status|certo|ok|garantid[ao]|ativa)/i.test(text) ||
    /(?:confirmad[ao]|status|certo|ok).*(?:reserva|estadia)/i.test(text) ||
    /(?:tenho|tem|existe|possui)\s+(?:alguma\s+)?reserva/i.test(text) ||
    /(?:verificar|consultar|conferir|confirmar|saber)\s+(?:minha\s+|se\s+tenho\s+|a\s+)?reserva/i.test(text) ||
    /^(?:est[aá]|t[aá])\s+confirmad[ao]\??$/i.test(text)
  );

  if (isExistingReservationInquiry) {
    if (guestContext?.hasReservation && guestContext?.reservation && guestContext.reservation.status !== "cancelada" && guestContext.reservation.status !== "cancelled") {
      const r = guestContext.reservation;
      const flatStr = r.flatNumber || guestContext.flatNumber || "UH a definir";
      const checkinFmt = r.checkinDate ? formatBrDate(r.checkinDate) : "Data a confirmar";
      const checkoutFmt = r.checkoutDate ? formatBrDate(r.checkoutDate) : "Data a confirmar";
      const stayMsg = guestContext.stayStatus === "reserva_futura"
        ? `Sua estadia está confirmada e programada para início em *${checkinFmt}*!`
        : (guestContext.stayStatus === "checkin_hoje"
          ? `O seu check-in é hoje (${checkinFmt}) a partir das 14:00h!`
          : (guestContext.stayStatus === "em_estadia"
            ? `Você já está acomodado(a) no *Flat ${flatStr}*!`
            : `Sua estadia está confirmada!`));
      const linkUrl = r.checkinUrl || guestContext.checkinUrl;
      const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
      const paymentStr = r.paymentStatus === "pago_total" ? "Pagamento Quitado" : "Pagamento Pendente";
      return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\n${stayMsg}${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua estadia, estou à total disposição!`);
    } else {
      const displayPhone = clientPhone ? ` (*${formatPhoneDisplay ? formatPhoneDisplay(clientPhone) : clientPhone}*)` : "";
      return ret(`Olá${name}! Não localizei nenhuma reserva ativa ou futura confirmada para este número de WhatsApp${displayPhone} no nosso sistema.\n\nSe a sua reserva foi realizada em outro nome, com outro telefone ou por plataformas como Booking.com ou Airbnb, por favor me informe o seu *nome completo* ou o *código da reserva* para que eu possa verificar com a nossa equipe! 🛎️✨`);
    }
  }

  // 7. Cotação / Nova Reserva / Preço
  if (/reserva|diaria|diária|preco|preço|valor|alugar|vaga|disponibilidade/i.test(text)) {
    return ret(`Olá${name}! ✨ Será um enorme prazer receber você no CorpFlats!\n\nDispomos de 19 flats executivos finamente decorados, equipados com ar-condicionado Split, cozinha completa, Wi-Fi veloz e vaga de garagem no melhor ponto de Campos/RJ.\n\nPara consultar disponibilidade exata e garantir a melhor tarifa direta sem taxas de intermediários, acesse nosso site oficial:\n👉 ${kb.siteUrl}\n\nOu me informe as datas desejadas (entrada e saída) que posso te ajudar! 🏨`);
  }

  // 7.5 Pré-Check-in / Link de Check-in
  if (/check-?in\s+online|pr[eé]-?check-?in|ficha(?:\s+de\s+check-?in)?|link(?:\s+do|\s+de)?\s+check-?in/i.test(text)) {
    if (guestContext.checkinUrl) {
      return ret(`Olá${name}! Você pode realizar o seu Pré-Check-in Digital pelo link seguro abaixo:\n👉 ${guestContext.checkinUrl}\n\nO preenchimento antecipado garante a liberação rápida da portaria na sua chegada! Qualquer dúvida, conte conosco. 🏨✨`);
    }
  }

  // 8. Saudação Genérica Natural (Escuta Ativa sem presunção e sem oferta de malas)
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|opa|ei|hello|hi)[!., ]*$/i.test(text)) {
    const lower = text.toLowerCase().trim();
    let greetingWord = "Olá";
    if (lower.startsWith("bom dia")) greetingWord = "Bom dia";
    else if (lower.startsWith("boa tarde")) greetingWord = "Boa tarde";
    else if (lower.startsWith("boa noite")) greetingWord = "Boa noite";
    return ret(`${greetingWord}${name}! Tudo bem? Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨. Como posso te ajudar hoje? 😊`);
  }

  // 9. Resposta padrão prestativa
  return ret(`Olá${name}! Recebi sua mensagem. Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨.\n\nPosso te ajudar com informações sobre *Wi-Fi, horários de check-in/out, status do flat, garagem, café da manhã e localização*. Como posso te ajudar? Se preferir falar com um atendente da recepção, basta me avisar! ✨`);
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
- Wi-Fi Oficial: Cada apartamento tem sua própria rede individualizada no formato "apto {quarto}" (ex: se o quarto for 113, a rede é "apto 113"). A senha é única para todos os apartamentos: "${aiConfig.knowledgeBase.wifiPassword || "1234567890123"}". Se o quarto do hóspede constar no contexto acima, informe a rede específica dele ("apto {quarto}"); caso contrário, explique a regra geral.
- Café da Manhã: ${aiConfig.knowledgeBase.breakfastInfo}
- Garagem e Estacionamento: ${aiConfig.knowledgeBase.garageInfo}
- Animais / Pets: ${aiConfig.knowledgeBase.petPolicy}
- Lazer e Cobertura: ${aiConfig.knowledgeBase.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura das 06:00 às 22:00 exclusivo hóspedes."}
- Fumo: ${aiConfig.knowledgeBase.smokingPolicy}
- Comodidades dos Flats: ${aiConfig.knowledgeBase.amenities}
- Benefícios Reserva Direta: ${aiConfig.knowledgeBase.directBookingBenefits}
- Site Oficial para Reservas: ${aiConfig.knowledgeBase.siteUrl}
- WhatsApp da Recepção: ${aiConfig.knowledgeBase.receptionPhone}
${dynamicFaqPromptSection}
${systemActionsNotice}
`;

  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
  const { toneSection, guidelinesSection } = buildDynamicSystemInstruction(aiConfig, db, guestContext);

  // 3. Tenta responder via Google Gemini (com Function Calling adaptativo se disponível)
  if (apiKey) {
    try {
      const geminiRes = await callGeminiAi({
        apiKey,
        systemInstruction: `${aiConfig.systemPrompt}\n${toneSection}${guidelinesSection}\n${contextString}`,
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
  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs, db);
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
        category: "whatsapp",
        title: `❓ Nova Dúvida Hóspede: ${senderName || cleanPhone}`,
        message: `Pergunta não mapeada recebida: "${text.substring(0, 100)}". Registrada como pendente no FAQ.`,
        type: "whatsapp_faq_pending",
        targetUrl: "/whatsapp-automation",
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

  const isDev = isDeveloperPhone(cleanTarget, db);

  // Se a conversa estiver pausada manualmente (operador assumiu ou hóspede pediu humano)
  if (conv && conv.aiPaused === true) {
    if (isDev) {
      console.log(`[WhatsApp AI] Mensagem de desenvolvedor recebida em conversa pausada. Restaurando atividade da IA.`);
      conv.aiPaused = false;
      conv.aiPausedReason = null;
      conv.isDeveloper = true;
    } else {
      console.log(`[WhatsApp AI] Conversa com ${cleanTarget} com IA pausada. Aguardando atendimento humano.`);
      return { skipped: true, reason: "conversation_ai_paused" };
    }
  }

  // 3.5. Roteamento do Desenvolvedor (Tri-Modal Coaching Engine)
  if (isDev) {
    if (conv) conv.isDeveloper = true;
    const devClassification = classifyDeveloperMessage(incomingInfo.text, db);

    if (devClassification.type === "tone_calibration") {
      console.log(`[WhatsApp AI Developer Mode] Comando de Calibração de Tom recebido de ${cleanTarget}:`, devClassification.updates);
      const updatedTone = applyToneCalibration(db, devClassification.updates);
      if (typeof saveDatabase === "function") {
        try { saveDatabase("developer_tone_calibrated"); } catch (_) {}
      }

      const confirmationText = formatDeveloperToneConfirmation({
        toneUpdates: devClassification.updates,
        tone: updatedTone,
        db
      });

      if (typeof sendZapiMessage === "function") {
        await sendZapiMessage(db.zapiConfig, {
          phone: cleanTarget,
          message: confirmationText,
          bypassTestMode: true
        });
      }

      if (typeof appendMessageFn === "function") {
        appendMessageFn(db, {
          phone: cleanTarget,
          senderName: aiConfig.agentName || "Sofia",
          fromMe: true,
          text: confirmationText,
          status: "delivered",
          messageId: `dev_tone_${Date.now()}`
        });
      }

      return {
        handled: true,
        processed: true,
        mode: "developer_coaching",
        type: "tone_calibration",
        replyText: confirmationText,
        toneSettings: updatedTone
      };
    }

    if (devClassification.type === "factual_coaching") {
      console.log(`[WhatsApp AI Developer Mode] Treinamento Factual recebido de ${cleanTarget}:`, devClassification.guideline);
      const newGuideline = saveDeveloperGuideline(db, devClassification.guideline);
      if (typeof saveDatabase === "function") {
        try { saveDatabase("developer_guideline_saved"); } catch (_) {}
      }

      const confirmationText = formatDeveloperCoachingConfirmation({
        newGuideline,
        db
      });

      if (typeof sendZapiMessage === "function") {
        await sendZapiMessage(db.zapiConfig, {
          phone: cleanTarget,
          message: confirmationText,
          bypassTestMode: true
        });
      }

      if (typeof appendMessageFn === "function") {
        appendMessageFn(db, {
          phone: cleanTarget,
          senderName: aiConfig.agentName || "Sofia",
          fromMe: true,
          text: confirmationText,
          status: "delivered",
          messageId: `dev_guideline_${Date.now()}`
        });
      }

      return {
        handled: true,
        processed: true,
        mode: "developer_coaching",
        type: "factual_coaching",
        replyText: confirmationText,
        guideline: newGuideline
      };
    }

    // Se for guest_simulation, continua o fluxo normal abaixo simulando hóspede
    console.log(`[WhatsApp AI Developer Mode] Simulação de Hóspede por ${cleanTarget}: gerando resposta como Sofia Concierge.`);
  }

  // 4. Verifica Modo de Atuação
  if (aiConfig.mode === "copilot") {
    // Modo apenas Copiloto: não responde sozinho
    return { skipped: true, reason: "mode_copilot_only" };
  }

  if (aiConfig.mode === "off_hours" && !isDev) {
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

  // 6.6. Mapeamento de Demandas Não Atendidas & Oportunidades de Automação
  let unmetDemand = null;
  const isActionDisabled = Boolean(
    aiResult.functionResult?.error === "ACTION_DISABLED" ||
    (aiResult.requiresHandover && aiResult.functionCall)
  );
  const actionTarget = aiResult.functionCall?.name || (aiResult.functionResult?.action || null);
  const demandClassification = classifyUnmetDemand(incomingInfo.text, isActionDisabled ? actionTarget : null);
  const isOperationalDemand = demandClassification.category !== "outros" && demandClassification.category !== "operacoes_sistema_pausadas";

  if (isActionDisabled || aiResult.shouldHandover || aiResult.requiresHandover || isOperationalDemand) {
    try {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: incomingInfo.text,
        senderPhone: incomingInfo.senderPhone || cleanTarget,
        senderName: incomingInfo.senderName || conv?.name || "Hóspede",
        guestContext: aiResult.guestContext || null,
        actionTarget: isActionDisabled ? actionTarget : null,
        reason: isActionDisabled ? "action_disabled" : (aiResult.shouldHandover ? "capability_missing" : "requires_operator"),
        saveDatabase,
        createNotification
      });
    } catch (demErr) {
      console.warn("[Demandas IA] Erro ao registrar demanda não atendida:", demErr.message);
    }
  }

  // 7. Se for transbordo humano:
  if (aiResult.shouldHandover) {
    if (conv && !isDev) {
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
        category: "whatsapp",
        title: `🚨 Transbordo Humano: ${conv?.name || cleanTarget}`,
        message: `Hóspede solicitou atendimento humano no WhatsApp ("${incomingInfo.text}"). IA pausada na conversa.`,
        type: "whatsapp_handover",
        targetUrl: `/whatsapp-chat?phone=${cleanTarget}`,
        link: `/whatsapp-chat?phone=${cleanTarget}`
      });
    }

    if (typeof saveDatabase === "function") saveDatabase();
    return {
      handled: true,
      handover: true,
      replyText: aiResult.replyText,
      unmappedFaqCreated: Boolean(unmappedFaq),
      unmappedFaq,
      unmetDemandCreated: Boolean(unmetDemand),
      unmetDemand
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
    unmappedFaq,
    unmetDemandCreated: Boolean(unmetDemand),
    unmetDemand
  };
}
