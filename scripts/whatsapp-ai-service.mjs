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
- LÓGICA TEMPORAL DE RESERVA E PRÉ-CHECK-IN DIGITAL:
  * HÓSPEDE COM CHECK-OUT HOJE (checkout_hoje) OU JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in! Ele já fez check-in há dias e já está no flat.
  * Para CHECK-OUT HOJE: confirme a reserva, informe que hoje é o dia de check-out (horário limite de desocupação até as 12:00h), oriente sobre os procedimentos de saída, pergunte gentilmente se deseja prorrogar a estadia (solicitar late check-out mediante disponibilidade) ou verifique se já desocupou o flat. Se aplicável, forneça o link de confirmação de check-out.
  * Para EM ESTADIA: informe que ele está acomodado no flat com saída prevista até a data de check-out (até as 12:00h), sem pré-check-in, e ofereça suporte para a estadia em andamento.
  * Para CHECK-IN HOJE ou RESERVA FUTURA: forneça as informações de chegada e o link de Pré-Check-in Digital para agilizar a liberação com a portaria 24h.
5. Cotações, Tarifas e Valores de Diárias (Distinção entre Preço e Logística de Café):
- Quando o hóspede ou cliente perguntar sobre preço, diárias, quanto custa, quanto tá, valores ou cotação (ex: "quanto tá a diária? 1 pessoa com café", "qual o valor da diária com café?", "quanto custa a diária?"):
  * Trate isso ESTRITAMENTE como consulta de COTAÇÃO/TARIFA, NUNCA como uma dúvida operacional sobre entrega de bandeja de café!
  * Apresente os valores das diárias de forma clara, acolhedora e objetiva (ex: diária direta a partir de R$ 237,00 sem café (+ taxa única de limpeza de R$ 70,00); com café da manhã no quarto por apenas R$ 35,00/pessoa adicional, totalizando a partir de R$ 272,00 para 1 pessoa, com o grande benefício de ISENÇÃO TOTAL da taxa de limpeza!).
  * Pergunte para quais datas (entrada e saída) a pessoa deseja se hospedar para consultar a disponibilidade e fornecer o orçamento exato.
6. Seja sempre fidedigna às informações fornecidas no CONTEXTO DO HÓSPEDE e na BASE DE CONHECIMENTO. NUNCA invente números de apartamentos, códigos ou senhas que não constem nos dados oficiais.
7. Se o hóspede solicitar expressamente falar com um atendente humano, transborde o atendimento com gentileza informando que a equipe da recepção assumirá a conversa em instantes.
8. ARQUITETURA EM DUAS VIAS E AUTO-AVALIAÇÃO CRÍTICA OBRIGATÓRIA:
- VIA 1 (Perguntas Genéricas/Institucionais): Responda usando o FAQ ATIVO e a BASE DE CONHECIMENTO oficial (Wi-Fi, localização, horários, regras de pet, fumo, garagem, lazer, comodidades).
- VIA 2 (Leitura do Sistema Operacional): Use as ferramentas autorizadas para consultar dados reais:
  * Tarifas, diárias e valores com ou sem café (getPricingInfo, calculateQuote);
  * Dados e status de reservas (getReservationDetails);
  * Status e higienização de flats/quartos (getFlatStatus);
  * Vagas e disponibilidade para períodos específicos (checkAvailability).
- AUTO-CRÍTICA ANTES DE ENVIAR: Analise criticamente se a sua resposta REALMENTE responde à pergunta feita. Jamais confunda assuntos (se perguntou preço, forneça valores e NUNCA apenas regras de bandeja de café).
- DEMANDAS OPERACIONAIS SEM ACESSO AUTÔNOMO: Se o hóspede solicitar uma ação operacional (cancelamento, alteração de datas, troca de flat, nota fiscal, toalhas extras, chamado de manutenção, itens especiais como berço) ou dados não disponíveis no sistema/FAQ:
  * NÃO invente dados nem dê respostas evasivas;
  * Chame imediatamente a ferramenta recordUnmetDemand para registrar a oportunidade na fila de automação do sistema;
  * Responda de forma acolhedora informando que registrou a solicitação e que a equipe humana da recepção dará seguimento!
9. REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL:
- NUNCA use respostas prontas, engessadas ou cópia-e-cola de mensagens anteriores.
- Use os fatos e diretrizes aprendidos como base de conhecimento vivo para formular respostas inéditas, humanizadas e personalizadas ao contexto do hóspede.
- Se o hóspede enviar saudações (ex: "bom dia", "boa tarde", "olá"), retribua a saudação cordialmente pelo nome do hóspede.
- Se a mensagem contiver múltiplas dúvidas juntas (ex: horário de checkout + se pode estender a reserva pelo WhatsApp), responda a TODOS os pontos de forma clara, acolhedora e integrada na mesma mensagem.`,
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
      if (current.systemPrompt.includes("e o link do Pré-Check-in Digital") || current.systemPrompt.includes("5.1. Para perguntas sobre reserva")) {
        current.systemPrompt = current.systemPrompt.replace(/5\.1\. Para perguntas sobre reserva.*?(?=(?:5\.2|6\.|$))/s, `5.1. Lógica Temporal de Reserva e Pré-Check-in Digital:
- Se o hóspede estiver com CHECK-OUT HOJE (checkout_hoje) ou JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in digital! Ele já realizou check-in há dias e já está no flat.
- Para CHECK-OUT HOJE: confirme a reserva, informe que hoje é o dia de check-out (horário limite de desocupação até as 12:00h), oriente sobre os procedimentos de saída e devolução de chaves, pergunte gentilmente se deseja prorrogar a estadia (solicitar late check-out mediante disponibilidade) ou verifique se já desocupou o flat. Se disponível no contexto, forneça o link de confirmação de check-out.
- Para EM ESTADIA: informe que ele está acomodado no flat com saída prevista até a data de check-out (até as 12:00h), sem pré-check-in, e ofereça suporte para a estadia em andamento.
- Para CHECK-IN HOJE ou RESERVA FUTURA: forneça as informações de chegada e o link de Pré-Check-in Digital para agilizar a liberação com a portaria 24h.
- Se o hóspede NÃO possuir reserva vinculada ao número: informe cordialmente que não localizou reserva ativa ou futura para o número e solicite o nome completo do titular ou código da reserva.\n\n`);
      }
      if (!/l[oó]gica temporal de reserva/i.test(current.systemPrompt)) {
        current.systemPrompt = current.systemPrompt + `\n\n[LÓGICA TEMPORAL DE RESERVA E PRÉ-CHECK-IN DIGITAL]:
- Hóspede com CHECK-OUT HOJE (checkout_hoje) ou JÁ HOSPEDADO (em_estadia): NUNCA envie link de pré-check-in digital!
- Para CHECK-OUT HOJE: confirme a reserva, informe que hoje é o dia de check-out (horário limite até as 12:00h), pergunte se deseja prorrogar (late check-out) ou se já desocupou o flat, e forneça link de confirmação de check-out.
- Para EM ESTADIA: confirme a permanência e apoie na estadia sem pré-check-in.
- Para CHECK-IN HOJE ou RESERVA FUTURA: envie link de Pré-Check-in Digital.`;
      }
      if (!current.systemPrompt.includes("Cotações, Tarifas e Valores de Diárias")) {
        current.systemPrompt = current.systemPrompt + `\n\n5. Cotações, Tarifas e Valores de Diárias (Distinção entre Preço e Logística de Café):
- Quando o hóspede ou cliente perguntar sobre preço, diárias, quanto custa, quanto tá, valores ou cotação (ex: "quanto tá a diária? 1 pessoa com café", "qual o valor da diária com café?", "quanto custa a diária?"):
  * Trate isso ESTRITAMENTE como consulta de COTAÇÃO/TARIFA, NUNCA como uma dúvida operacional sobre entrega de bandeja de café!
  * Apresente os valores das diárias de forma clara, acolhedora e objetiva (ex: diária direta a partir de R$ 237,00 sem café (+ taxa única de limpeza de R$ 70,00); com café da manhã no quarto por apenas R$ 35,00/pessoa adicional, totalizando a partir de R$ 272,00 para 1 pessoa, com o grande benefício de ISENÇÃO TOTAL da taxa de limpeza!).
  * Pergunte para quais datas (entrada e saída) a pessoa deseja se hospedar para consultar a disponibilidade e fornecer o orçamento exato.`;
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
export function buildGuestContext(dbOrOptions, phoneArg, nowArg) {
  let db = dbOrOptions;
  let phone = phoneArg;
  let now = nowArg || new Date();

  if (dbOrOptions && typeof dbOrOptions === "object" && ("db" in dbOrOptions || "cleanPhone" in dbOrOptions || "phone" in dbOrOptions)) {
    db = dbOrOptions.db || null;
    phone = dbOrOptions.cleanPhone || dbOrOptions.phone || null;
    if (dbOrOptions.now) now = dbOrOptions.now;
  }

  const cleanPhone = normalizePhone(phone);
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
  const rawCheckinUrl = matchedReservation ? getCheckinUrlSync(matchedReservation, 1, appOrigin, db) : null;
  const isCheckinRelevant = stayStatus === "checkin_hoje" || stayStatus === "reserva_futura";
  const isCheckoutDay = stayStatus === "checkout_hoje";
  const isHosted = stayStatus === "em_estadia" || isCheckoutDay;
  const checkoutUrl = matchedReservation ? `${appOrigin}/checkout/${matchedReservation.code || matchedReservation.reservationCode || `RES-${flatNumber}`}` : null;
  const checkinUrl = isCheckinRelevant ? rawCheckinUrl : null;

  return {
    todayStr,
    timeStr,
    phone: cleanPhone,
    guestName,
    hasReservation: Boolean(matchedReservation && matchedReservation.status !== "cancelada" && matchedReservation.status !== "cancelled" && stayStatus !== "estadia_passada"),
    checkinUrl,
    rawCheckinUrl,
    checkoutUrl,
    isCheckinRelevant,
    isCheckoutDay,
    isHosted,
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
      checkinUrl,
      rawCheckinUrl,
      checkoutUrl,
      isCheckinRelevant,
      isCheckoutDay,
      isHosted,
      stayStatus
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
    const hasCustomAllowed = s.allowedActions && typeof s.allowedActions === "object";
    return {
      apiActionsEnabled: s.apiActionsEnabled !== false,
      allowedActions: {
        checkAvailability: s.allowedActions?.checkAvailability !== false,
        calculateQuote: s.allowedActions?.calculateQuote !== false,
        generatePayment: s.allowedActions?.generatePayment !== false,
        createPreReservation: s.allowedActions?.createPreReservation !== false,
        commitReservation: s.allowedActions?.commitReservation !== false,
        reallocateReservationFlat: s.allowedActions?.reallocateReservationFlat !== false,
        getFlatAmenities: s.allowedActions?.getFlatAmenities !== false,
        querySystemData: hasCustomAllowed ? s.allowedActions.querySystemData !== false : true,
        getReservationDetails: hasCustomAllowed ? s.allowedActions.getReservationDetails === true : true,
        getFlatStatus: hasCustomAllowed ? s.allowedActions.getFlatStatus === true : true,
        getPricingInfo: hasCustomAllowed ? s.allowedActions.getPricingInfo === true : true,
        recordUnmetDemand: hasCustomAllowed ? s.allowedActions.recordUnmetDemand === true : true,
        informCheckout: hasCustomAllowed ? s.allowedActions.informCheckout === true : false,
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
      commitReservation: true,
      reallocateReservationFlat: true,
      getFlatAmenities: true,
      querySystemData: true,
      getReservationDetails: true,
      getFlatStatus: true,
      getPricingInfo: true,
      recordUnmetDemand: true,
      informCheckout: false
    },
    preReservationHoldMinutes: 30,
    handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano."
  };
}

// ── Utilitários de Mascaramento LGPD ──────────────────────────────────────────

export function maskSensitivePhone(phone) {
  if (!phone) return "";
  const s = String(phone).replace(/\D/g, "");
  if (s.length < 8) return "***";
  return `(${s.slice(-11, -9) || "XX"}) *****-${s.slice(-4)}`;
}

export function maskSensitiveCpf(cpf) {
  if (!cpf) return "";
  const s = String(cpf).replace(/\D/g, "");
  if (s.length !== 11) return "***.***.***-**";
  return `***.${s.slice(3, 6)}.***-**`;
}

export function maskSensitiveEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function maskSensitiveName(name) {
  if (!name || typeof name !== "string") return "Hóspede";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2) + "***";
  }
  return `${parts[0]} ${parts.slice(1).map(p => p[0] + "***").join(" ")}`;
}

export const DEFAULT_BREAKFAST_MENU = {
  availableTimes: ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30"],
  categories: [
    { id: "bebidas", name: "☕ Cafés & Bebidas", items: ["Café", "Café duplo", "Café com leite", "Leite", "Suco de laranja", "Achocolatado gelado", "Água mineral", "Vitamina de banana com iogurte de morango"] },
    { id: "paes", name: "🍞 Pães Tradicionais", items: ["Pão francês", "Pão de queijo"] },
    { id: "acompanhamentos", name: "🧀 Frios & Acompanhamentos", items: ["Queijo mussarela", "Presunto", "Queijo prato", "Queijo Minas frescal", "Peito de Peru", "Ovos mexidos"] },
    { id: "complementos", name: "🧈 Complementos", items: ["Manteiga", "Requeijão"] },
    { id: "doces", name: "🍰 Doces & Biscoitos", items: ["Bolo do dia", "Torradas amanteigadas", "Casadinho (biscoito com goiabada)"] },
    { id: "frutas", name: "🍎 Frutas Selecionadas", items: ["Banana", "Maçã", "Mamão", "Salada de frutas"] }
  ]
};

export const DEFAULT_STANDARD_BREAKFAST = {
  coffee: "Café, Leite",
  otherBeverage: "Suco de laranja",
  breads: ["Pão francês", "Pão de queijo"],
  accompaniments: ["Queijo mussarela", "Presunto", "Ovos mexidos"],
  complements: ["Manteiga"],
  sweets: ["Bolo do dia"],
  fruit: "Fruta do dia",
  sweetener: "Açúcar",
  description: "Café, Leite, Suco de laranja, Pão francês, Pão de queijo, Queijo mussarela, Presunto, Ovos mexidos, Manteiga, Bolo do dia e Fruta do dia."
};

/**
 * Motor Universal de Consulta a Dados do Sistema CorpFlats
 * Suporta consulta contextual a flats, reservas, limpeza, manutenção, café da manhã, garagem,
 * achados e perdidos, FAQs, financeiro e avaliações/sentimento com proteção LGPD por perfil.
 */
export async function querySystemData(db, {
  module,
  query = "",
  filters = {},
  requesterRole = "guest",
  requesterPhone = ""
} = {}) {
  const normModule = String(module || "").toLowerCase().trim();

  switch (normModule) {
    case "flats": {
      const flats = Array.isArray(db?.flats) ? db.flats : [];
      const cleaningReqs = Array.isArray(db?.cleaningRequests) ? db.cleaningRequests : [];
      const serviceOrders = Array.isArray(db?.serviceOrders) ? db.serviceOrders : [];
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      const todayStr = new Date().toISOString().slice(0, 10);

      let list = flats.map(f => {
        const flatNum = String(f.number);
        const activeRes = reservations.find(r =>
          (r.flatId === f.id || String(r.flatNumber) === flatNum) &&
          r.status !== "cancelada" &&
          r.checkinDate <= todayStr && r.checkoutDate > todayStr
        );
        const latestClean = cleaningReqs
          .filter(c => String(c.flatNumber) === flatNum || c.flatId === f.id)
          .sort((a, b) => new Date(b.requestDate || b.createdAt || 0) - new Date(a.requestDate || a.createdAt || 0))[0];

        const activeSO = serviceOrders.filter(so =>
          so.status === "active" && Array.isArray(so.flats) &&
          so.flats.some(sf => (sf.flatId === f.id || String(sf.flatNumber) === flatNum) && sf.status !== "done")
        );

        const isOwn = requesterRole === "admin" || (requesterPhone && activeRes && doesReservationMatchPhone(activeRes, requesterPhone));

        return {
          id: f.id,
          number: f.number,
          isActive: f.isActive !== false,
          isOccupied: Boolean(activeRes || f.isOccupied),
          airConditionerType: f.airConditionerType || (f.tags?.some(t => /split/i.test(t)) ? "split" : "janela"),
          bedType: f.bedType || (f.tags?.some(t => /casal/i.test(t)) ? "casal" : "solteiro"),
          hasMicrowave: Boolean(f.hasMicrowave || f.tags?.some(t => /micro/i.test(t))),
          amenities: Array.isArray(f.amenities) ? f.amenities : (Array.isArray(f.features) ? f.features : []),
          tags: Array.isArray(f.tags) ? f.tags : [],
          cleaningStatus: latestClean?.status || (f.isOccupied ? "occupied" : "clean"),
          maintenanceStatus: activeSO.length > 0 ? "em_manutencao" : "normal",
          currentGuest: requesterRole === "admin"
            ? (activeRes ? { name: activeRes.guestName, code: activeRes.code, checkin: activeRes.checkinDate, checkout: activeRes.checkoutDate } : null)
            : (isOwn && activeRes ? { name: activeRes.guestName, code: activeRes.code } : null)
        };
      });

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(f =>
          String(f.number).includes(qLower) ||
          f.airConditionerType.toLowerCase().includes(qLower) ||
          f.bedType.toLowerCase().includes(qLower) ||
          f.tags.some(t => t.toLowerCase().includes(qLower)) ||
          (qLower.includes("livre") && !f.isOccupied) ||
          (qLower.includes("ocupado") && f.isOccupied)
        );
      }

      if (filters.number) list = list.filter(f => String(f.number) === String(filters.number));
      if (filters.bedType) list = list.filter(f => f.bedType === filters.bedType);
      if (filters.airConditionerType) list = list.filter(f => f.airConditionerType === filters.airConditionerType);
      if (filters.isOccupied !== undefined) list = list.filter(f => f.isOccupied === Boolean(filters.isOccupied));

      return {
        success: true,
        module: "flats",
        totalFlats: flats.length,
        count: list.length,
        flats: list
      };
    }

    case "reservations": {
      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      let list = reservations;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(r =>
          String(r.code || "").toLowerCase().includes(qLower) ||
          String(r.id || "").toLowerCase().includes(qLower) ||
          String(r.guestName || "").toLowerCase().includes(qLower) ||
          String(r.flatNumber || "").includes(qLower) ||
          String(r.status || "").toLowerCase().includes(qLower) ||
          String(r.checkinDate || "").includes(qLower) ||
          String(r.checkoutDate || "").includes(qLower)
        );
      }

      if (filters.status) list = list.filter(r => r.status === filters.status);
      if (filters.flatNumber) list = list.filter(r => String(r.flatNumber) === String(filters.flatNumber));
      if (filters.code) list = list.filter(r => String(r.code).toLowerCase() === String(filters.code).toLowerCase());
      if (filters.date) {
        list = list.filter(r => r.checkinDate <= filters.date && r.checkoutDate >= filters.date);
      }

      const sanitized = list.map(r => {
        const isOwn = requesterRole === "admin" || (requesterPhone && doesReservationMatchPhone(r, requesterPhone));

        if (requesterRole === "admin") {
          return { ...r };
        }

        if (isOwn) {
          return {
            id: r.id,
            code: r.code,
            guestName: r.guestName,
            flatNumber: r.flatNumber,
            checkinDate: r.checkinDate,
            checkoutDate: r.checkoutDate,
            status: r.status,
            paymentStatus: r.paymentStatus,
            totalAmount: r.totalAmount,
            paidAmount: r.paidAmount,
            includeBreakfast: r.includeBreakfast,
            checkinTime: r.checkinTime || "14:00",
            checkoutTime: r.checkoutTime || "12:00"
          };
        }

        return {
          code: r.code ? r.code.slice(0, 4) + "****" : "****",
          flatNumber: r.flatNumber,
          checkinDate: r.checkinDate,
          checkoutDate: r.checkoutDate,
          status: r.status === "cancelada" ? "cancelada" : "ocupado",
          guestName: maskSensitiveName(r.guestName),
          guestPhone: maskSensitivePhone(r.guestPhone || r.phone),
          guestCpf: maskSensitiveCpf(r.guestCpf || r.cpf),
          guestEmail: maskSensitiveEmail(r.guestEmail || r.email),
          totalAmount: "[RESTRITO_LGPD]",
          paidAmount: "[RESTRITO_LGPD]",
          paymentStatus: "[RESTRITO_LGPD]"
        };
      });

      return {
        success: true,
        module: "reservations",
        count: sanitized.length,
        reservations: sanitized
      };
    }

    case "cleaning": {
      const cleaningReqs = Array.isArray(db?.cleaningRequests) ? db.cleaningRequests : [];
      const surveys = Array.isArray(db?.surveys) ? db.surveys : [];
      let list = cleaningReqs;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(c =>
          String(c.flatNumber || "").includes(qLower) ||
          String(c.status || "").toLowerCase().includes(qLower) ||
          String(c.assignedUsername || "").toLowerCase().includes(qLower)
        );
      }
      if (filters.flatNumber) list = list.filter(c => String(c.flatNumber) === String(filters.flatNumber));
      if (filters.status) list = list.filter(c => c.status === filters.status);

      const sanitized = list.map(c => {
        if (requesterRole === "admin") {
          return { ...c };
        }
        const firstName = c.assignedUsername ? c.assignedUsername.trim().split(/\s+/)[0] : "Equipe de Governança";
        return {
          id: c.id,
          flatNumber: c.flatNumber,
          status: c.status,
          isClean: c.status === "clean",
          assignedTo: firstName,
          requestDate: c.requestDate,
          effectiveDate: c.effectiveDate,
          completedAt: c.completedAt || null
        };
      });

      const sanitizedSurveys = surveys
        .filter(s => requesterRole === "admin" || s.active !== false)
        .map(s => {
          if (requesterRole === "admin") return { ...s };
          return {
            id: s.id,
            title: s.title,
            active: s.active,
            targetFlatIds: s.targetFlatIds || []
          };
        });

      return {
        success: true,
        module: "cleaning",
        count: sanitized.length,
        cleaningRequests: sanitized,
        surveysCount: sanitizedSurveys.length,
        vistorias: sanitizedSurveys
      };
    }

    case "maintenance": {
      const serviceOrders = Array.isArray(db?.serviceOrders) ? db.serviceOrders : [];
      let list = serviceOrders;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(so =>
          String(so.title || "").toLowerCase().includes(qLower) ||
          String(so.status || "").toLowerCase().includes(qLower) ||
          (Array.isArray(so.flats) && so.flats.some(f => String(f.flatNumber).includes(qLower) || String(f.instructions || "").toLowerCase().includes(qLower)))
        );
      }
      if (filters.status) list = list.filter(so => so.status === filters.status);
      if (filters.flatNumber) {
        list = list.filter(so => Array.isArray(so.flats) && so.flats.some(f => String(f.flatNumber) === String(filters.flatNumber)));
      }

      const sanitized = list.map(so => {
        if (requesterRole === "admin") {
          const worker = (db?.serviceWorkers || []).find(w => w.token === so.token || w.serviceOrderId === so.id);
          return {
            ...so,
            workerName: worker?.mainWorker?.name || null,
            workerCpf: worker?.mainWorker?.cpf || null,
            vehicle: worker?.vehicle || null
          };
        }
        return {
          id: so.id,
          title: so.title,
          status: so.status,
          createdAt: so.createdAt,
          flats: (so.flats || []).map(f => ({
            flatNumber: f.flatNumber,
            status: f.status,
            startedAt: f.startedAt || null,
            completedAt: f.completedAt || null
          }))
        };
      });

      return {
        success: true,
        module: "maintenance",
        count: sanitized.length,
        serviceOrders: sanitized
      };
    }

    case "breakfast": {
      const menu = db?.breakfastMenu || DEFAULT_BREAKFAST_MENU;
      const standardConfig = db?.standardBreakfastConfig || DEFAULT_STANDARD_BREAKFAST;
      const orders = Array.isArray(db?.breakfastOrders) ? db.breakfastOrders : [];

      let sanitizedOrders = [];
      if (requesterRole === "admin") {
        sanitizedOrders = orders;
        if (filters.date) sanitizedOrders = sanitizedOrders.filter(o => o.date === filters.date);
        if (filters.roomNumber) sanitizedOrders = sanitizedOrders.filter(o => String(o.roomNumber) === String(filters.roomNumber));
      } else {
        sanitizedOrders = orders.filter(o => {
          const phoneMatches = requesterPhone && (o.phone === requesterPhone || cleanWhatsAppPhone(o.phone) === cleanWhatsAppPhone(requesterPhone));
          return Boolean(phoneMatches);
        });
      }

      return {
        success: true,
        module: "breakfast",
        deliveryHours: menu.availableTimes || DEFAULT_BREAKFAST_MENU.availableTimes,
        menuCategories: menu.categories || DEFAULT_BREAKFAST_MENU.categories,
        standardConfig,
        orders: sanitizedOrders
      };
    }

    case "garage": {
      const garageAuthorizations = Array.isArray(db?.garageAuthorizations) ? db.garageAuthorizations : [];
      const rules = {
        policy: "1 vaga rotativa gratuita por flat no condomínio Soho (qualquer vaga livre disponível).",
        requiresPreCheckin: true,
        heightLimitMeters: "2.10m a 2.20m",
        supportedVehicles: "Veículos de passeio, SUVs e caminhonetes."
      };

      let sanitizedAuths = [];
      if (requesterRole === "admin") {
        sanitizedAuths = garageAuthorizations;
        if (query) {
          const qLower = String(query).toLowerCase().trim();
          sanitizedAuths = sanitizedAuths.filter(a =>
            String(a.plate || "").toLowerCase().includes(qLower) ||
            String(a.guestName || "").toLowerCase().includes(qLower) ||
            String(a.flatNumber || "").includes(qLower) ||
            String(a.model || "").toLowerCase().includes(qLower)
          );
        }
      } else {
        if (requesterPhone) {
          const cleanReqPhone = cleanWhatsAppPhone(requesterPhone);
          sanitizedAuths = garageAuthorizations.filter(a => {
            const authPhone = cleanWhatsAppPhone(a.phone || a.guestPhone || "");
            return cleanReqPhone && authPhone === cleanReqPhone;
          });

          if (query) {
            const qPlate = String(query).toUpperCase().replace(/[^A-Z0-9]/g, "");
            sanitizedAuths = sanitizedAuths.filter(a => {
              const cleanA = String(a.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
              return qPlate && cleanA.includes(qPlate);
            });
          }

          sanitizedAuths = sanitizedAuths.map(a => ({
            plate: a.plate,
            model: a.model,
            flatNumber: a.flatNumber,
            status: a.status,
            checkinDate: a.checkinDate,
            checkoutDate: a.checkoutDate
          }));
        }
      }

      return {
        success: true,
        module: "garage",
        rules,
        authorizedCount: sanitizedAuths.length,
        authorizations: sanitizedAuths
      };
    }

    case "lost_and_found": {
      const items = Array.isArray(db?.lostAndFound) ? db.lostAndFound : [];
      let list = items;

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        list = list.filter(i =>
          String(i.description || "").toLowerCase().includes(qLower) ||
          String(i.flatNumber || "").includes(qLower) ||
          String(i.locationInRoom || "").toLowerCase().includes(qLower) ||
          String(i.status || "").toLowerCase().includes(qLower)
        );
      }
      if (filters.flatNumber) list = list.filter(i => String(i.flatNumber) === String(filters.flatNumber));
      if (filters.status) list = list.filter(i => i.status === filters.status);

      const sanitized = list.map(i => {
        if (requesterRole === "admin") {
          return { ...i };
        }
        return {
          id: i.id,
          description: i.description,
          flatNumber: i.flatNumber,
          locationInRoom: i.locationInRoom,
          status: i.status,
          createdAt: i.createdAt
        };
      });

      return {
        success: true,
        module: "lost_and_found",
        count: sanitized.length,
        items: sanitized
      };
    }

    case "faq": {
      const faqList = Array.isArray(db?.faqItems) ? db.faqItems : [];
      const kb = DEFAULT_AI_CONFIG.knowledgeBase;
      let activeFaqs = faqList.filter(f => f && f.status === "ativo");

      if (query) {
        const qLower = String(query).toLowerCase().trim();
        activeFaqs = activeFaqs.filter(f =>
          String(f.question || "").toLowerCase().includes(qLower) ||
          String(f.answer || "").toLowerCase().includes(qLower) ||
          (Array.isArray(f.keywords) && f.keywords.some(k => k.toLowerCase().includes(qLower)))
        );
      }

      return {
        success: true,
        module: "faq",
        knowledgeBaseSummary: {
          address: kb.address,
          checkinTime: kb.checkinTime,
          checkoutTime: kb.checkoutTime,
          wifiPassword: kb.wifiPassword,
          petPolicy: kb.petPolicy,
          smokingPolicy: kb.smokingPolicy,
          leisureInfo: kb.leisureInfo,
          amenities: kb.amenities
        },
        count: activeFaqs.length,
        faqs: activeFaqs.map(f => ({ id: f.id, question: f.question, answer: f.answer, category: f.category }))
      };
    }

    case "finance": {
      if (requesterRole !== "admin") {
        return {
          error: "ACCESS_DENIED",
          module: "finance",
          message: "Acesso negado: Informações financeiras globais e de faturamento são estritamente restritas à administração da CorpFlats (LGPD)."
        };
      }

      const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
      const activeRes = reservations.filter(r => r.status !== "cancelada");
      const tariffSettings = db?.tariffSettings || { baseDailyRate: 237, weekendMarkupPct: 0.15, cleaningFee: 70, breakfastFeePerson: 35 };

      let totalRevenue = 0;
      let totalNights = 0;
      const channelTotals = { direct: 0, booking: 0, airbnb: 0, other: 0 };

      activeRes.forEach(r => {
        const amt = Number(r.totalAmount) || 0;
        totalRevenue += amt;
        const chan = String(r.channel || "").toLowerCase();
        if (chan.includes("site") || chan.includes("whatsapp") || chan.includes("direct") || chan.includes("direta")) {
          channelTotals.direct += amt;
        } else if (chan.includes("booking")) {
          channelTotals.booking += amt;
        } else if (chan.includes("airbnb")) {
          channelTotals.airbnb += amt;
        } else {
          channelTotals.other += amt;
        }

        try {
          if (r.checkinDate && r.checkoutDate) {
            const d1 = new Date(r.checkinDate);
            const d2 = new Date(r.checkoutDate);
            const nights = Math.max(1, Math.round((d2 - d1) / 86400000));
            totalNights += nights;
          } else {
            totalNights += 1;
          }
        } catch {
          totalNights += 1;
        }
      });

      const adr = totalNights > 0 ? Math.round(totalRevenue / totalNights) : tariffSettings.baseDailyRate;

      return {
        success: true,
        module: "finance",
        activeReservationsCount: activeRes.length,
        totalNights,
        totalRevenueEstimated: Math.round(totalRevenue * 100) / 100,
        averageDailyRate: adr,
        revenueByChannel: channelTotals,
        tariffSettings: {
          baseDailyRate: tariffSettings.baseDailyRate,
          weekendMarkupPct: tariffSettings.weekendMarkupPct,
          cleaningFee: tariffSettings.cleaningFee,
          breakfastFeePerson: tariffSettings.breakfastFeePerson
        },
        tariffOverridesCount: (db?.tariffOverrides || []).length
      };
    }

    case "sentiment": {
      const reviews = Array.isArray(db?.reviews) ? db.reviews : [];
      const sentiments = Array.isArray(db?.guestSentiment) ? db.guestSentiment : [];
      const nps = Array.isArray(db?.npsResponses) ? db.npsResponses : [];

      const avgReviewRating = reviews.length > 0
        ? (reviews.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1)
        : "4.9";

      const positiveSentiments = sentiments.filter(s => s.overallTone === "positive").length;
      const neutralSentiments = sentiments.filter(s => s.overallTone === "neutral").length;
      const negativeSentiments = sentiments.filter(s => s.overallTone === "negative").length;

      if (requesterRole !== "admin") {
        return {
          success: true,
          module: "sentiment",
          averageRating: Number(avgReviewRating),
          totalReviews: reviews.length,
          generalSatisfactionRate: "98% de aprovação dos hóspedes"
        };
      }

      return {
        success: true,
        module: "sentiment",
        averageRating: Number(avgReviewRating),
        totalReviews: reviews.length,
        sentimentsAnalyzed: sentiments.length,
        toneDistribution: {
          positive: positiveSentiments,
          neutral: neutralSentiments,
          negative: negativeSentiments
        },
        nps: {
          total: nps.length,
          promoters: nps.filter(n => n.score === 5).length,
          detractors: nps.filter(n => n.score != null && n.score <= 2).length
        },
        recentFeedbacks: reviews.slice(0, 5).map(r => ({
          author: r.author || "Hóspede",
          rating: r.rating,
          comment: r.comment || r.text || "",
          date: r.date
        }))
      };
    }

    default:
      return {
        error: "UNKNOWN_MODULE",
        module,
        message: `Módulo '${module}' não suportado pelo motor universal. Módulos válidos: flats, reservations, cleaning, maintenance, breakfast, garage, lost_and_found, faq, finance, sentiment.`
      };
  }
}

/**
 * Handler para o Gemini Function Calling de querySystemData
 */
export async function handleQuerySystemData(db, args = {}) {
  const { module, query, filters, requesterRole = "guest", requesterPhone = "" } = args;
  return await querySystemData(db, { module, query, filters, requesterRole, requesterPhone });
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

  if (allowed.getReservationDetails === true) {
    declarations.push({
      name: "getReservationDetails",
      description: "Consulta dados e status de reservas no sistema pelo código da reserva (ex: 'RES-101-9999', 'CF-123456'), telefone, nome do titular ou número do flat.",
      parameters: {
        type: "OBJECT",
        properties: {
          code: {
            type: "STRING",
            description: "Código da reserva (ex: 'RES-101-9999', 'CF-123456')"
          },
          guestName: {
            type: "STRING",
            description: "Nome do titular da reserva"
          },
          flatNumber: {
            type: "STRING",
            description: "Número do flat/quarto"
          },
          phone: {
            type: "STRING",
            description: "Telefone do hóspede com DDD"
          }
        }
      }
    });
  }

  if (allowed.getFlatStatus === true) {
    declarations.push({
      name: "getFlatStatus",
      description: "Consulta o status em tempo real de um flat/apartamento no sistema (se está limpo/higienizado pela governança, liberado para entrada antecipada, ou ocupado).",
      parameters: {
        type: "OBJECT",
        properties: {
          flatNumber: {
            type: "STRING",
            description: "Número do flat/apartamento (ex: '101', '202', '605')"
          }
        },
        required: ["flatNumber"]
      }
    });
  }

  if (allowed.getPricingInfo === true) {
    declarations.push({
      name: "getPricingInfo",
      description: "Consulta a tabela de tarifas, diárias e valores oficiais da CorpFlats (com ou sem café da manhã) para fornecer valores exatos ao hóspede.",
      parameters: {
        type: "OBJECT",
        properties: {
          checkIn: {
            type: "STRING",
            description: "Data de entrada (opcional, formato YYYY-MM-DD)"
          },
          checkOut: {
            type: "STRING",
            description: "Data de saída (opcional, formato YYYY-MM-DD)"
          },
          guests: {
            type: "INTEGER",
            description: "Quantidade de hóspedes (padrão 1)"
          },
          withBreakfast: {
            type: "BOOLEAN",
            description: "Se inclui café da manhã servido no quarto"
          }
        }
      }
    });
  }

  if (allowed.recordUnmetDemand === true) {
    declarations.push({
      name: "recordUnmetDemand",
      description: "Registra na fila de Oportunidades de Automação e Demandas Sem Acesso qualquer solicitação operacional do hóspede que o sistema não possua capacidade autônoma de realizar (ex: cancelamento de reserva, alteração de datas, solicitação de toalhas/enxoval, chamado de manutenção, troca de quarto, nota fiscal com CNPJ, solicitação de berço/itens extras).",
      parameters: {
        type: "OBJECT",
        properties: {
          demandTitle: {
            type: "STRING",
            description: "Título descritivo da demanda (ex: 'Solicitação de Berço', 'Cancelamento de Reserva')"
          },
          guestRequest: {
            type: "STRING",
            description: "Mensagem ou solicitação original do hóspede"
          },
          category: {
            type: "STRING",
            description: "Categoria da demanda (ex: 'cancelamento_reserva', 'alteracao_datas', 'enxoval_toalhas', 'chamado_manutencao', 'emissao_nota_fiscal', 'itens_especiais_comodidades', 'outros')"
          },
          reason: {
            type: "STRING",
            description: "Motivo: 'capability_missing', 'requires_operator' ou 'data_unavailable'"
          },
          suggestedFeature: {
            type: "STRING",
            description: "Sugestão técnica de recurso para desenvolvimento posterior"
          }
        },
        required: ["demandTitle", "guestRequest"]
      }
    });
  }

  if (allowed.informCheckout !== false && allowed.informCheckout) {
    declarations.push({
      name: "informCheckout",
      description: "Registra a comunicação de check-out informada pelo hóspede via WhatsApp, atualizando o flat como desocupado no quadro de governança/limpeza e marcando a reserva como concluída.",
      parameters: {
        type: "OBJECT",
        properties: {
          flatNumber: {
            type: "STRING",
            description: "Número do flat/apartamento desocupado (ex: '101', '204', '302')"
          },
          guestName: {
            type: "STRING",
            description: "Nome do hóspede informando a saída (opcional)"
          },
          phone: {
            type: "STRING",
            description: "Telefone do hóspede com DDD (opcional)"
          }
        }
      }
    });
  }

  if (allowed.getFlatAmenities !== false) {
    declarations.push({
      name: "getFlatAmenities",
      description: "Consulta comodidades, tags, tipo de ar-condicionado (split vs janela), tipo de cama (casal vs 2 solteiro) e micro-ondas dos flats da CorpFlats. Permite filtrar por comodidade ou ver detalhes de um flat.",
      parameters: {
        type: "OBJECT",
        properties: {
          criteria: {
            type: "STRING",
            description: "Comodidade ou particularidade desejada (ex: 'split', 'microondas', 'casal', 'solteiro', '2_solteiro')"
          },
          flatNumber: {
            type: "STRING",
            description: "Número do flat específico para ver suas comodidades (opcional)"
          }
        }
      }
    });
  }

  if (allowed.reallocateReservationFlat !== false && allowed.reallocateReservationFlat) {
    declarations.push({
      name: "reallocateReservationFlat",
      description: "Realoca ou troca o apartamento de uma reserva no PMS para outro flat solicitado pelo hóspede. Sofia só pode deslocar um hóspede futuro se este não tiver solicitado o flat especificamente ou se o flat não estiver bloqueado/preferencial.",
      parameters: {
        type: "OBJECT",
        properties: {
          reservationId: {
            type: "STRING",
            description: "ID ou código da reserva a ser realocada (ex: 'RES-101-9999', 'CF-123456')"
          },
          targetFlatNumber: {
            type: "STRING",
            description: "Número do flat de destino desejado (ex: '408', '113', '904')"
          },
          reason: {
            type: "STRING",
            description: "Motivo da troca de quarto (ex: 'Hóspede prefere ar split', 'Preferência por cama de casal')"
          }
        },
        required: ["targetFlatNumber"]
      }
    });
  }

  if (allowed.querySystemData !== false) {
    declarations.push({
      name: "querySystemData",
      description: "Consulta universal e inteligente aos dados em tempo real do sistema CorpFlats (flats, reservas, limpeza/governança, manutenção/OS, café da manhã, garagem, achados e perdidos, regras/FAQs, financeiro e avaliações/sentimento).",
      parameters: {
        type: "OBJECT",
        properties: {
          module: {
            type: "STRING",
            description: "Módulo do sistema a consultar: 'flats', 'reservations', 'cleaning', 'maintenance', 'breakfast', 'garage', 'lost_and_found', 'faq', 'finance' ou 'sentiment'."
          },
          query: {
            type: "STRING",
            description: "Termo de busca, pergunta, número de flat, nome de hóspede ou filtro textual."
          },
          filters: {
            type: "OBJECT",
            description: "Filtros adicionais opcionais (ex: status, flatNumber, date, category)."
          }
        },
        required: ["module"]
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

/**
 * Normaliza e consolida comodidades, tags, tipo de ar e tipo de cama de um flat
 */
export function getFlatAmenitiesInfo(flat) {
  if (!flat) return null;
  const colName = String(flat.colName || flat.name || "").toLowerCase();
  const tags = Array.isArray(flat.tags) ? flat.tags : [];
  const tagsLower = tags.map(t => String(t).toLowerCase());

  // Ar-condicionado: split vs janela/parede
  let airConditionerType = flat.airConditionerType || null;
  if (!airConditionerType) {
    if (tagsLower.some(t => t.includes("split")) || colName.includes("split")) {
      airConditionerType = "split";
    } else if (tagsLower.some(t => t.includes("janela") || t.includes("parede")) || colName.includes("janela") || colName.includes("parede")) {
      airConditionerType = "janela";
    } else {
      airConditionerType = "split";
    }
  }
  const airConditionerLabel = airConditionerType === "split" ? "Ar-condicionado Split ❄️" : "Ar-condicionado de Janela";

  // Cama: casal (cama inteira) vs 2 solteiro (twin)
  let bedType = flat.bedType || null;
  if (!bedType) {
    if (tagsLower.some(t => t.includes("casal") || t.includes("inteira") || t.includes("cama inteira") || t.includes("queen") || t.includes("king")) || colName.includes("casal") || colName.includes("inteira")) {
      bedType = "casal";
    } else if (tagsLower.some(t => t.includes("solteiro") || t.includes("twin") || t.includes("ferro unindo")) || colName.includes("solteiro") || colName.includes("ferro unindo")) {
      bedType = "2_solteiro";
    } else {
      bedType = "casal";
    }
  }
  const bedLabel = (bedType === "2_solteiro" || bedType === "solteiro") ? "2 Camas de Solteiro 🛏️🛏️" : "Cama Inteira / Casal 🛏️";

  // Micro-ondas
  let hasMicrowave = flat.hasMicrowave;
  if (hasMicrowave === undefined) {
    hasMicrowave = tagsLower.some(t => t.includes("micro-ondas") || t.includes("microondas")) || (Array.isArray(flat.features) && flat.features.includes("microondas"));
  }

  return {
    id: flat.id,
    number: String(flat.number),
    name: flat.colName || `Flat ${flat.number}`,
    colName: flat.colName || "",
    tags,
    airConditionerType,
    airConditionerLabel,
    airConditioner: airConditionerType,
    bedType,
    bedLabel,
    bed: bedType,
    hasMicrowave: Boolean(hasMicrowave),
    features: Array.isArray(flat.features) ? flat.features : [],
    notes: flat.notes || ""
  };
}

/**
 * Busca e filtra flats por comodidades e tags
 */
export function searchFlatsByAmenities(db, criteria = {}) {
  const flats = (db?.flats || []).filter(f => f.isActive !== false && f.status !== "manutencao_bloqueada");
  const mapped = flats.map(f => getFlatAmenitiesInfo(f));

  if (!criteria || Object.keys(criteria).length === 0) {
    return mapped;
  }

  let filtered = mapped;

  if (criteria.flatNumber) {
    const fNum = String(criteria.flatNumber).trim();
    filtered = filtered.filter(f => f.number === fNum || String(f.id) === fNum);
  }

  if (criteria.airConditionerType || criteria.split !== undefined) {
    const wantSplit = criteria.split !== undefined ? Boolean(criteria.split) : String(criteria.airConditionerType).toLowerCase().includes("split");
    if (wantSplit) {
      filtered = filtered.filter(f => f.airConditionerType === "split" || f.tags.some(t => /split/i.test(t)) || /split/i.test(f.colName));
    } else {
      filtered = filtered.filter(f => f.airConditionerType === "janela" || f.tags.some(t => /janela|parede/i.test(t)) || /janela|parede/i.test(f.colName));
    }
  }

  if (criteria.bedType) {
    const wantCasal = /casal|double|queen|king|inteira|cama_inteira|cama\s+inteira/i.test(String(criteria.bedType));
    const wantSolteiro = /solteiro|twin|2_solteiro/i.test(String(criteria.bedType));
    if (wantCasal) {
      filtered = filtered.filter(f => f.bedType === "casal");
    } else if (wantSolteiro) {
      filtered = filtered.filter(f => f.bedType === "2_solteiro" || f.bedType === "solteiro");
    }
  }

  if (criteria.hasMicrowave !== undefined || criteria.microwave !== undefined) {
    const wantMicro = criteria.hasMicrowave !== undefined ? Boolean(criteria.hasMicrowave) : Boolean(criteria.microwave);
    filtered = filtered.filter(f => f.hasMicrowave === wantMicro);
  }

  if (criteria.tag) {
    const tagNorm = String(criteria.tag).toLowerCase();
    filtered = filtered.filter(f => f.tags.some(t => String(t).toLowerCase().includes(tagNorm)));
  }

  if (criteria.query && typeof criteria.query === "string") {
    const qLower = criteria.query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/split/i.test(qLower)) {
      filtered = filtered.filter(f => f.airConditionerType === "split" || f.tags.some(t => /split/i.test(t)) || /split/i.test(f.colName));
    } else if (/micro[- ]?ondas/i.test(qLower)) {
      filtered = filtered.filter(f => f.hasMicrowave);
    } else if (/casal|inteira|cama\s+inteira/i.test(qLower)) {
      filtered = filtered.filter(f => f.bedType === "casal");
    } else if (/solteiro|duas camas|2 camas/i.test(qLower)) {
      filtered = filtered.filter(f => f.bedType === "2_solteiro" || f.bedType === "solteiro");
    }
  }

  return filtered;
}

/**
 * Handler de ação de bot para consulta de comodidades e tags dos flats
 */
export function handleGetFlatAmenities(db, args = {}) {
  const criteria = typeof args.criteria === "string" ? { query: args.criteria } : (args.criteria || {});
  if (args.flatNumber) criteria.flatNumber = args.flatNumber;
  if (args.bedType) criteria.bedType = args.bedType;
  if (args.split !== undefined) criteria.split = args.split;
  if (args.hasMicrowave !== undefined) criteria.hasMicrowave = args.hasMicrowave;

  const results = searchFlatsByAmenities(db, criteria);
  return {
    success: true,
    count: results.length,
    flats: results
  };
}

/**
 * Verifica se um hóspede solicitou ou possui trava de Quarto Preferencial para um flat
 */
export function hasGuestRequestedSpecificFlat(db, res, targetFlatNumber = null) {
  if (!res) return false;
  const fNum = String(targetFlatNumber || res.flatNumber || (db?.flats || []).find(f => f.id === res.flatId)?.number || "").trim();

  // 1. Trava explícita no PMS (Quarto Preferencial / Não Trocar)
  if (res.isFlatLocked === true || res.flatLocked === true || res.isPreferredFlat === true) {
    return true;
  }

  // 2. Campo requestedFlat ou preferredFlat
  if (res.requestedFlat && (!fNum || String(res.requestedFlat) === fNum)) return true;
  if (res.preferredFlat && (!fNum || String(res.preferredFlat) === fNum)) return true;

  if (!fNum) return false;

  // Regex robustas para detecção de preferência em português
  const flatLockRegex = new RegExp(`(?:quarto|flat|apto|apartamento|uh)?\\s*${fNum}\\s*(?:fixo|preferencial|bloquead[ao]|exclusiv[ao]|solicitad[ao]|garantid[ao])`, "i");
  const specificLockRegex = new RegExp(`(?:manter\\s+no\\s+${fNum}|n[aã]o\\s+(?:trocar|mudar|alterar)\\s+(?:o\\s+)?(?:flat|quarto|apto)?\\s*${fNum})`, "i");
  const generalLockRegex = /(?:quarto|flat|apto|apartamento|uh)\s*(?:preferencial|fixo|bloquead[ao]|n[aã]o\s+alterar|n[aã]o\s+mudar|exclusiv[ao])/i;
  const verbOrPref = `(?:pediu|solicitou|solicito|quer(?:ia)?|quis|gostaria|gostariamos|exigiu|exige|prefer[eê]|prefiro|preferia|preferimos|prefer[eê]ncia|escolh(?:i|eu|emos|a)|faz\\s+quest[aã]o|favor\\s+colocar|pode\\s+ser|tem\\s+como|se\\s+poss[ií]vel|se\\s+der|de\\s+prefer[eê]ncia|me\\s+coloca|me\\s+bota|colocar\\s+no|botar\\s+no|ficar\\s+no)`;
  const roomPattern = `(?:\\b(?:no|o|pro|pra|para|do|da)?\\s*(?:flat|quarto|apto|apartamento|uh)?\\s*${fNum}\\b)`;
  const requestRegex = new RegExp(`${verbOrPref}.*?${roomPattern}`, "i");
  const reverseRegex = new RegExp(`${roomPattern}.*?(?:a\\s+pedido|solicitad[ao]|preferencial|fixo|escolhid[ao])`, "i");

  // 3. Notas e solicitações especiais da reserva
  const combinedNotes = `${res.notes || ""} ${res.specialRequests || ""} ${res.receptionNotes || ""} ${res.obs || ""}`.toLowerCase();
  if (flatLockRegex.test(combinedNotes) || specificLockRegex.test(combinedNotes) || generalLockRegex.test(combinedNotes) || requestRegex.test(combinedNotes) || reverseRegex.test(combinedNotes)) {
    return true;
  }

  // 4. Histórico de conversas do hóspede no WhatsApp e histórico de mensagens
  const phoneCandidates = new Set();
  const addPhoneDigits = (raw) => {
    if (!raw) return;
    const digits = String(raw).replace(/\D/g, "");
    if (!digits) return;
    phoneCandidates.add(digits);
    if (digits.startsWith("55") && digits.length >= 12) {
      phoneCandidates.add(digits.substring(2));
    } else if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
      phoneCandidates.add("55" + digits);
    }
  };

  addPhoneDigits(res.guestPhone);
  addPhoneDigits(res.phone);
  addPhoneDigits(res.guests?.[0]?.phone);

  if (res.guestId && Array.isArray(db?.guests)) {
    const g = db.guests.find(x => x.id === res.guestId);
    if (g?.phone) addPhoneDigits(g.phone);
  }

  const candidateDigitsList = Array.from(phoneCandidates);
  const phoneMatches = (targetPhone) => {
    if (!targetPhone) return false;
    const tDigits = String(targetPhone).replace(/\D/g, "");
    if (!tDigits) return false;
    return candidateDigitsList.some(cand =>
      cand === tDigits ||
      cand.endsWith(tDigits) ||
      tDigits.endsWith(cand) ||
      (cand.length >= 8 && tDigits.length >= 8 && cand.slice(-8) === tDigits.slice(-8))
    );
  };

  // 4.1 Mensagens nas conversas do WhatsApp (db.whatsappConversations)
  if (Array.isArray(db?.whatsappConversations) && candidateDigitsList.length > 0) {
    const matchingConvs = db.whatsappConversations.filter(c => phoneMatches(c.clientPhone));
    for (const conv of matchingConvs) {
      if (Array.isArray(conv.messages)) {
        const guestMessages = conv.messages.filter(m => !m.fromMe && m.text).map(m => String(m.text).toLowerCase());
        for (const msg of guestMessages) {
          if (flatLockRegex.test(msg) || generalLockRegex.test(msg) || requestRegex.test(msg) || reverseRegex.test(msg)) {
            return true;
          }
        }
      }
    }
  }

  // 4.2 Histórico consolidado de WhatsApp (db.whatsappHistory)
  if (Array.isArray(db?.whatsappHistory)) {
    const matchingHistory = db.whatsappHistory.filter(h =>
      (h.reservationCode && (h.reservationCode === res.code || String(h.reservationId) === String(res.id))) ||
      phoneMatches(h.guestPhone)
    );
    for (const h of matchingHistory) {
      const msg = String(h.message || h.text || "").toLowerCase();
      if (flatLockRegex.test(msg) || generalLockRegex.test(msg) || requestRegex.test(msg) || reverseRegex.test(msg)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Encontra um flat alternativo livre para um hóspede que precise ser deslocado
 */
export function findAlternateFlatForGuest(db, candidateRes, excludeFlatNumbers = [], ignoreReservationId = null) {
  if (!candidateRes) return null;
  const inDate = candidateRes.checkinDate;
  const outDate = candidateRes.checkoutDate;
  const excludeSet = new Set((excludeFlatNumbers || []).map(n => String(n).trim()));

  const allFlats = (db?.flats || []).filter(f =>
    f.isActive !== false &&
    f.status !== "manutencao_bloqueada" &&
    !excludeSet.has(String(f.number))
  );

  // Ordenação inteligente de flats:
  // 1. Prioriza camas idênticas (ex: se o hóspede precisa de 2 solteiro ou cama de casal)
  // 2. Prioriza andar alto se solicitado
  const wantTwin = Boolean(candidateRes.twinBeds);
  const wantHighFloor = Boolean(candidateRes.prefersHighFloor);

  const sortedFlats = [...allFlats].sort((a, b) => {
    const infoA = getFlatAmenitiesInfo(a);
    const infoB = getFlatAmenitiesInfo(b);

    if (wantTwin) {
      const aIsTwin = (infoA.bedType === "2_solteiro" || infoA.bedType === "solteiro");
      const bIsTwin = (infoB.bedType === "2_solteiro" || infoB.bedType === "solteiro");
      if (aIsTwin && !bIsTwin) return -1;
      if (!aIsTwin && bIsTwin) return 1;
    }

    if (wantHighFloor) {
      const floorA = Number(String(a.number).length === 4 ? String(a.number).slice(0, 2) : String(a.number).slice(0, 1)) || 0;
      const floorB = Number(String(b.number).length === 4 ? String(b.number).slice(0, 2) : String(b.number).slice(0, 1)) || 0;
      if (floorA !== floorB) return floorB - floorA;
    }

    return 0;
  });

  for (const flat of sortedFlats) {
    const fId = flat.id;
    const fNum = String(flat.number);

    // Conflito com outras reservas ativas no PMS
    const hasConflict = (db?.reservations || []).some(r => {
      if (r.id === candidateRes.id) return false;
      if (ignoreReservationId != null && (r.id === ignoreReservationId || r.code === ignoreReservationId)) return false;
      if (r.status === "cancelada" || r.status === "expirada") return false;
      const matchesFlat = (r.flatId === fId || String(r.flatNumber) === fNum);
      return matchesFlat && r.checkinDate < outDate && r.checkoutDate > inDate;
    });

    if (hasConflict) continue;

    // Conflito com bloqueios de quarto
    const hasBlock = (db?.roomBlocks || []).some(b => {
      const matchesFlat = (b.flatId === fId || String(b.flatNumber) === fNum);
      return matchesFlat && b.startDate < outDate && b.endDate > inDate;
    });

    if (hasBlock) continue;

    return flat;
  }

  return null;
}

/**
 * Realoca uma reserva de flat, com capacidade de deslocar hóspede futuro não-fixo
 * Implementa validação estrita em duas fases (atômica): se qualquer sobreposição não puder ser deslocada,
 * nenhuma alteração é aplicada ao banco de dados.
 */
export function handleReallocateReservationFlat(db, args = {}) {
  const targetFlatIdentifier = String(args.targetFlatNumber || args.targetFlatId || args.targetFlat || "").trim();
  const resIdentifier = String(args.reservationId || args.reservationCode || args.code || args.id || "").trim();
  const phone = args.phone || args.guestPhone;
  const guestName = args.guestName;
  const currentFlat = args.currentFlatNumber || args.currentFlat;

  if (!targetFlatIdentifier) {
    return {
      success: false,
      error: "MISSING_TARGET_FLAT",
      message: "O número do flat de destino é obrigatório."
    };
  }

  const flats = (db?.flats || []).filter(f => f.isActive !== false);
  const targetFlat = flats.find(f => String(f.number) === targetFlatIdentifier || String(f.id) === targetFlatIdentifier);
  if (!targetFlat) {
    return {
      success: false,
      error: "FLAT_NOT_FOUND",
      message: `Flat ${targetFlatIdentifier} não foi encontrado no cadastro.`
    };
  }

  // Localiza a reserva do solicitante (Res A)
  const reservations = db?.reservations || [];
  let resA = null;

  if (resIdentifier) {
    resA = reservations.find(r => String(r.id) === resIdentifier || String(r.code) === resIdentifier);
  }

  if (!resA && phone) {
    const cleanP = cleanWhatsAppPhone(phone);
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      matchClientPhone(r.guestPhone || r.phone, cleanP)
    );
  }

  if (!resA && currentFlat) {
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      (String(r.flatNumber) === String(currentFlat) || String(r.flatId) === String(currentFlat))
    );
  }

  if (!resA && guestName) {
    const gNorm = guestName.toLowerCase().trim();
    resA = reservations.find(r =>
      r.status !== "cancelada" && r.status !== "expirada" &&
      r.guestName && r.guestName.toLowerCase().trim().includes(gNorm)
    );
  }

  if (!resA) {
    return {
      success: false,
      error: "RESERVATION_NOT_FOUND",
      message: "Reserva não encontrada para efetuar a realocação."
    };
  }

  if (resA.status === "cancelada" || resA.status === "expirada") {
    return {
      success: false,
      error: "RESERVATION_INACTIVE",
      message: `A reserva ${resA.code || resA.id} está com status '${resA.status}' e não pode ser remanejada.`
    };
  }

  // 1. GUARDA: Hóspede solicitante já realizou check-in
  const isRequesterCheckedIn = resA.checkedIn || resA.checkinConfirmed || resA.status === "hospedado" || resA.status === "checked_in" || resA.fnhrCompleted;
  if (isRequesterCheckedIn) {
    return {
      success: false,
      error: "REQUESTER_ALREADY_CHECKED_IN",
      message: `Não é possível remanejar autonomamente: o hóspede ${resA.guestName} já realizou check-in / está hospedado no Flat ${resA.flatNumber}. Solicite atendimento à recepção.`
    };
  }

  // 2. GUARDA: Hóspede solicitante possui trava de Quarto Preferencial / Não Trocar
  if (resA.isFlatLocked === true || resA.flatLocked === true || resA.isPreferredFlat === true) {
    return {
      success: false,
      error: "RESERVATION_FLAT_LOCKED",
      message: `Não é possível alterar o quarto desta reserva: o flat atual (${resA.flatNumber}) foi bloqueado/fixado como Quarto Preferencial no PMS${resA.flatLockReason ? ` (${resA.flatLockReason})` : ""}. A Sofia AI está proibida de alterar este quarto; apenas um administrador pode fazer essa alteração.`
    };
  }

  const oldFlatNumber = String(resA.flatNumber || (flats.find(f => f.id === resA.flatId)?.number || ""));
  if (oldFlatNumber === String(targetFlat.number)) {
    return {
      success: true,
      reallocated: false,
      alreadyAllocated: true,
      flatNumber: String(targetFlat.number),
      message: `A reserva de ${resA.guestName} já está alocada no Flat ${targetFlat.number}.`
    };
  }

  // Verifica bloqueio de quarto no flat de destino
  const hasBlock = (db?.roomBlocks || []).some(b => {
    const matches = (b.flatId === targetFlat.id || String(b.flatNumber) === String(targetFlat.number));
    return matches && b.startDate < resA.checkoutDate && b.endDate > resA.checkinDate;
  });

  if (hasBlock) {
    return {
      success: false,
      error: "FLAT_BLOCKED",
      message: `O Flat ${targetFlat.number} possui bloqueio operacional ou de manutenção no período desejado.`
    };
  }

  // Verifica reservas concorrentes no flat de destino
  const overlaps = reservations.filter(r =>
    r.id !== resA.id &&
    r.status !== "cancelada" && r.status !== "expirada" &&
    (r.flatId === targetFlat.id || String(r.flatNumber) === String(targetFlat.number)) &&
    r.checkinDate < resA.checkoutDate && r.checkoutDate > resA.checkinDate
  );

  // FASE 1: Planejamento e validação atômica de todas as sobreposições
  const plannedDisplacements = [];
  const assignedAltFlatNumbers = new Set([String(targetFlat.number)]);

  if (overlaps.length > 0) {
    for (const resB of overlaps) {
      const isOccupantCheckedIn = resB.checkedIn || resB.checkinConfirmed || resB.status === "hospedado" || resB.status === "checked_in" || resB.fnhrCompleted;
      if (isOccupantCheckedIn) {
        return {
          success: false,
          error: "OCCUPANT_CHECKED_IN",
          message: `Não é possível remanejar: o hóspede ${resB.guestName} já realizou check-in / está hospedado no Flat ${targetFlat.number}.`
        };
      }

      if (hasGuestRequestedSpecificFlat(db, resB, targetFlat.number)) {
        return {
          success: false,
          error: "FLAT_LOCKED_OR_REQUESTED",
          message: `Não é possível remanejar: o Flat ${targetFlat.number} possui trava de Quarto Preferencial ou foi solicitado expressamente pelo hóspede alocado (${resB.guestName}).`
        };
      }

      // Tenta encontrar flat alternativo para Res B (permitindo o flat que Res A está desocupando!)
      const altFlat = findAlternateFlatForGuest(db, resB, Array.from(assignedAltFlatNumbers), resA.id);
      if (!altFlat) {
        return {
          success: false,
          error: "NO_ALTERNATE_FLAT",
          message: `Não foi possível remanejar: o Flat ${targetFlat.number} está ocupado por ${resB.guestName} e não há outro flat disponível para realocá-lo.`
        };
      }

      assignedAltFlatNumbers.add(String(altFlat.number));
      plannedDisplacements.push({
        reservation: resB,
        altFlat
      });
    }
  }

  // FASE 2: Aplicação atômica das alterações (todas as garantias foram cumpridas)
  let lastDisplacedInfo = null;
  const nowIso = new Date().toISOString();

  for (const plan of plannedDisplacements) {
    const { reservation: resB, altFlat } = plan;
    const prevNum = String(resB.flatNumber || "");

    resB.previousFlatNumber = prevNum;
    resB.flatId = altFlat.id;
    resB.flatNumber = String(altFlat.number);
    resB.reallocatedBy = "sofia_ai";
    resB.reallocationReason = `Remanejado automaticamente para liberar Flat ${targetFlat.number} para ${resA.guestName} (${args.reason || "solicitação de hóspede"})`;
    resB.updatedAt = nowIso;

    if (!Array.isArray(resB.auditLogs)) resB.auditLogs = [];
    resB.auditLogs.unshift({
      timestamp: nowIso,
      action: "RESERVATION_REALLOCATED_BY_SOFIA",
      actor: { name: "Sofia (IA CorpFlats)", role: "bot" },
      description: `Deslocado do Flat ${targetFlat.number} para o Flat ${altFlat.number} para atender solicitação de ${resA.guestName}`
    });

    lastDisplacedInfo = {
      id: resB.id,
      code: resB.code,
      guestName: resB.guestName,
      previousFlat: String(targetFlat.number),
      newFlat: String(altFlat.number)
    };
  }

  // Realoca Res A para o targetFlat
  resA.previousFlatNumber = oldFlatNumber;
  resA.flatId = targetFlat.id;
  resA.flatNumber = String(targetFlat.number);
  resA.reallocatedBy = "sofia_ai";
  resA.reallocationReason = args.reason || "Solicitação de troca pelo hóspede via WhatsApp";
  resA.updatedAt = nowIso;

  if (!Array.isArray(resA.auditLogs)) resA.auditLogs = [];
  resA.auditLogs.unshift({
    timestamp: nowIso,
    action: "RESERVATION_REALLOCATED_BY_SOFIA",
    actor: { name: "Sofia (IA CorpFlats)", role: "bot" },
    description: `Realocado do Flat ${oldFlatNumber} para o Flat ${targetFlat.number}${args.reason ? ` (${args.reason})` : ""}`
  });

  // Atualiza solicitações de limpeza associadas na governança se aplicável
  if (Array.isArray(db?.cleaningRequests)) {
    const today = getBrasiliaDateParts().todayStr;
    const reqA = db.cleaningRequests.find(c =>
      (c.flatId === resA.flatId || String(c.flatNumber) === oldFlatNumber) &&
      (c.requestDate === resA.checkinDate || c.requestDate === today)
    );
    if (reqA) {
      reqA.flatId = targetFlat.id;
      reqA.flatNumber = String(targetFlat.number);
      reqA.updatedAt = nowIso;
    }
  }

  const successMsg = lastDisplacedInfo
    ? `Flat remanejado com sucesso para ${targetFlat.number}! O hóspede ${lastDisplacedInfo.guestName} foi realocado com sucesso para o Flat ${lastDisplacedInfo.newFlat}.`
    : `Flat remanejado com sucesso para ${targetFlat.number}!`;

  return {
    success: true,
    reallocated: true,
    reservationId: resA.id,
    code: resA.code,
    guestName: resA.guestName,
    previousFlat: oldFlatNumber,
    newFlat: String(targetFlat.number),
    displacedReservation: lastDisplacedInfo,
    displacedCount: plannedDisplacements.length,
    message: successMsg
  };
}

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
    flats: availableFlats.map(f => {
      const info = getFlatAmenitiesInfo(f);
      return {
        id: f.id,
        number: f.number,
        name: f.colName || `Flat ${f.number}`,
        isOccupied: false,
        tags: info?.tags || [],
        airConditionerType: info?.airConditionerType || "split",
        airConditionerLabel: info?.airConditionerLabel || "Ar-condicionado Split ❄️",
        airConditioner: info?.airConditionerType || "split",
        bedType: info?.bedType || "casal",
        bedLabel: info?.bedLabel || "Cama de Casal 🛏️",
        bed: info?.bedType || "casal",
        hasMicrowave: info?.hasMicrowave ?? true,
        features: info?.features || []
      };
    })
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

export function handleGetReservationDetails(db, args = {}) {
  const targetCode = String(args.code || args.reservationCode || args.reservationId || "").trim();
  const targetName = String(args.guestName || args.name || "").trim().toLowerCase();
  const targetPhone = normalizePhone(args.phone || args.guestPhone || "");
  const targetFlat = String(args.flatNumber || args.flatId || "").trim();

  const reservations = Array.isArray(db?.reservations) ? db.reservations : [];
  let matched = null;

  // 1. Busca por código de reserva
  if (targetCode) {
    matched = reservations.find(r =>
      r && (String(r.code || "").toLowerCase() === targetCode.toLowerCase() ||
            String(r.id || "") === targetCode)
    );
  }

  // 2. Busca por telefone
  if (!matched && targetPhone) {
    matched = reservations.find(r => {
      if (!r) return false;
      const rPhone = normalizePhone(r.guestPhone || r.phone || "");
      return rPhone && (targetPhone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(targetPhone.slice(-8)));
    });
  }

  // 3. Busca por nome do hóspede
  if (!matched && targetName) {
    matched = reservations.find(r =>
      r && r.guestName && r.guestName.toLowerCase().includes(targetName)
    );
  }

  // 4. Busca por número do flat
  if (!matched && targetFlat) {
    const todayStr = getBrasiliaDateParts().todayStr;
    matched = reservations.find(r =>
      r && (String(r.flatNumber) === targetFlat || String(r.flatId) === targetFlat) &&
      r.status !== "cancelada" && r.status !== "expirada" &&
      (r.checkinDate <= todayStr && r.checkoutDate >= todayStr)
    );
  }

  if (!matched) {
    return {
      success: false,
      found: false,
      message: "Nenhuma reserva foi localizada no sistema com os critérios informados."
    };
  }

  const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
  const rawCheckinUrl = getCheckinUrlSync(matched, 1, appOrigin, db);

  const todayStr = getBrasiliaDateParts().todayStr;
  let stayStatus = "sem_reserva_ativa";
  if (matched.checkinDate === todayStr) {
    stayStatus = "checkin_hoje";
  } else if (matched.checkoutDate === todayStr) {
    stayStatus = "checkout_hoje";
  } else if (matched.checkinDate < todayStr && matched.checkoutDate > todayStr) {
    stayStatus = "em_estadia";
  } else if (matched.checkinDate > todayStr) {
    stayStatus = "reserva_futura";
  } else {
    stayStatus = "estadia_passada";
  }

  const isCheckinRelevant = stayStatus === "checkin_hoje" || stayStatus === "reserva_futura";
  const isCheckoutDay = stayStatus === "checkout_hoje";
  const isHosted = stayStatus === "em_estadia" || isCheckoutDay;
  const checkoutUrl = `${appOrigin}/checkout/${matched.code || matched.reservationCode || `RES-${matched.flatNumber}`}`;
  const checkinUrl = isCheckinRelevant ? rawCheckinUrl : null;

  let operationalGuidance = "";
  if (isCheckoutDay) {
    operationalGuidance = "HÓSPEDE EM DIA DE CHECK-OUT HOJE (saída hoje até as 12:00h). NUNCA enviar link de pré-check-in digital. Informar sobre horário limite de saída até 12:00h, orientar sobre procedimentos de desocupação e devolução de chaves, perguntar se deseja prorrogação (late check-out) mediante disponibilidade ou verificar se já desocupou o flat. Fornecer link de confirmação de check-out.";
  } else if (stayStatus === "em_estadia") {
    operationalGuidance = "HÓSPEDE JÁ ACOMODADO NO FLAT (em estadia). NUNCA enviar link de pré-check-in digital. Fornecer apoio à estadia em andamento.";
  } else if (stayStatus === "checkin_hoje") {
    operationalGuidance = "HÓSPEDE COM ENTRADA HOJE (a partir das 14:00h). Enviar link de pré-check-in digital para agilizar liberação na portaria 24h.";
  }

  return {
    success: true,
    found: true,
    reservation: {
      id: matched.id,
      code: matched.code || matched.reservationCode || `RES-${matched.flatNumber}`,
      guestName: matched.guestName,
      guestPhone: matched.guestPhone || matched.phone,
      checkinDate: matched.checkinDate,
      checkoutDate: matched.checkoutDate,
      flatNumber: matched.flatNumber,
      status: matched.status,
      paymentStatus: matched.paymentStatus,
      channel: matched.channel,
      totalAmount: matched.totalAmount,
      stayStatus,
      isCheckinRelevant,
      isCheckoutDay,
      isHosted,
      checkinUrl,
      rawCheckinUrl: isCheckinRelevant ? rawCheckinUrl : null,
      checkoutUrl,
      operationalGuidance
    }
  };
}

export function handleGetFlatStatus(db, args = {}) {
  const targetFlat = String(args.flatNumber || args.flatId || "").trim();
  if (!targetFlat) {
    return {
      success: false,
      error: "MISSING_FLAT_NUMBER",
      message: "Número do flat é obrigatório."
    };
  }

  const flats = Array.isArray(db?.flats) ? db.flats : [];
  const flat = flats.find(f => String(f.number) === targetFlat || String(f.id) === targetFlat);

  if (!flat) {
    return {
      success: false,
      error: "FLAT_NOT_FOUND",
      message: `Flat ${targetFlat} não foi encontrado no cadastro.`
    };
  }

  const todayStr = getBrasiliaDateParts().todayStr;
  let cleaningStatus = "desconhecido";
  let isRoomReady = false;

  const cleanReq = (db?.cleaningRequests || []).find(c =>
    (String(c.flatNumber) === String(flat.number) || String(c.flatId) === String(flat.id)) &&
    (c.requestDate === todayStr || c.effectiveDate === todayStr)
  );

  if (cleanReq) {
    cleaningStatus = cleanReq.status || "pendente";
    isRoomReady = cleanReq.status === "clean" || cleanReq.completedAt != null;
  } else if (flat.status === "clean") {
    cleaningStatus = "clean";
    isRoomReady = true;
  } else {
    cleaningStatus = flat.status || "dirty";
    isRoomReady = flat.status === "clean";
  }

  const activeReservation = (db?.reservations || []).find(r =>
    (String(r.flatNumber) === String(flat.number) || String(r.flatId) === String(flat.id)) &&
    r.status !== "cancelada" && r.status !== "expirada" &&
    r.checkinDate <= todayStr && r.checkoutDate >= todayStr
  );

  const amenities = getFlatAmenitiesInfo(flat);

  return {
    success: true,
    flatNumber: String(flat.number),
    flatId: flat.id,
    cleaningStatus,
    isRoomReady,
    isOccupied: Boolean(activeReservation),
    currentGuestName: activeReservation?.guestName || null,
    statusDescription: isRoomReady
      ? `Flat ${flat.number} está 100% limpo, higienizado e pronto para entrada.`
      : `Flat ${flat.number} está em higienização ou pendente de liberação pela governança.`,
    tags: amenities?.tags || [],
    airConditionerType: amenities?.airConditionerType || "split",
    airConditionerLabel: amenities?.airConditionerLabel || "Ar-condicionado Split ❄️",
    airConditioner: amenities?.airConditionerType || "split",
    bedType: amenities?.bedType || "casal",
    bedLabel: amenities?.bedLabel || "Cama de Casal 🛏️",
    bed: amenities?.bedType || "casal",
    hasMicrowave: amenities?.hasMicrowave ?? true,
    features: amenities?.features || []
  };
}

export function handleGetPricingInfo(db, args = {}) {
  const inDate = args.checkIn || args.checkin || getBrasiliaDateParts().todayStr;
  const outDate = args.checkOut || args.checkout || null;
  const guests = Math.max(1, Number(args.guests || 1));
  const flatId = args.flatId || null;
  const withBreakfast = args.withBreakfast === true;

  const tSettings = db?.tariffSettings || {};
  const baseDailyRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);
  const breakfastFeePerPerson = 35;

  if (outDate && inDate < outDate) {
    const quote = handleCalculateQuote(db, {
      checkIn: inDate,
      checkOut: outDate,
      guests,
      flatId,
      ratePlan: withBreakfast ? "with_breakfast" : "room_only"
    });
    return {
      success: true,
      hasPeriod: true,
      checkIn: inDate,
      checkOut: outDate,
      nights: quote.nights,
      guests,
      withBreakfast,
      totalAmount: quote.total,
      dailyRateAverage: Math.round((quote.total / (quote.nights || 1)) * 100) / 100,
      cleaningFee: quote.cleaningFee,
      isCleaningFeeExempt: withBreakfast
    };
  }

  const breakfastTotal = withBreakfast ? (breakfastFeePerPerson * guests) : 0;
  const dailyRate = baseDailyRate + breakfastTotal;

  return {
    success: true,
    hasPeriod: false,
    baseRateWithoutBreakfast: baseDailyRate,
    rateWithBreakfastFor1: baseDailyRate + breakfastFeePerPerson,
    rateWithBreakfastFor2: baseDailyRate + (breakfastFeePerPerson * 2),
    cleaningFeeStandard: 70,
    cleaningFeeWithBreakfast: 0,
    breakfastPerPerson: breakfastFeePerPerson,
    isCleaningFeeExemptOnBreakfast: true,
    calculatedDailyRate: dailyRate,
    summary: `Diária a partir de R$ ${baseDailyRate},00 sem café (+ taxa única de limpeza R$ 70,00); ou a partir de R$ ${baseDailyRate + breakfastFeePerPerson},00 com café no quarto (1 pessoa) com ISENÇÃO TOTAL da taxa de limpeza!`
  };
}

export function handleRecordUnmetDemand(db, args = {}) {
  const text = args.guestRequest || args.text || args.message || "";
  const title = args.demandTitle || args.title || "";
  const category = args.category || inferFaqCategory(text) || "outros";
  const reason = args.reason || "capability_missing";
  const suggestedFeature = args.suggestedFeature || "";

  const demand = detectAndRecordUnmetDemand({
    db,
    text,
    senderPhone: args.senderPhone || args.phone || "",
    senderName: args.senderName || args.guestName || "Hóspede",
    guestContext: args.guestContext || null,
    actionTarget: args.actionTarget || null,
    reason,
    saveDatabase: args.saveDatabase || null,
    createNotification: args.createNotification || null
  });

  if (demand && title) {
    demand.demandTitle = title;
  }
  if (demand && suggestedFeature) {
    demand.suggestedFeature = suggestedFeature;
  }

  return {
    success: true,
    demandId: demand?.id,
    demandTitle: demand?.demandTitle,
    category: demand?.category,
    message: "Demanda registrada com sucesso em Oportunidades de Automação."
  };
}

export function handleInformCheckout(db, args = {}) {
  if (!db) return { success: false, error: "Database not available" };

  const targetFlat = String(args.flatNumber || args.flatId || args.guestContext?.flatNumber || "").trim();
  const phone = cleanWhatsAppPhone(args.phone || args.senderPhone || args.guestPhone || args.guestContext?.phone || "");
  const now = new Date().toISOString();
  const todayStr = getBrasiliaDateParts().todayStr;

  const flats = Array.isArray(db.flats) ? db.flats : [];
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];

  let matchedFlat = null;
  if (targetFlat) {
    matchedFlat = flats.find(f => String(f.number) === targetFlat || String(f.id) === targetFlat);
  }

  // Se não localizou pelo número do flat, tenta pelo telefone do hóspede em reserva ativa hoje
  let matchedRes = null;
  if (phone) {
    matchedRes = reservations.find(r => {
      const rPhone = cleanWhatsAppPhone(r.guestPhone || r.phone || "");
      const isPhoneMatch = rPhone && (phone.endsWith(rPhone.slice(-8)) || rPhone.endsWith(phone.slice(-8)));
      return isPhoneMatch && r.status !== "cancelada" && r.status !== "cancelled" &&
        (r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr));
    });
    if (matchedRes && !matchedFlat) {
      matchedFlat = flats.find(f => f.id === matchedRes.flatId || String(f.number) === String(matchedRes.flatNumber));
    }
  }

  const resolvedFlatNum = matchedFlat ? String(matchedFlat.number) : (targetFlat || (matchedRes ? String(matchedRes.flatNumber) : null));

  if (!resolvedFlatNum) {
    return {
      success: false,
      error: "FLAT_NOT_IDENTIFIED",
      message: "Não foi possível identificar o número do flat para registrar o check-out."
    };
  }

  // Se ainda não localizou a reserva pelo telefone, tenta localizar pelo flat para a data de hoje
  if (!matchedRes && (matchedFlat || resolvedFlatNum)) {
    matchedRes = reservations.find(r =>
      (matchedFlat ? (r.flatId === matchedFlat.id || String(r.flatNumber) === String(matchedFlat.number)) : String(r.flatNumber) === String(resolvedFlatNum)) &&
      r.status !== "cancelada" && r.status !== "cancelled" &&
      (r.checkoutDate === todayStr || (r.checkinDate <= todayStr && r.checkoutDate >= todayStr))
    );
  }

  // 1. Marca flat como desocupado
  if (matchedFlat) {
    matchedFlat.isOccupied = false;
    matchedFlat.updatedAt = now;
  }

  // 2. Atualiza ou cria solicitação de limpeza
  if (!Array.isArray(db.cleaningRequests)) db.cleaningRequests = [];
  let cleanReq = db.cleaningRequests.find(r => 
    (matchedFlat && r.flatId === matchedFlat.id) || String(r.flatNumber) === resolvedFlatNum
  );

  const guestName = args.guestName || args.senderName || matchedRes?.guestName || "Hóspede";

  if (cleanReq) {
    cleanReq.isVacant = true;
    cleanReq.isVacantExplicitlySet = true;
    cleanReq.vacantSource = "whatsapp_guest";
    cleanReq.vacantSetAt = now;
    cleanReq.leavingGuest = cleanReq.leavingGuest || guestName;
    cleanReq.updatedAt = now;
  } else {
    cleanReq = {
      id: db.cleaningRequests.length > 0 ? Math.max(...db.cleaningRequests.map(r => r.id)) + 1 : 1,
      flatId: matchedFlat ? matchedFlat.id : (matchedRes?.flatId || `flat_${resolvedFlatNum}`),
      flatNumber: resolvedFlatNum,
      requestDate: todayStr,
      source: "whatsapp_guest",
      status: "dirty",
      assignedUserId: null,
      isVacant: true,
      isVacantExplicitlySet: true,
      vacantSource: "whatsapp_guest",
      vacantSetAt: now,
      isPriority: false,
      leavingGuest: guestName,
      arrivingGuest: null,
      pendingObservation: null,
      willCleanAt: null,
      cleaningStartedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    db.cleaningRequests.unshift(cleanReq);
  }

  // 3. Atualiza reserva ativa se houver
  if (matchedRes) {
    matchedRes.status = "completed";
    matchedRes.checkoutDone = true;
    matchedRes.checkoutMethod = matchedRes.checkoutMethod ? `${matchedRes.checkoutMethod} + whatsapp_guest` : "whatsapp_guest";
    matchedRes.actualCheckoutAt = matchedRes.actualCheckoutAt || now;
    matchedRes.actualCheckoutTime = matchedRes.actualCheckoutTime || getBrasiliaDateParts().timeStr;
    matchedRes.updatedAt = now;
  }

  // 4. Cria notificação para governança e recepção se houver array no db
  if (Array.isArray(db.notifications)) {
    db.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: `Check-out Comunicado - Flat ${resolvedFlatNum}`,
      message: `${guestName} comunicou a saída do Flat ${resolvedFlatNum} via WhatsApp. Unidade desocupada e pronta para governança.`,
      type: "checkout",
      category: "governance",
      flatNumber: resolvedFlatNum,
      read: false,
      createdAt: now
    });
  }

  return {
    success: true,
    flatNumber: resolvedFlatNum,
    cleaningRequestId: cleanReq.id,
    isVacant: true,
    reservationId: matchedRes?.id || null,
    message: `Check-out do Flat ${resolvedFlatNum} comunicado pelo hóspede via WhatsApp e registrado com sucesso.`
  };
}

// ── Mapeamento Contínuo de Demandas Sem Acesso & Oportunidades de Automação ──

export const UNMET_DEMAND_CATEGORIES = {
  checkout_comunicacao: {
    category: "checkout_comunicacao",
    title: "Comunicação / Notificação de Check-out pelo Hóspede via WhatsApp",
    defaultSuggested: "Integrar aviso de saída do hóspede via WhatsApp com atualização automática do status do flat nos cards de limpeza e disparo de eventos de pós-checkout."
  },
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
  itens_especiais_comodidades: {
    category: "itens_especiais_comodidades",
    title: "Solicitação de Item / Comodidade Especial (ex: Berço, Secador, Ferro)",
    defaultSuggested: "Mapear controle de estoque de comodidades adicionais para disponibilização aos hóspedes."
  },
  dados_reserva_indisponiveis: {
    category: "dados_reserva_indisponiveis",
    title: "Consulta de Reserva Não Localizada",
    defaultSuggested: "Aprimorar busca com correspondência fonética ou integração com OTAs (Booking/Airbnb)."
  },
  dados_sistema_indisponiveis: {
    category: "dados_sistema_indisponiveis",
    title: "Dados do Sistema Não Localizados / Indisponíveis",
    defaultSuggested: "Disponibilizar endpoint ou leitura para este tipo de dado operacional na base."
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
  const norm = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
    if (actionTarget === "checkout_comunicacao" || actionTarget === "informCheckout" || actionTarget === "notifyCheckout") {
      return {
        category: "checkout_comunicacao",
        demandTitle: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.title,
        reason: "action_disabled",
        actionTarget,
        suggestedFeature: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.defaultSuggested
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

  if (/\b(?:preciso|solicito|solicitar|gostaria|quero|favor|pode|mandar|trazer|trocar|troca|extra[s]?|limp[ao]s?|suj[ao]s?|mais)\b.*\b(?:toalha|toalhas|len[cç]ol|len[cç][oó]is|travesseiro|travesseiros|cobertor|cobertores|enxoval|manta|edredom)\b/i.test(lower) ||
      /\b(?:toalha|toalhas|len[cç]ol|len[cç][oó]is|travesseiro|cobertor|enxoval)\b.*\b(?:extra[s]?|limp[ao]s?|suj[ao]s?|mais|adicional|adicionais|troca|trocar)\b/i.test(lower)) {
    return {
      category: "enxoval_toalhas",
      demandTitle: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.enxoval_toalhas.defaultSuggested
    };
  }

  if (/\b(?:ar\s*(?:condicionado|split)?\s*(?:n[aã]o\s*gela|parou|quebrou|n[aã]o\s*liga)|chuveiro\s*(?:n[aã]o\s*esquenta|queimou|frio)|vazamento|pia\s*entupida|vaso\s*(?:entupido|vazando)|l[aâ]mpada\s*queimada|fechadura|porta\s*(?:n[aã]o\s*abre|emperrou)|tv\s*(?:n[aã]o\s*liga|sem\s*sinal)|controle\s*(?:remoto\s*)?(?:n[aã]o\s*funciona|quebrou|sem\s*pilha)|manuten[cç][aã]o|reparo|conserto|abrir\s*(?:um\s*)?chamado)\b/i.test(lower)) {
    return {
      category: "chamado_manutencao",
      demandTitle: UNMET_DEMAND_CATEGORIES.chamado_manutencao.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.chamado_manutencao.defaultSuggested
    };
  }

  if (/\b(?:limpeza\s*(?:extra|avulsa|hoje|agora|imediata)|pedir\s*(?:limpeza|faxina)|solicitar\s*(?:uma\s*)?(?:limpeza|faxina)|preciso\s*de\s*(?:limpeza|faxina)|faxina|camareira\s*(?:no\s*quarto|pode\s*limpar)|limpar\s*(?:o\s*)?(?:meu\s*)?(?:quarto|flat|apartamento)\s*(?:hoje|agora|urgente|por\s*favor)?)\b/i.test(lower)) {
    return {
      category: "limpeza_avulsa",
      demandTitle: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.limpeza_avulsa.defaultSuggested
    };
  }

  const isLateCheckoutDemand = /\b(?:late\s*check-?out|sair\s*mais\s*tarde|sa[ií]da\s*tardia|desocupar\s*mais\s*tarde|sair\s*(?:as|às)\s*(?:1[3-9]|20))\b/i.test(lower) ||
    (/\bestender\s*(?:a\s*)?(?:estadia|sa[ií]da|di[aá]ria|reserva)\b/i.test(lower) && !/\b(?:pelo|no|via|por)\s+whatsapp\b/i.test(lower));

  if (isLateCheckoutDemand) {
    return {
      category: "late_checkout",
      demandTitle: UNMET_DEMAND_CATEGORIES.late_checkout.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.late_checkout.defaultSuggested
    };
  }

  // 3.10 Comunicação / Notificação de Check-out e Desocupação pelo Hóspede via WhatsApp
  const isCheckoutCommunication = (
    // 1. Verbos/expressões de intenção comunicativa + checkout/saída/desocupação
    /\b(?:informar|informando|avisar|avisando|comunicar|comunicando|notificar|notificando|passar|passando|dar|dando|confirmar|confirmando|registro|registrar|registrando|vim\s+fazer)\s+(?:o|a|meu|minha|nosso|nossa)?\s*(?:check[- ]?out|saida|desocupacao|liberacao|baixa)\b/i.test(norm) ||
    /\b(?:gostaria|quero|preciso|queria|favor|desejo)\s+(?:de\s+)?(?:informar|avisar|comunicar|fazer|dar|passar|registrar)\s+(?:o|a|meu|minha|nosso|nossa)?\s*(?:check[- ]?out|saida|baixa)\b/i.test(norm) ||
    // 2. Ação de saída/desocupação em andamento ou recém concluída
    /\b(?:estou|to|estamos|ja|vim)\s+(?:fazendo|realizando)\s+(?:o|meu|nosso)?\s*check[- ]?out\b/i.test(norm) ||
    /\b(?:fazendo|realizando)\s+(?:o|meu|nosso)?\s*check[- ]?out(?:\s+agora)?\b/i.test(norm) ||
    /\b(?:estou|to|estamos|ja)\s+(?:saindo|desocupando|liberando|deixando|indo\s+embora|partindo)\b/i.test(norm) ||
    /\b(?:saindo|desocupando|liberando|deixando|indo\s+embora)\s+(?:do|da|o|a)?\s*(?:flat|quarto|apartamento|apto|uh|hotel|condominio|soho|edificio|\d{2,4}|agora)\b/i.test(norm) ||
    /\b(?:estou|to|estamos)\s+(?:entregando|deixando|devolvendo)\s+(?:as?|os?)?\s*chave[s]?\b/i.test(norm) ||
    /\b(?:acabei|acabamos)\s+de\s+(?:sair|desocupar|liberar|entregar|deixar|devolver|fazer\s+(?:o\s+)?check[- ]?out)\b/i.test(norm) ||
    (/\b(?:ja\s+)?(?:sai|saimos|deixei|deixamos|entreguei|entregamos|devolvi|devolvemos|desocupe?i|desocupamos|liberei|liberamos|fui\s+embora|fomos\s+embora)\b/i.test(norm) && /\b(?:flat|quarto|apartamento|apto|uh|unidade|\d{2,4}|chave|chaves|portaria|recepcao|hotel|desocupe?i|desocupamos|check[- ]?out)\b/i.test(norm)) ||
    /\b(?:ja\s+)?(?:fiz|fizemos|conclui|concluimos|realizei|realizamos)\s+(?:o|meu|nosso)?\s*check[- ]?out\b/i.test(norm) ||
    /\b(?:flat|quarto|apartamento|apto|uh|unidade)\s*(?:\d{2,4}\s*)?(?:desocupado|liberado|vazio)\b/i.test(norm) ||
    /\b(?:aviso|comunicacao|notificacao)\s+de\s+(?:check[- ]?out|saida)\b/i.test(norm) ||
    /\b(?:saida|check[- ]?out)\s+(?:realizad[ao]|conclu[ií]d[ao]|feit[ao]|informad[ao])\b/i.test(norm) ||
    /\b(?:chave|chaves)\s+(?:entregue[s]?|deixada[s]?|devolvida[s]?)\s+(?:na|no|para\s+a)\s+(?:portaria|recepcao|mesa|bancada|balcao)\b/i.test(norm) ||
    /\b(?:chave|chaves)\s+(?:na|no|em\s+cima\s+d[ao])\s+(?:portaria|recepcao|mesa|bancada|balcao)\b/i.test(norm)
  ) && !(
    /\b(?:qual\s+(?:e\s+)?o\s+horario|que\s+horas\s+(?:e|seria|posso\s+fazer\s+o)|ate\s+que\s+horas\s+(?:e\s+o|posso\s+ficar))\s+(?:de\s+|do\s+)?check[- ]?out\b/i.test(norm) ||
    /\b(?:quanto\s+custa|qual\s+(?:o\s+)?(?:preco|valor|custo|taxa))\s+(?:do|de)?\s*(?:check[- ]?out|late\s*check[- ]?out)\b/i.test(norm) ||
    (/\b(?:politica|regras?)\s+de\s+check[- ]?out\b/i.test(norm) && !/\b(?:sai|saimos|deixei|entreguei|desocupe|liberei)\b/i.test(norm))
  );

  if (isCheckoutCommunication) {
    return {
      category: "checkout_comunicacao",
      demandTitle: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.title,
      reason: actionTarget ? "action_disabled" : "capability_missing",
      actionTarget: "informCheckout",
      suggestedFeature: UNMET_DEMAND_CATEGORIES.checkout_comunicacao.defaultSuggested
    };
  }

  if (/\b(?:placa|cadastrar\s*ve[ií]culo|cadastrar\s*carro|trocar\s*de\s*carro|mudei\s*de\s*carro|carro\s*novo|autorizar\s*carro|autorizar\s*ve[ií]culo|adicionar\s*ve[ií]culo|adicionar\s*placa)\b/i.test(lower) ||
      (/\b(?:garagem|estacionamento)\b/i.test(lower) && /\b(?:trocar|cadastrar|adicionar|mudar|liberar|placa)\b/i.test(lower))) {
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

  if (/\b(?:pedir|solicitar|entregar|enviar|trazer|agendar|mandar)\s+(?:o\s+)?caf[eé]\b/i.test(lower) ||
      /\b(?:room\s*service|delivery\s*de\s*caf[eé])\b/i.test(lower) ||
      (/\bcaf[eé]\s*(?:da\s*manh[aã])?\s*(?:no\s*quarto|servido\s*no\s*quarto)\b/i.test(lower) && /\b(?:pedir|quero|favor|preciso|solicito|trazer|entregar|agendar)\b/i.test(lower))) {
    return {
      category: "cafe_quarto",
      demandTitle: UNMET_DEMAND_CATEGORIES.cafe_quarto.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.cafe_quarto.defaultSuggested
    };
  }

  if (/\b(?:ber[cç]o|secador(?:\s+de\s+cabelo)?|ferro(?:\s+de\s+passar)?|t[aá]bua(?:\s+de\s+passar)?|tomada\s+220|adaptador|recarga|carro\s+el[eé]trico|aquecedor|cama\s+extra)\b/i.test(lower)) {
    return {
      category: "itens_especiais_comodidades",
      demandTitle: UNMET_DEMAND_CATEGORIES.itens_especiais_comodidades.title,
      reason: "capability_missing",
      actionTarget: null,
      suggestedFeature: UNMET_DEMAND_CATEGORIES.itens_especiais_comodidades.defaultSuggested
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
  category = null,
  demandTitle = null,
  suggestedFeature = null,
  saveDatabase = null,
  createNotification = null
}) {
  if (!db) return null;
  if (!Array.isArray(db.unmetDemands)) db.unmetDemands = [];

  const rawText = String(text || "").trim();
  if (!rawText && !actionTarget && !category) return null;

  const cleanPhone = cleanWhatsAppPhone(senderPhone) || String(senderPhone || "").replace(/\D/g, "");

  // Descarta mensagens que são apenas saudações ou despedidas sem demanda
  if (rawText && !actionTarget && !category) {
    const isGreeting = /^(?:oi|ol[aá]|opa|ei|bom dia|boa tarde|boa noite|tchau|obrigado|obrigada|valeu|ok|beleza|sim|n[aã]o)[.!?\s]*$/i.test(rawText);
    if (isGreeting) return null;
  }

  const classification = (category && demandTitle)
    ? {
        category,
        demandTitle,
        reason: reason || "capability_missing",
        actionTarget: actionTarget || null,
        suggestedFeature: suggestedFeature || UNMET_DEMAND_CATEGORIES[category]?.defaultSuggested || ""
      }
    : classifyUnmetDemand(rawText, actionTarget, reason);
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
    status: "pendente",
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
    case "getReservationDetails":
      return handleGetReservationDetails(db, args);
    case "getFlatStatus":
      return handleGetFlatStatus(db, args);
    case "getPricingInfo":
      return handleGetPricingInfo(db, args);
    case "recordUnmetDemand":
      return handleRecordUnmetDemand(db, args);
    case "informCheckout":
      return handleInformCheckout(db, args);
    case "getFlatAmenities":
      return handleGetFlatAmenities(db, args);
    case "reallocateReservationFlat":
      return handleReallocateReservationFlat(db, args);
    case "querySystemData":
      return handleQuerySystemData(db, args);
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

const GENERIC_COMMON_WORDS = new Set([
  "horario", "horarios", "quarto", "quartos", "flat", "flats", "apartamento", "apto",
  "hotel", "reserva", "reservas", "dia", "dias", "hoje", "valor", "valores", "preco",
  "precos", "informacao", "informacoes", "duvida", "duvidas", "posso", "pode", "saber",
  "fazer", "tem", "temos", "qual", "quais", "como", "onde", "quando"
]);

// ── Motor de Treinamento Inteligente, Calibração de Tom e Modo Desenvolvedor ──

/**
 * Sintetiza o texto de coaching do desenvolvedor em uma diretriz profissional
 * sem repetir erros de digitação ou frases informais literais ("Anti-Papagaio")
 */
export function cleanDeveloperPreamble(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText.trim();
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/^sofia\s*[,:]\s*/i, "")
      .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador|programador)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:miller|desenvolvedor|dev|criador|programador)\s+(?:aqui|falando)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:estou|apenas|s[oó]|em)\s+test(?:ando|e)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:(?:teste|testando)[.!?,;:]*\s*)+/i, "")
      .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;]*\s*/i, "")
      .trim();
  }
  return cleaned;
}

/**
 * Sintetiza o texto de coaching do desenvolvedor em uma diretriz profissional
 * sem repetir erros de digitação ou frases informais literais ("Anti-Papagaio")
 */
export function synthesizeGuidelineFromText(rawText, category = "geral") {
  const cleanedText = cleanDeveloperPreamble(rawText);
  const text = cleanedText || String(rawText || "").trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Caso 1: Regra sobre malas / bagagens
  if (/malas?|bagag/i.test(lower)) {
    return "Nunca oferecer auxílio com malas ou bagagens. O condomínio Soho não dispõe de serviço de maleiros ou carregadores, mantendo o atendimento focado no acolhimento e nas dúvidas do hóspede.";
  }

  // Caso 2: Regra sobre postura de escuta ativa / sem presunção em saudações
  if (/(?:n[aã]o\s+assumir|s[oó]\s+pergunt|como\s+pode\s+ajudar|racioc[ií]nio|apenas\s+responder)/i.test(lower) || (/(?:sauda[cç][aã]o|bom\s+dia|ol[aá])/i.test(lower) && /(?:h[oó]spede|reserva|ajud)/i.test(lower))) {
    return "Adotar postura de escuta ativa: em saudações iniciais (olá, bom dia, etc.), cumprimentar cordialmente e apenas perguntar abertamente como pode ajudar hoje, sem presumir o assunto e sem despejar detalhes da reserva logo de início. O conhecimento sobre o hóspede ou reserva deve ser usado nos bastidores para responder com coerência sob demanda, conforme o que for perguntado.";
  }

  // Caso 2.5: Regra sobre check-out / hóspede hospedado / não mandar pré-check-in em check-out ou estadia
  const isCheckoutOrInStayCoaching = (
    /(?:check[- ]?out|sa[ií]da).*?(?:n[aã]o\s+(?:deveria|deve|pode|mande|mandar|precisa)|link\s+(?:de\s+)?check[- ]?in|estender|prorroga|late\s+check[- ]?out|12:00|12h|desocup)/i.test(lower) ||
    /(?:n[aã]o\s+(?:deveria|deve|pode|mande|mandar|precisa)\s+(?:ter\s+)?mandad[ao]\s+link\s+(?:de\s+)?check[- ]?in)/i.test(lower) ||
    /(?:estou\s+hospedad[ao]|j[aá]\s+hospedad[ao]|em\s+estadia|quem\s+j[aá]\s+est[aá]\s+hospedad[ao]).*?(?:check[- ]?out|sa[ií]da|link\s+(?:de\s+)?check[- ]?in|pre[- ]?check[- ]?in|n[aã]o\s+precisa)/i.test(lower) ||
    (category === "checkout" && /(?:check[- ]?in|estender|prorroga|12:00|12h|desocup|hor[aá]rio|sa[ií]da)/i.test(lower))
  );
  if (isCheckoutOrInStayCoaching) {
    return "Para hóspedes já hospedados ou em dia de check-out, priorizar procedimentos de check-out (horário limite até às 12:00h) e verificar se o hóspede deseja estender a estadia ou se já desocupou o flat, sem envio de link de pré-check-in.";
  }

  // Caso 3: Regra sobre checagem de reserva
  if (/pergu?i?nt.*reserva|verific.*reserva/i.test(lower)) {
    return "Ao ser questionada se tem reserva ou se a reserva está confirmada ('minha reserva está confirmada?'), verificar no sistema se o hóspede possui reserva ativa para data atual ou futura. Se confirmada, apresentar os detalhes do flat, check-in, check-out e link do pré-check-in. Se não localizada pelo número, solicitar o nome completo do titular ou código da reserva com cortesia.";
  }

  // Caso 1.5: Regra sobre saudação ou perguntar sobre estadia agradável
  if (/(?:perguntar\s+assim|sauda[cç][aã]o|hospedad[ao]|esteja\s+hospedad[ao]|em\s+estadia|tornar\s+a\s+estadia)/i.test(lower)) {
    return "Ao saudar o hóspede, verificar primeiro o status da estadia no sistema: só perguntar sobre 'tornar a estadia mais agradável' se a pessoa já estiver hospedada (em estadia). Se for reserva futura, check-in hoje que ainda não entrou ou sem reserva, adaptar a saudação ao momento exato da chegada.";
  }

  // Caso 4: Regra sobre café com horário específico informado
  if (/caf[eé]|desjejum/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário do café da manhã é ${timeMatch[0]} em bandeja servida no quarto, com agendamento até a véspera pelo portal.`;
    }
  }

  // Caso 5: Regra sobre check-in com horário específico
  if (/check[- ]?in|entrada/i.test(lower) && !/check[- ]?out/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário de check-in é a partir das ${timeMatch[0]}.`;
    }
  }

  // Caso 6: Regra sobre check-out com horário específico
  if (/check[- ]?out|sa[ií]da/i.test(lower)) {
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)\s*\d{1,2}(?::\d{2})?(?:h)?)\b/i);
    if (timeMatch) {
      return `O horário de check-out é até as ${timeMatch[0]}.`;
    }
  }

  // Caso 7: Regra genérica bem sintetizada preservando fatos (anti-papagaio estrito)
  let synthesized = text
    .replace(/^sofia\s*[,:]\s*/i, "")
    .replace(/^(?:(?:sou|aqui\s+[eé])\s+(?:o\s+)?(?:miller|desenvolvedor|dev|criador)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:miller|desenvolvedor|dev)\s+(?:aqui|falando)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:estou|apenas|s[oó]|em)\s+test(?:ando|e)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:(?:teste|testando)[.!?,;:]*\s*)/i, "")
    .replace(/^(?:quando|sempre\s+que|toda\s+vez\s+que|se)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+pergu?i?nt[^,.:;]+(?:voc[eê]\s+deve|favor|deve-se|tem\s+que)\s+/i, "Ao ser questionada sobre este tema: ")
    .replace(/^voc[eê]\s+deve\s+/i, "Sempre ")
    .replace(/\b(?:estou\s+testando|sou\s+miller|miller\s+aqui|apenas\s+testando|em\s+teste|teste:)\b[.!?]*\s*/gi, "")
    .replace(/\bvoc[eê]\s+n[aã]o\s+deveria\s+ter\s+mandad[ao]\b/gi, "não enviar")
    .replace(/\bvoc[eê]\s+n[aã]o\s+deve\s+mandar\b/gi, "não enviar")
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
    /\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|miller\s+(?:aqui|falando)|sou\s+(?:o\s+)?(?:desenvolvedor|dev|criador|programador)|dev\s+aqui)\b/i.test(lower) ||
    // Menção explícita a testes do desenvolvedor
    /\b(?:estou\s+testando|apenas\s+testando|em\s+teste|teste:\s*|testando:\s*|modo\s+teste)\b/i.test(lower) ||
    // Feedback de erro / crítica comportamental
    /\b(?:n[aã]o\s+deve|n[aã]o\s+pode|n[aã]o\s+pergunte|n[aã]o\s+diga|n[aã]o\s+fale|n[aã]o\s+responda|n[aã]o\s+mande)\s+(?:assim|dessa\s+forma|desse\s+jeito|isso)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+(?:deve|deveria|precisa|pode)\s+(?:perguntar|dizer|falar|responder|mandar|enviar|ter\s+mandado|agir|tratar|usar|oferecer))\b/i.test(lower) ||
    /\b(?:n[aã]o\s+(?:deveria|precisa|deve|pode)\s+(?:ter\s+)?mandad[ao]\s+(?:link|mensagem|pre-?check-?in|check-?in))\b/i.test(lower) ||
    /\b(?:n[aã]o\s+precisa\s+(?:de\s+)?(?:link|pre-?check-?in|check-?in))\b/i.test(lower) ||
    /\b(?:malas?|bagag(?:em|ens)?)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+assumir|s[oó]\s+deve\s+usar|apenas\s+responder|esse\s+seja\s+o\s+racioc[ií]nio|racioc[ií]nio)\b/i.test(lower) ||
    /\b(?:n[aã]o\s+faz\s+sentido|a\s+menos\s+que|s[oó]\s+se\s+a\s+pessoa|s[oó]\s+(?:pergunte|fale|diga|mande)\s+se)\b/i.test(lower) ||
    /\b(?:voc[eê]\s+verificou|verifique\s+(?:primeiro|antes)|verificou\s+(?:primeiro|antes)|cheque\s+(?:primeiro|antes))\b/i.test(lower) ||
    /\b(?:t[aá]\s+errad[ao]|est[aá]\s+errad[ao]|t[aá]\s+burra|est[aá]\s+burra|falhando|melhor(?:e|ar)\s+(?:a\s+resposta|isso)|corrij?a|aprenda\s+a)\b/i.test(lower) ||
    /\b(?:por\s+que\s+voc[eê]\s+(?:disse|falou|perguntou|respondeu))\b/i.test(lower) ||
    // Instruções condicionais de atendimento ("quando alguém...", "se o hóspede...")
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+(?:algu[eé]m|o\s+h[oó]spede|o\s+cliente|um\s+h[oó]spede|[a-z]+)\s+.*?\bper(?:g|gi|gui)u?nt/i.test(lower) ||
    /\b(?:quando|sempre\s+que|toda\s+vez\s+que)\s+.*?\bper(?:g|gi|gui)u?nt/i.test(lower) ||
    /\b(?:voc[eê]\s+(?:deve|precisa|tem\s+que)|sempre\s+verifique|favor\s+verificar|verifique\s+se|n[aã]o\s+(?:responda|diga|fale|mande)|responda\s+que|oriente\s+que)\b/i.test(lower) ||
    /\b(informa[cç][aã]o\s+correta|o\s+correto\s+[eé]|nova\s+regra|regra\s+(?:geral|[eé])|aprenda\s+que|anote\s+(?:a[ií]|isso)|grave\s+que|lembre\s+que|hor[aá]rio\s+mudou|mudou\s+para|n[aã]o\s+diga\s+que|nunca\s+diga\s+que|n[aã]o\s+informe\s+que|retifique|corre[cç][aã]o:)\b/i.test(lower) ||
    // Orientações sobre checkout vs in-stay
    /\b(?:link\s+de\s+confirma[cç][aã]o\s+de\s+check-?out|informa[cç][oõ]es\s+sobre\s+o\s+check-?out|perguntando\s+se\s+quer\s+estender|refor[cç]ar\s+t(?:am)?b(?:[eé]m)?\s+que\s+o\s+check-?out|confirmando\s+se\s+a\s+pessoa\s+j[aá]\s+saiu)\b/i.test(lower) ||
    // Sofia sendo chamada com diretriz ou correção
    (/^sofia\s*[,:]/i.test(lower) && !/^(?:sofia\s*[,:]\s*)?(?:qual|quanto|tem|como|onde|posso|voc[eê]s?\s+t[eê]m|aceita)\s+(?:a\s+senha|o\s+wi-?fi|o\s+hor[aá]rio|o\s+valor|a\s+di[aá]ria|vaga|garagem|caf[eé]|pet|ferro)/i.test(lower)) ||
    (/\b(?:para\s+o\s+flat|no\s+flat|sobre\s+o\s+flat)\s+(\d{2,4})\b/i.test(lower) && /\b(informa[cç][aã]o|corret|regra|senha|mudou)\b/i.test(lower))
  );

  if (isDirectDevCoaching) {
    const flatMatch = text.match(/\b(?:flat|apto|apartamento|quarto)\s*(\d{2,4})\b/i);
    const targetFlat = flatMatch ? flatMatch[1] : null;

    const cleanText = cleanDeveloperPreamble(text);

    let category = "geral";
    // Ordem de precedência: checkout deve vir antes de checkin para mensagens como "meu check-out é hoje, não mande link de check-in" ou "quem já está hospedado não precisa de link de check-in"
    if (/(?:check[- ]?out|sa[ií]da|desocup|estender|prorroga|late\s+check[- ]?out)/i.test(lower) ||
        (/(?:hospedad[ao]|em\s+estadia)/i.test(lower) && /(?:check[- ]?in|pr[eé][- ]?check[- ]?in|link)/i.test(lower))) {
      category = "checkout";
    } else if (/(?:sauda[cç][aã]o|perguntar\s+assim|tornar\s+a\s+estadia|n[aã]o\s+assumir|racioc[ií]nio)/i.test(lower) ||
               (/(?:hospedad[ao]|esteja\s+hospedad[ao])/i.test(lower) && /(?:sauda[cç][aã]o|bom\s+dia|ol[aá]|pergunt)/i.test(lower))) {
      category = "saudacao";
    } else if (/(?:malas?|bagag)/i.test(lower)) category = "malas";
    else if (/reserva|estadia|h[oó]spede\s+com\s+reserva/i.test(lower)) category = "reserva";
    else if (/caf[eé]|desjejum/i.test(lower)) category = "cafe";
    else if (/check[- ]?in|entrada/i.test(lower)) category = "checkin";
    else if (/wi-?fi|internet|senha/i.test(lower)) category = "wifi";
    else if (/garagem|estacionamento|vaga|carro/i.test(lower)) category = "garagem";
    else if (/pet|cachorro|animal/i.test(lower)) category = "pet";
    else if (targetFlat) category = `flat_${targetFlat}`;

    const synthesizedRule = synthesizeGuidelineFromText(cleanText, category);
    const sampleResponse = generateSampleGuestResponse({
      category,
      ruleText: synthesizedRule,
      targetFlat
    });

    return {
      type: "factual_coaching",
      guideline: {
        text: synthesizedRule,
        category,
        targetFlat,
        rawInput: text,
        sample: sampleResponse,
        sampleResponse
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
 * Destila o par (Dúvida do Hóspede + Resposta do Operador) em uma diretriz conceitual
 * permanente para a base de conhecimento vivo da IA ("Anti-Copia-e-Cola")
 */
export function distillGuidelineFromOperatorResponse({ question = "", response = "", category = "geral", targetFlat = null }) {
  const qClean = String(question || "").trim();
  const rClean = String(response || "").trim();
  const qLower = qClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rLower = rClean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Extrai o núcleo da resposta removendo saudações e cortesias preliminares ("olá", "bom dia", "oi", etc.)
  const rCore = rLower
    .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem\??|opa)[,!.:;*\s]*/i, "")
    .trim();

  const isAffirmative = /^(?:sim|com certeza|claro|pode|consegue|tem|temos|positivo|perfeito|liberado|dispon[ií]vel|aceita|aceitamos|isso|exato|correto)\b/i.test(rCore);
  const isNegative = /^(?:n[aã]o|infelizmente n[aã]o|n[aã]o pode|n[aã]o permitimos|proibido|n[aã]o temos|negativo|imposs[ií]vel)\b/i.test(rCore);

  let synthesizedGuideline = "";
  let sampleResponse = "";
  let finalCategory = category || "geral";

  // 1. Extensão de estadia / prorrogação de reserva (WhatsApp ou geral)
  if (/(?:estender|prorroga|prolongar|mais\s+di[aá]rias?|ficar\s+mais)/i.test(qLower)) {
    finalCategory = "checkout";
    if (!isNegative) {
      synthesizedGuideline = "É possível estender e prorrogar a reserva de flat diretamente pelo WhatsApp com a equipe, mediante disponibilidade do flat.";
      sampleResponse = "Olá! Sim, é possível estender a sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! ✨ Para verificarmos a extensão, por favor me informe até que data gostaria de ficar.";
    } else {
      synthesizedGuideline = "Não é possível prorrogar a reserva diretamente para este período devido à indisponibilidade de vagas no flat.";
      sampleResponse = "Olá! No momento não é possível estender a estadia diretamente por aqui devido à ocupação do flat. Qualquer dúvida, estou à disposição!";
    }
  }
  // 2. Horário de check-out / saída
  else if (/(?:check[- ]?out|sa[ií]da|desocup)/i.test(qLower) && /(?:hor[aá]rio|horas?|quando|limite)/i.test(qLower)) {
    finalCategory = "checkout";
    const timeMatch = rClean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)?(?:\s*\d{1,2}(?::\d{2})?(?:h)?)?)\b/i);
    const timeStr = timeMatch ? timeMatch[0] : "12:00h";
    synthesizedGuideline = `O horário de check-out é até as ${timeStr}.`;
    sampleResponse = `Olá! O horário de check-out deve ser realizado até as ${timeStr}. Basta deixar os cartões-chave na recepção/portaria ao sair! 🕛👋`;
  }
  // 3. Horário de check-in / entrada
  else if (/(?:check[- ]?in|entrada|chegada)/i.test(qLower) && /(?:hor[aá]rio|horas?|quando|limite)/i.test(qLower)) {
    finalCategory = "checkin";
    const timeMatch = rClean.match(/\b(\d{1,2}(?::\d{2})?\s*(?:h|as|às|a|-)?(?:\s*\d{1,2}(?::\d{2})?(?:h)?)?)\b/i);
    const timeStr = timeMatch ? timeMatch[0] : "14:00h";
    synthesizedGuideline = `O horário de check-in inicia a partir das ${timeStr}.`;
    sampleResponse = `Olá! O horário de check-in inicia a partir das ${timeStr}. Se chegar antes, faremos o possível para liberar o flat conforme a disponibilidade! 🔑🛎️`;
  }
  // 4. Micro-ondas e cozinha
  else if (/micro[- ]?ondas/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Todos os nossos flats dispõem de forno micro-ondas e frigobar para total comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, todos os nossos flats dispõem de micro-ondas, frigobar e cozinha compacta equipada! 🍽️⚡";
    } else {
      synthesizedGuideline = "Os flats não dispõem de micro-ondas.";
      sampleResponse = "Olá! Informamos que os flats não dispõem de micro-ondas.";
    }
  }
  // 5. Frigobar / Geladeira
  else if (/frigobar|geladeira|congelador/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Todos os flats contam com frigobar privativo ligado para uso dos hóspedes.";
      sampleResponse = "Olá! Sim, todos os flats contam com frigobar privativo limpo e ligado para sua comodidade! 🧊";
    }
  }
  // 6. Ferro de passar / tábua
  else if (/ferro|passar\s+roupa|t[aá]bua/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Disponibilizamos ferro de passar roupa nos flats para comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, disponibilizamos ferro de passar roupa nos flats para seu uso durante a estadia! 👔✨";
    }
  }
  // 7. Voltagem / tomadas
  else if (/voltagem|110|220|127|tomada/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    const volt = /220/i.test(rLower) ? "220V" : "127V (110V)";
    synthesizedGuideline = `A voltagem padrão em todos os flats é ${volt}.`;
    sampleResponse = `Olá! A voltagem padrão em todos os nossos flats é ${volt}. 🔌⚡`;
  }
  // 8. Pet / Animais
  else if (/pet|cachorro|animal|gato/i.test(qLower)) {
    finalCategory = "pet";
    if (!isNegative) {
      synthesizedGuideline = "Aceitamos pets de pequeno porte mediante taxa única e cumprimento das normas condominiais.";
      sampleResponse = "Olá! Sim, aceitamos pets de pequeno porte com todo carinho (máximo 1 pet por flat, mediante taxa única)! 🐾✨";
    } else {
      synthesizedGuideline = "Não é permitida a estadia de animais de estimação nos flats.";
      sampleResponse = "Olá! Informamos que não é permitida a estadia de animais de estimação nas acomodações. 🛑🐾";
    }
  }
  // 9. Vaga de garagem / Estacionamento
  else if (/garagem|estacionamento|vaga|carro|ve[ií]culo/i.test(qLower)) {
    finalCategory = "garagem";
    if (!isNegative) {
      synthesizedGuideline = "Dispomos de 1 vaga de garagem rotativa coberta e gratuita por flat no condomínio Soho.";
      sampleResponse = "Olá! Sim, dispomos de 1 vaga de garagem rotativa gratuita por flat no condomínio Soho! 🚗";
    } else {
      synthesizedGuideline = "Não dispomos de vaga de garagem inclusa nesta acomodação.";
      sampleResponse = "Olá! Informamos que esta acomodação não dispõe de vaga de garagem inclusa.";
    }
  }
  // 10. Wi-Fi / Internet
  else if (/wi-?fi|internet|senha/i.test(qLower)) {
    finalCategory = "wifi";
    synthesizedGuideline = "O Wi-Fi é individual e de alta velocidade em cada acomodação.";
    sampleResponse = "Olá! O Wi-Fi é individual e de alta velocidade no flat! A rede é o número do apartamento e a senha padrão é 1234567890123. 📶";
  }
  // 11. Café da manhã
  else if (/caf[eé]|desjejum/i.test(qLower)) {
    finalCategory = "cafe";
    if (!isNegative) {
      synthesizedGuideline = "O café da manhã é servido em deliciosa bandeja personalizada diretamente no quarto, mediante agendamento até a véspera pelo portal do hóspede.";
      sampleResponse = "Olá! 🥐☕ O café da manhã é servido em bandeja diretamente no seu quarto das 05:00 às 09:30, com agendamento prévio pelo Portal do Hóspede!";
    }
  }
  // 12. Piscina / Academia / Lazer / Jacuzzi / Cobertura
  else if (/piscina|academia|jacuzzi|cobertura|lazer|hidro/i.test(qLower)) {
    finalCategory = "lazer";
    if (!isNegative) {
      synthesizedGuideline = "A piscina aquecida/jacuzzi e academia na cobertura funcionam diariamente das 06:00 às 22:00 para os hóspedes.";
      sampleResponse = "Olá! Sim, dispomos de piscina/jacuzzi aquecida e academia na cobertura, abertas diariamente das 06:00 às 22:00 para os hóspedes! 🏊‍♂️✨";
    } else {
      synthesizedGuideline = "A área de lazer e piscina encontra-se temporariamente em manutenção.";
      sampleResponse = "Olá! Informamos que a área de lazer está temporariamente indisponível para manutenção.";
    }
  }
  // 13. Fumo / Cigarro / Proibições
  else if (/fumo|fumar|cigarro|fumante/i.test(qLower)) {
    finalCategory = "regras";
    synthesizedGuideline = "É estritamente proibido fumar dentro dos flats e áreas fechadas do condomínio (ambiente 100% livre de fumo).";
    sampleResponse = "Olá! Informamos que nossas acomodações são 100% livres de fumo, sendo estritamente proibido fumar dentro dos apartamentos e áreas comuns. 🚭";
  }
  // 14. Berço / Bebê / Cama extra
  else if (/ber[cç]o|beb[eê]|crian[cç]a\s+de\s+colo|cama\s+extra/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Disponibilizamos berço para bebês mediante solicitação prévia à recepção para acomodação no flat.";
      sampleResponse = "Olá! Sim, disponibilizamos berço para seu bebê com todo carinho! Basta nos avisar com antecedência para prepararmos no flat para você. 👶✨";
    } else {
      synthesizedGuideline = "Não dispomos de berço para bebê nesta acomodação.";
      sampleResponse = "Olá! Informamos que não dispomos de berço para bebês nas acomodações no momento.";
    }
  }
  // 15. Secador de cabelo
  else if (/secador(?:\s+de\s+cabelo)?/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Dispomos de secador de cabelo nos flats para comodidade dos hóspedes.";
      sampleResponse = "Olá! Sim, disponibilizamos secador de cabelo no flat para seu conforto durante a estadia! 💇‍♀️✨";
    } else {
      synthesizedGuideline = "Os flats não dispõem de secador de cabelo.";
      sampleResponse = "Olá! Informamos que não dispomos de secador de cabelo nas acomodações.";
    }
  }
  // 16. Roupa de cama / Toalhas / Enxoval
  else if (/toalha|roupa\s+de\s+cama|len[cç]ol|enxoval|cobertor|travesseiro/i.test(qLower)) {
    finalCategory = "estrutura_flat";
    if (!isNegative) {
      synthesizedGuideline = "Fornecemos enxoval hoteleiro completo com roupas de cama, travesseiros e toalhas de banho limpas em todas as estadias.";
      sampleResponse = "Olá! Sim, todos os nossos flats contam com enxoval hoteleiro completo: roupas de cama limpas, travesseiros e toalhas higienizadas para sua chegada! 🛏️✨";
    }
  }
  // 17. Regra Geral / Fallback Dinâmico
  else {
    if (rClean.length >= 25 && !isAffirmative && !isNegative) {
      synthesizedGuideline = synthesizeGuidelineFromText(rClean, finalCategory);
      sampleResponse = `Olá! ${rClean}`;
    } else if (isAffirmative) {
      const cleanedQuestionTheme = qClean
        .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;*\s]*/i, "")
        .replace(/^(?:voc[eê]s?\s+)?(?:consigo|posso|tem|temos|possui|possuem|aceita|aceitam|d[aá]\s+para|d[aá]\s+pra|existe|existem|fornece|fornecem|oferece|oferecem)\s+/i, "")
        .replace(/\?+$/, "")
        .trim();
      synthesizedGuideline = `É confirmado e disponível para os hóspedes: ${cleanedQuestionTheme}.`;
      sampleResponse = `Olá! Sim, temos ${cleanedQuestionTheme} disponível para sua comodidade! ✨`;
    } else if (isNegative) {
      const cleanedQuestionTheme = qClean
        .replace(/^(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[,!.:;*\s]*/i, "")
        .replace(/^(?:voc[eê]s?\s+)?(?:consigo|posso|tem|temos|possui|possuem|aceita|aceitam|d[aá]\s+para|d[aá]\s+pra|existe|existem|fornece|fornecem|oferece|oferecem)\s+/i, "")
        .replace(/\?+$/, "")
        .trim();
      if (/^(?:fumar|festa|barulho|levar|fazer|colocar)/i.test(cleanedQuestionTheme)) {
        synthesizedGuideline = `Não é permitido aos hóspedes: ${cleanedQuestionTheme}.`;
        sampleResponse = `Olá! Informamos que não é permitido ${cleanedQuestionTheme} nas dependências do flat.`;
      } else {
        synthesizedGuideline = `Não é disponibilizado nem fornecido aos hóspedes: ${cleanedQuestionTheme}.`;
        sampleResponse = `Olá! Informamos que não dispomos de ${cleanedQuestionTheme} no momento.`;
      }
    } else {
      synthesizedGuideline = synthesizeGuidelineFromText(rClean, finalCategory);
      sampleResponse = `Olá! ${rClean}`;
    }
  }

  return {
    guidelineText: synthesizedGuideline,
    category: finalCategory,
    sampleResponse,
    targetFlat
  };
}

/**
 * Gera um exemplo de resposta REALISTA e PROFISSIONAL da Sofia a um hóspede no WhatsApp
 * sem repetir meta-conversas internas, saudações de teste ou texto do desenvolvedor
 */
export function generateSampleGuestResponse({ category = "geral", ruleText = "", targetFlat = null }) {
  const lowerRule = (ruleText || "").toLowerCase();
  if (category === "checkout" || (category === "geral" && (lowerRule.includes("check-out") || lowerRule.includes("checkout") || lowerRule.includes("saída") || lowerRule.includes("saida")))) {
    return "Olá! Lembramos que hoje é o dia do seu check-out, com horário limite até às 12:00h. Deseja estender sua estadia ou solicitar late check-out? Caso já tenha desocupado o flat, basta nos avisar por aqui. Estamos à disposição! 🏨✨";
  }
  if (category === "saudacao" || (category === "geral" && (lowerRule.includes("saudar") || lowerRule.includes("saudação") || lowerRule.includes("hospedada")))) {
    return "Olá! Vi que você tem uma estadia confirmada a partir de 12/10 no Flat 712. Como posso te ajudar na preparação da sua chegada hoje? 🏨✨";
  }
  if (category === "reserva" || (category === "geral" && lowerRule.includes("reserva"))) {
    return "Olá! Sim, sua reserva está confirmada! 🏨✨\n• Flat: 605\n• Entrada: 15/10 a partir das 14:00h\n• Saída: 18/10 até as 12:00h\n• Status: Confirmada\n(Se não houver reserva ativa ou futura vinculada ao número, informo com cortesia e solicito o nome do titular ou código da reserva).";
  }
  if (category === "cafe" || (category === "geral" && (lowerRule.includes("café") || lowerRule.includes("cafe")))) {
    return "Olá! O café da manhã é servido exclusivamente em bandeja personalizada diretamente no seu flat. Qualquer dúvida sobre a escolha dos itens pelo portal, conte conosco! ☕✨";
  }
  if (category === "wifi" || (category === "geral" && (lowerRule.includes("wi-fi") || lowerRule.includes("wifi")))) {
    return "Olá! Cada apartamento conta com rede Wi-Fi individualizada no formato apto {número do flat}, com senha '1234567890123'. Tenha uma excelente conexão! 📶✨";
  }
  if (category === "garagem" || (category === "geral" && (lowerRule.includes("garagem") || lowerRule.includes("estacionamento")))) {
    return "Olá! Dispomos de garagem rotativa gratuita no condomínio. Lembre-se de cadastrar a placa do seu veículo no portal para liberação na portaria! 🚗✨";
  }
  if (category === "pet" || (category === "geral" && lowerRule.includes("pet"))) {
    return "Olá! Aceitamos com carinho cães de até 10kg com taxa adicional por diária. Se precisar de orientações para a hospedagem do seu pet, estou à disposição! 🐾✨";
  }
  if (targetFlat) {
    return `Olá! Sobre o Flat ${targetFlat}: informamos que dispõe de todas as comodidades para sua estadia. Se precisar de algo, conte conosco! 🔑✨`;
  }
  return "Olá! Estamos à inteira disposição para apoiar você em sua estadia na CorpFlats. Conte conosco para qualquer dúvida ou solicitação! 🏨✨";
}

/**
 * Sintetiza o treinamento do desenvolvedor via IA (Gemini) extraindo a regra abstrata e amostra realista
 */
export async function synthesizeDeveloperCoachingWithAi({
  rawText,
  category = "geral",
  targetFlat = null,
  apiKey,
  db = null
}) {
  if (!apiKey || !rawText) return null;

  const systemInstruction = `Você é o assistente sênior de calibração do sistema hoteleiro CorpFlats no Edifício Soho Residence Service.
O desenvolvedor ou gestor do sistema (Miller) enviou uma orientação/crítica de treinamento informal pelo WhatsApp:
"${rawText}"

Sua missão é sintetizar essa instrução de forma conceitual, profissional e não-literal ("Anti-Papagaio"):
1. "ruleText": Diretriz operacional formal e limpa em terceira pessoa para a base de conhecimento da Sofia (concierge virtual).
   - NUNCA inclua meta-conversa ou termos de teste (PROIBIDO usar "estou testando", "sou Miller", "você errou", "segundo o teste", etc.).
   - Deve ser uma diretriz abstrata de alto nível da operação.
   - Exemplo para checkout: "Para hóspedes já hospedados ou em dia de check-out, priorizar procedimentos de check-out (horário limite até 12:00h) e verificar se o hóspede deseja estender a estadia ou se já desocupou o flat, sem envio de link de pré-check-in."
2. "sampleResponse": Amostra REALISTA e PRÁTICA de resposta direta da Sofia a um HÓSPEDE no WhatsApp sob essa regra.
   - Deve ser um atendimento acolhedor e impecável ao hóspede ("Olá! ...").
   - NUNCA use frases internas ou diga "Conforme nossa política atualizada: Estou testando...".
3. "category": Categoria da diretriz (ex: "checkout", "checkin", "reserva", "cafe", "saudacao", "garagem", "wifi", "pet", "geral").

Retorne EXCLUSIVAMENTE um objeto JSON no formato:
{
  "ruleText": "...",
  "sampleResponse": "...",
  "category": "..."
}`;

  try {
    const res = await callGeminiAi({
      apiKey,
      systemInstruction,
      prompt: `Sintetize a instrução recebida: "${rawText}"`,
      db,
      customPrompt: true
    });

    if (res?.ok && res?.text) {
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed?.ruleText && parsed?.sampleResponse) {
          const parrotCheck = /estou testando|sou miller|n[aã]o deveria ter mandado/i;
          if (!parrotCheck.test(parsed.ruleText) && !parrotCheck.test(parsed.sampleResponse)) {
            return {
              ruleText: String(parsed.ruleText).trim(),
              sampleResponse: String(parsed.sampleResponse).trim(),
              category: parsed.category || category
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn("[synthesizeDeveloperCoachingWithAi] Fallback para sintetizador heurístico:", err.message);
  }
  return null;
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

  const rawText = String(guidelineData.text || "").trim();
  const cat = guidelineData.category || inferFaqCategory(rawText) || "geral";
  const isPreFormulated = guidelineData.synthesized ||
    guidelineData.source === "operator_response" ||
    guidelineData.source === "faq_approval" ||
    Boolean(guidelineData.question) ||
    /^(?:é\s+poss[ií]vel|o\s+hor[aá]rio|todos\s+os|dispomos|aceitamos|n[aã]o\s+[eé]\s+permitid|n[aã]o\s+dispomos|fornecemos|a\s+voltagem)/i.test(rawText);
  const synthesizedText = isPreFormulated
    ? rawText
    : synthesizeGuidelineFromText(rawText, cat);
  const sample = guidelineData.sample || guidelineData.sampleResponse || generateSampleGuestResponse({
    category: cat,
    ruleText: synthesizedText,
    targetFlat: guidelineData.targetFlat || null
  });

  // Se id fornecido, atualiza diretriz existente
  if (guidelineData.id) {
    const existingIndex = db.whatsappAiSettings.developerGuidelines.findIndex(g => g.id === guidelineData.id);
    if (existingIndex >= 0) {
      const existing = db.whatsappAiSettings.developerGuidelines[existingIndex];
      const updated = {
        ...existing,
        text: synthesizedText,
        category: cat,
        targetFlat: guidelineData.targetFlat !== undefined ? guidelineData.targetFlat : existing.targetFlat,
        sample,
        sampleResponse: sample,
        question: guidelineData.question !== undefined ? guidelineData.question : existing.question,
        operatorText: guidelineData.operatorText !== undefined ? guidelineData.operatorText : existing.operatorText,
        active: guidelineData.active !== undefined ? Boolean(guidelineData.active) : existing.active,
        updatedAt: new Date().toISOString(),
        source: guidelineData.source || existing.source
      };
      db.whatsappAiSettings.developerGuidelines[existingIndex] = updated;
      return updated;
    }
  }

  // Deduplicação inteligente para evitar diretrizes repetidas para a mesma pergunta ou fato
  const matchIndex = db.whatsappAiSettings.developerGuidelines.findIndex(g => {
    if (guidelineData.question && g.question && g.question.trim().toLowerCase() === guidelineData.question.trim().toLowerCase()) return true;
    if (g.text && g.text.trim().toLowerCase() === synthesizedText.trim().toLowerCase()) return true;
    return false;
  });
  if (matchIndex >= 0) {
    const existing = db.whatsappAiSettings.developerGuidelines[matchIndex];
    const updated = {
      ...existing,
      text: synthesizedText,
      category: cat,
      sample,
      sampleResponse: sample,
      question: guidelineData.question || existing.question,
      operatorText: guidelineData.operatorText || existing.operatorText,
      active: guidelineData.active !== undefined ? Boolean(guidelineData.active) : true,
      updatedAt: new Date().toISOString()
    };
    db.whatsappAiSettings.developerGuidelines[matchIndex] = updated;
    return updated;
  }

  const newGuideline = {
    id: guidelineData.id || `guideline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text: synthesizedText,
    category: cat,
    targetFlat: guidelineData.targetFlat || null,
    sample,
    sampleResponse: sample,
    question: guidelineData.question || null,
    operatorText: guidelineData.operatorText || null,
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

  const sample = sampleResponse || newGuideline.sampleResponse || newGuideline.sample || generateSampleGuestResponse({
    category: newGuideline.category,
    ruleText: newGuideline.text,
    targetFlat: newGuideline.targetFlat
  });

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
  const antiCopyPasteRule = `\n[REGRA ANTI-COPIA-E-COLA & GERAÇÃO MULTITÓPICO CONTEXTUAL]\n- NUNCA use respostas prontas, engessadas ou cópia-e-cola de mensagens anteriores.\n- Use os fatos e diretrizes aprendidos como base de conhecimento vivo para sintetizar uma resposta inédita, humanizada e personalizada ao contexto do hóspede.\n- Se o hóspede enviar saudações (ex: "bom dia", "boa tarde", "olá"), retribua a saudação cordialmente pelo nome do hóspede.\n- Se a mensagem contiver múltiplas dúvidas juntas (ex: horário de checkout + se pode estender a reserva pelo WhatsApp), responda a TODOS os pontos de forma clara, acolhedora e integrada na mesma mensagem.\n`;

  if (activeGuidelines.length > 0) {
    guidelinesSection = `\n[DIRETRIZES DO DESENVOLVEDOR & REGRAS APRENDIDAS (PRIORIDADE MÁXIMA)]\nAs seguintes instruções foram ensinadas pelo gestor/desenvolvedor e POSSUEM PRIORIDADE ABSOLUTA sobre regras gerais anteriores:\n${activeGuidelines.map(g => `• [${g.category || "geral"}${g.targetFlat ? ` | Flat ${g.targetFlat}` : ""}] ${g.text}`).join("\n")}\n${antiCopyPasteRule}`;
  } else {
    guidelinesSection = antiCopyPasteRule;
  }

  let flatsCatalogSection = "";
  const activeFlats = (db?.flats || []).filter(f => f.isActive !== false);
  if (activeFlats.length > 0) {
    const flatsDesc = activeFlats.map(f => {
      const info = getFlatAmenitiesInfo(f);
      return `• Flat ${f.number}: Cama: ${info.bedLabel} | Ar: ${info.airConditionerLabel} | Micro-ondas: ${info.hasMicrowave ? "Sim" : "Não"}${info.tags.length ? ` | Tags: [${info.tags.join(", ")}]` : ""}${f.notes ? ` | Obs: ${f.notes}` : ""}`;
    }).join("\n");
    flatsCatalogSection = `\n[CATÁLOGO DE FLATS, TAGS E PARTICULARIDADES DOS QUARTOS (CORPFLATS)]\n${flatsDesc}\n- Sofia tem conhecimento pleno das particularidades de cada flat (ar split vs janela, micro-ondas, cama de casal vs solteiro) para responder com precisão ao hóspede ou filtrar flats ideais.\n`;
  }

  return { toneSection, guidelinesSection, flatsCatalogSection };
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
 * Detecta se a mensagem é uma consulta de disponibilidade de quartos/vagas de hospedagem
 */
export function isAvailabilityInquiry(text = "") {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();
  const mentionsGarage = /\b(?:garagem|estacionamento|carro|ve[ií]culo|placa)\b/i.test(lower);
  if (mentionsGarage) return false;

  return (
    /\b(?:disponibilidade|dispon[ií]vel|vagas?|quarto\s+vago|tem\s+vaga)\b/i.test(lower) ||
    /\b(?:tem|teria|h[aá]|possuem)\s+(?:algum\s+)?(?:quarto|flat|apartamento|vaga)\b/i.test(lower)
  );
}

/**
 * Detecta se a mensagem é uma consulta de cotação, tarifas, diárias ou valores
 */
export function isPricingOrQuoteInquiry(text = "") {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase().trim();

  // Expressões explícitas de cotação / preço / diária / orçamento ou disponibilidade de vagas
  return (
    /\b(?:quanto\s+(?:t[aá]|custa|[eé]|fica|sai)|qual\s+(?:o\s+)?(?:valor|pre[cç]o)|saber\s+(?:o\s+)?(?:valor|pre[cç]o|tarifa))\b/i.test(lower) ||
    /\b(?:pre[cç]o|valor|valores|pre[cç]os|tarifa|tarifas|tabela)\s+(?:de\s+(?:uma\s+)?|da[s]?\s+|do\s+)?(?:di[aá]rias?|flat|quarto|hospedagem|estadia|reserva|per[ií]odo|caf[eé])\b/i.test(lower) ||
    /\b(?:di[aá]rias?|hospedagem|estadia)\s+(?:com\s+caf[eé]|sem\s+caf[eé]|para\s+\d+\s+pesso|para\s+casal|individual|solteiro)\b/i.test(lower) ||
    /\b(?:or[cç]amento|cota[cç][aã]o|cotar)\b/i.test(lower) ||
    /\bdi[aá]rias?\b/i.test(lower) ||
    /\b(?:nova\s+reserva|fazer\s+reserva|quero\s+reservar|reservar\s+quarto|alugar\s+flat)\b/i.test(lower) ||
    isAvailabilityInquiry(text)
  );
}

/**
 * Identifica se a FAQ é puramente operacional/logística de café da manhã ou governança sem relação com valores/preços
 */
export function isOperationalNonPricingFaq(faq) {
  if (!faq) return false;
  const id = String(faq.id || "").toLowerCase();
  if (id.includes("faq-cafe-quarto") || id.includes("faq-recolhimento-loucas") || id.includes("faq-loucas")) {
    return true;
  }
  const q = String(faq.question || "").toLowerCase();
  const cat = String(faq.category || "").toLowerCase();
  if ((cat === "cafe" || cat === "cafe_manha" || cat === "cafe_quarto") &&
      !q.includes("valor") && !q.includes("preço") && !q.includes("preco") && !q.includes("quanto") && !q.includes("diária") && !q.includes("diaria")) {
    return true;
  }
  return false;
}

/**
 * Analisador Semântico de Intenção do Hóspede:
 * Opera na classificação precisa entre as DUAS VIAS e suas categorias:
 * - GREETING_ONLY: Saudação pura sem solicitação de informação
 * - PRICING_QUOTE: Consulta de valores, diárias e cotações (VIA 2 - Leitura do Sistema)
 * - EXISTING_RESERVATION: Consulta de reserva existente (VIA 2 - Leitura do Sistema)
 * - FLAT_READY_STATUS: Consulta de status e prontidão do flat (VIA 2 - Leitura do Sistema)
 * - OPERATIONAL_DEMAND: Solicitações operacionais sem acesso autônomo (Gera Demanda Não Atendida)
 * - GENERIC_FAQ: Perguntas institucionais da base/FAQ (VIA 1 - FAQ e Conhecimento)
 * - UNKNOWN_INQUIRY: Dúvida não mapeada (Gera Demanda e FAQ pendente)
 */
export function analyzeGuestQuery(rawText = "", guestContext = null, db = null) {
  const text = String(rawText || "").trim();
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Saudação Pura
  const GREETING_WORDS = "(?:oi|ola|opa|ei|hello|hi|bom\\s+dia|boa\\s+tarde|boa\\s+noite)";
  const COURTESY_WORDS = "(?:tudo\\s+bem|tudo\\s+bom|como\\s+vai|como\\s+esta|beleza|tudo\\s+certo)";
  const NAME_WORDS = "(?:sofia|corpflats|atendente|recepcao)";
  const isGreetingOnly =
    new RegExp(`^(?:(?:${GREETING_WORDS}|${COURTESY_WORDS}|${NAME_WORDS})\\s*[,.]?\\s*)+[!?\\s]*$`, "i").test(lower) ||
    /^(?:ok|obrigad[oa]|valeu|show|beleza|perfeito|entendi|combinado|certo|t[aá]\s+bom|blz|agrade[cç]o|sim|n[aã]o|positivo)[.!?\s]*$/i.test(text);

  if (isGreetingOnly) {
    return {
      type: "GREETING_ONLY",
      primaryTopic: "saudacao",
      rawText: text
    };
  }

  // 2. Preços, Tarifas, Diárias, Disponibilidade e Cotações (VIA 2 - Leitura do Sistema)
  if (isPricingOrQuoteInquiry(text)) {
    return {
      type: "PRICING_QUOTE",
      primaryTopic: "cotacao_precos",
      rawText: text
    };
  }

  // 3. Status de Reserva Existente / Confirmação (VIA 2 - Leitura do Sistema)
  const isResInquiry = (
    /(?:minhas?\s+reservas?|minhas?\s+di[aá]rias?|minha\s+estadia)/i.test(text) ||
    /(?:reserva|estadia).*(?:confirmad[ao]|aprovad[ao]|status|certo|ok|garantid[ao]|ativa)/i.test(text) ||
    /(?:confirmad[ao]|status|certo|ok).*(?:reserva|estadia)/i.test(text) ||
    /(?:tenho|tem|existe|possui)\s+(?:alguma\s+)?reserva/i.test(text) ||
    /(?:verificar|consultar|conferir|confirmar|saber)\s+(?:minha\s+|se\s+tenho\s+|a\s+)?reserva/i.test(text) ||
    /^(?:est[aá]|t[aá])\s+confirmad[ao]\??$/i.test(text) ||
    /\b(?:res-\d+|cf-\d+)\b/i.test(text)
  );

  if (isResInquiry) {
    return {
      type: "EXISTING_RESERVATION",
      primaryTopic: "consulta_reserva",
      rawText: text
    };
  }

  // 4. Demanda Operacional Sem Acesso Autônomo (Ações, Trocas, Manutenção, Chamados, Comunicação de Check-out)
  const demandClassification = classifyUnmetDemand(text);
  if (demandClassification && demandClassification.category !== "outros" && demandClassification.category !== "operacoes_sistema_pausadas") {
    return {
      type: "OPERATIONAL_DEMAND",
      primaryTopic: demandClassification.category,
      demandClassification,
      rawText: text
    };
  }

  // 5. Status de Higienização / Quarto Liberado / Entrada Antecipada (VIA 2 - Leitura do Sistema)
  const isFlatStatusInquiry = (
    /(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)/i.test(text) ||
    /(?:pront|liberad).*(?:quarto|flat|apartamento)/i.test(text) ||
    /posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)
  ) && !/check[- ]?out|sa[ií]da|desocup|deix|entreg|devolv|indo\s+embora/i.test(text);

  if (isFlatStatusInquiry) {
    return {
      type: "FLAT_READY_STATUS",
      primaryTopic: "status_quarto",
      rawText: text
    };
  }

  // 6. Perguntas Institucionais / FAQ Genérico (VIA 1 - FAQ & Conhecimento)
  const isGenericFaqMatch = (
    /wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text) ||
    /caf[eé]|desjejum/i.test(text) ||
    /garagem|estacionamento|carro/i.test(text) ||
    /endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar/i.test(text) ||
    /check-?in|entrada|hor[aá]rio\s+de\s+entrada|chegada/i.test(text) ||
    /check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da/i.test(text) ||
    /pet|cachorro|animal/i.test(text) ||
    /piscina|jacuzzi|academia|cobertura|lazer/i.test(text) ||
    /fumo|fumar|cigarro/i.test(text) ||
    /micro[- ]ondas|frigobar|cafeteira|cooktop|fog[aã]o|cozinha|utens[ií]lio|smart\s*tv|tv|televis[aã]o|cama|enxoval|toalha|len[cç]ol|roupa\s+de\s+cama|ar[- ]condicionado|ar\s+split|comodidade/i.test(text)
  );

  if (isGenericFaqMatch) {
    return {
      type: "GENERIC_FAQ",
      primaryTopic: inferFaqCategory(text),
      rawText: text
    };
  }

  // 7. Demanda não mapeada / Dúvida Desconhecida
  return {
    type: isPotentialGuestQuestion(text) ? "UNKNOWN_INQUIRY" : "OTHER",
    primaryTopic: inferFaqCategory(text) || "outros",
    rawText: text
  };
}

export const analyzeGuestIntentSemantic = analyzeGuestQuery;

export function formatCheckoutCommunicationResponse(name = "", guestContext = null) {
  let greetingPart = "";
  if (name && typeof name === "string") {
    if (name.startsWith(" ") || name.startsWith(",")) {
      greetingPart = name;
    } else if (name.trim()) {
      greetingPart = `, ${name.trim()}`;
    }
  }
  const flatStr = guestContext?.flatNumber ? ` do *Flat ${guestContext.flatNumber}*` : "";
  return `Olá${greetingPart}! Muito obrigado por nos avisar! ✨\n\nRegistrei a sua comunicação de check-out${flatStr} em nosso sistema. A nossa equipe de governança e recepção já foi notificada da desocupação da unidade para os procedimentos de liberação e conferência.\n\nAgradecemos imensamente pela sua estadia com a CorpFlats e esperamos ter a alegria de te receber novamente em breve! Tenha uma excelente viagem de retorno! 🏨🗝️`;
}

/**
 * Auto-Crítica Semântica e Validador Pré-Envio:
 * Avalia criticamente a resposta candidata antes de enviar para garantir
 * que ela realmente responde à pergunta feita pelo hóspede, evitando falsos positivos
 * (ex: responder regras de entrega de bandeja quando a pessoa perguntou preço).
 * Se a demanda não possui dados ou capacidade operacional no sistema, registra
 * em db.unmetDemands imediatamente e gera resposta transparente e cordial.
 */
export function validateAndRefineResponse({
  queryText = "",
  candidateText = "",
  guestContext = {},
  db = null,
  aiConfig = DEFAULT_AI_CONFIG,
  saveDatabase = null,
  createNotification = null
}) {
  const analysis = analyzeGuestQuery(queryText, guestContext, db);
  let replyText = candidateText;
  let unmetDemand = null;
  let missingDataOrCapability = false;
  let shouldHandover = false;
  let requiresHandover = false;

  const name = guestContext?.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";
  const toneSettings = db?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings);

  // Regra 1: Validação Crítica de Cotação / Preço vs Regras Operacionais (Ex: Café da Manhã)
  if (analysis.type === "PRICING_QUOTE") {
    const isHandoverMessage = /transferindo|pausad[ao]s|manuten[cç][aã]o|atendimento\s+humano|equipe\s+humana/i.test(replyText);
    const hasPriceIndicator = /\b(?:r\$|\d+,\d{2}|\d+\s*reais)\b/i.test(replyText);
    const hasOnlyBreakfastLogistics = /servido\s+em\s+bandeja|das\s+05:00|portal\s+\/cafe|agendamento\s+at[eé]\s+a\s+v[eé]spera/i.test(replyText) && !hasPriceIndicator;

    // Se o texto candidato NÃO fornece preço ou é apenas sobre a logística da bandeja, E não for um transbordo:
    if (!isHandoverMessage && (!hasPriceIndicator || hasOnlyBreakfastLogistics)) {
      console.log(`[Semantic Critique] Mismatch detectado para query de preço ("${queryText}"). Substituindo resposta por valores oficiais do sistema.`);
      const pricing = handleGetPricingInfo(db, {
        guests: /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(queryText) ? 2 : 1,
        withBreakfast: /\b(?:com\s+caf[eé]|incluso\s+caf[eé])/i.test(queryText)
      });

      const isCouple = /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(queryText);
      const withBreakfast = /\b(?:com\s+caf[eé]|incluso\s+caf[eé])/i.test(queryText);
      const withoutBreakfast = /\b(?:sem\s+caf[eé])/i.test(queryText);

      if (withBreakfast) {
        const rate = isCouple ? pricing.rateWithBreakfastFor2 : pricing.rateWithBreakfastFor1;
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, a diária para *${isCouple ? "2 pessoas (casal)" : "1 pessoa"} com café da manhã* servido no quarto fica a partir de *R$ ${rate},00* (e você ainda conta com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSe preferir a opção sem café, a diária fica a partir de *R$ ${pricing.baseRateWithoutBreakfast},00* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia).\n\nPara quais datas você gostaria da reserva? Me informando a entrada e saída, já verifico a disponibilidade e passo todos os detalhes! 🏨`);
      } else if (withoutBreakfast) {
        const rateWithBf = isCouple ? pricing.rateWithBreakfastFor2 : pricing.rateWithBreakfastFor1;
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, a diária para *${isCouple ? "2 pessoas (casal)" : "1 pessoa"} sem café* fica a partir de *R$ ${pricing.baseRateWithoutBreakfast},00* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia).\n\n• *Opção com café no quarto:* a partir de *R$ ${rateWithBf},00 / diária* (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você deseja a hospedagem? Me informe a data de entrada e saída que consulto a disponibilidade! 🏨`);
      } else {
        replyText = ret(`Olá${name}! ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de:\n\n• *Sem café:* a partir de *R$ ${pricing.baseRateWithoutBreakfast},00 / diária* (+ taxa única de limpeza de R$ ${pricing.cleaningFeeStandard},00 por estadia)\n• *Com café da manhã no quarto:* a partir de *R$ ${pricing.rateWithBreakfastFor1},00 / diária* (1 pessoa) ou *R$ ${pricing.rateWithBreakfastFor2},00 / diária* (casal), com *isenção total da taxa de limpeza*! 🥐☕\n\nQual período você pretende se hospedar e para quantas pessoas? Me informando as datas de entrada e saída, já verifico a disponibilidade em tempo real para você! 🏨`);
      }
    }
  }

  // Regra 2: Demanda Operacional Sem Acesso Autônomo (Missing Operational Capability)
  if (analysis.type === "OPERATIONAL_DEMAND") {
    missingDataOrCapability = true;
    const cat = analysis.demandClassification?.category || inferFaqCategory(queryText);
    const demandTitle = analysis.demandClassification?.demandTitle || UNMET_DEMAND_CATEGORIES[cat]?.title || "Demanda Operacional";

    // Extrai número do flat da mensagem caso não conste no contexto
    const extractedFlat = guestContext?.flatNumber || (queryText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{2,4})\b/i)?.[1]) || null;
    const effectiveContext = extractedFlat && (!guestContext || !guestContext.flatNumber)
      ? { ...(guestContext || {}), flatNumber: extractedFlat }
      : guestContext;

    const botActionsSettings = getBotActionsSettings(db);
    const isCheckoutActionEnabled = botActionsSettings?.apiActionsEnabled !== false && botActionsSettings?.allowedActions?.informCheckout === true;

    if (cat === "checkout_comunicacao" && isCheckoutActionEnabled && db) {
      // Se a ação informCheckout estiver habilitada pelo admin, Sofia atua com autonomia total!
      const actionResult = handleInformCheckout(db, {
        flatNumber: extractedFlat,
        phone: guestContext?.phone,
        guestName: guestContext?.guestName
      });
      if (actionResult && actionResult.success) {
        missingDataOrCapability = false;
        unmetDemand = null;
        if (typeof saveDatabase === "function") {
          try { saveDatabase("bot_action_inform_checkout_auto"); } catch (_) {}
        }
      } else {
        // Se a ação estava habilitada mas o flat não pôde ser identificado
        unmetDemand = detectAndRecordUnmetDemand({
          db,
          text: queryText,
          senderPhone: guestContext?.phone,
          senderName: guestContext?.guestName || "Hóspede",
          guestContext: effectiveContext,
          actionTarget: "informCheckout",
          reason: "capability_missing",
          category: cat,
          demandTitle,
          saveDatabase,
          createNotification
        });
      }
    } else if (db) {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext: effectiveContext,
        actionTarget: cat === "checkout_comunicacao" ? "informCheckout" : null,
        reason: "capability_missing",
        category: cat,
        demandTitle,
        saveDatabase,
        createNotification
      });
    }

    if (cat === "checkout_comunicacao") {
      const checkoutAck = formatCheckoutCommunicationResponse(name, effectiveContext);
      // Se a resposta candidata respondia a outra pergunta (ex: restaurante, malas, táxi, almoço)
      // e não era apenas a instrução padrão de check-out ou fallback genérico, preserva o conteúdo útil!
      const isCheckoutFaqOrFallback = /12:00h|instruções\s+de\s+check-?out|deixe\s+a\s+chave|portaria\s+24h|posso\s+te\s+ajudar\s+com\s+informaç/i.test(replyText) ||
        (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("almoç") && !replyText.includes("restaurante") && !replyText.includes("mala") && !replyText.includes("táxi") && !replyText.includes("uber"));

      if (!isCheckoutFaqOrFallback && replyText.trim().length > 15) {
        replyText = ret(`${checkoutAck}\n\n${replyText.trim()}`);
      } else {
        replyText = ret(checkoutAck);
      }
    } else {
      const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
        (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("registrei") && !replyText.includes("equipe"));
      const alreadyAcknowledged = /registrei|equipe|recep[cç][aã]o|encaminh|atender/i.test(replyText);

      if (isGenericFallback || !alreadyAcknowledged) {
        replyText = ret(`Olá${name}! Recebi sua solicitação sobre *${demandTitle}* 🛎️. Como essa operação requer acompanhamento da nossa equipe, já registrei o seu pedido no sistema para a recepção atender você com máxima atenção! ✨`);
      }
    }
  }

  // Regra 3: Dúvida Desconhecida / Não Mapeada (Unknown Inquiry)
  if (analysis.type === "UNKNOWN_INQUIRY") {
    missingDataOrCapability = true;
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("registrei"));

    if (db) {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: queryText,
        senderPhone: guestContext?.phone,
        senderName: guestContext?.guestName || "Hóspede",
        guestContext,
        actionTarget: null,
        reason: "capability_missing",
        saveDatabase,
        createNotification
      });

      const isDevCaller = isDeveloperPhone(guestContext?.phone, db) &&
        (classifyDeveloperMessage(queryText, db).type !== "guest_simulation");

      if (!isDevCaller) {
        autoCreatePendingFaq({
          db,
          questionText: queryText,
          senderPhone: guestContext?.phone,
          senderName: guestContext?.guestName || "Hóspede",
          saveDatabase,
          createNotification
        });
      }
    }

    if (isGenericFallback) {
      replyText = ret(`Olá${name}! Anotei sua dúvida. Como não tenho essa informação cadastrada no sistema, já registrei sua pergunta para a equipe da recepção te responder por aqui em instantes! 🛎️✨`);
    }
  }

  // Regra 4: Validação de Status do Quarto / Prontidão (VIA 2)
  if (analysis.type === "FLAT_READY_STATUS") {
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("limpo") && !replyText.includes("pronto") && !replyText.includes("governança") && !replyText.includes("quarto"));

    if (isGenericFallback && db) {
      const flatNum = guestContext?.flatNumber || (queryText.match(/\b(?:flat|quarto|apto|apartamento)\s*(\d{2,4})\b/i)?.[1]) || null;
      if (flatNum) {
        const flatStatus = handleGetFlatStatus(db, { flatNumber: flatNum });
        if (flatStatus && flatStatus.success) {
          if (flatStatus.isRoomReady) {
            replyText = ret(`Ótima notícia${name}! 🎉 O seu *Flat ${flatNum}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`);
          } else {
            const cleanDesc = flatStatus.cleaningStatus === "in_progress" ? "em higienização pela equipe de governança" : "sendo preparado pela nossa governança";
            replyText = ret(`Olá${name}! O seu *Flat ${flatNum}* está ${cleanDesc} ✨. O horário oficial de entrada é a partir das 14:00h. Assim que a limpeza for liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`);
          }
        }
      } else {
        replyText = ret(`Olá${name}! Para verificar se o seu apartamento já está pronto e liberado, por favor me informe o *número do seu flat* ou o *nome completo do titular da reserva*! 🛎️🔑`);
      }
    }
  }

  // Regra 5: Validação de Consulta de Reserva Existente (VIA 2)
  if (analysis.type === "EXISTING_RESERVATION") {
    const isGenericFallback = replyText.includes("Posso te ajudar com informações sobre *Wi-Fi") ||
      (replyText.includes("Sou a Sofia, concierge virtual") && !replyText.includes("confirmada") && !replyText.includes("reserva"));

    if (isGenericFallback) {
      if (guestContext?.hasReservation && guestContext?.reservation && guestContext.reservation.status !== "cancelada" && guestContext.reservation.status !== "cancelled") {
        const r = guestContext.reservation;
        const flatStr = r.flatNumber || guestContext.flatNumber || "UH a definir";
        const checkinFmt = r.checkinDate ? formatBrDate(r.checkinDate) : "Data a confirmar";
        const checkoutFmt = r.checkoutDate ? formatBrDate(r.checkoutDate) : "Data a confirmar";
        const paymentStr = (r.paymentStatus === "pago_total" || r.paymentStatus === "pago") ? "Pagamento Quitado" : "Pagamento Pendente";
        const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
        const checkoutUrl = guestContext.checkoutUrl || (r.code ? `${appOrigin}/checkout/${r.code}` : "");

        if (guestContext.stayStatus === "checkout_hoje") {
          const checkoutLinkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nLembramos que *hoje é o dia do seu check-out*, com horário limite de desocupação até as *12:00h*.${checkoutLinkMsg}\n\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! Como posso te ajudar na sua saída hoje? ✨`);
        } else if (guestContext.stayStatus === "em_estadia") {
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nVocê já está acomodado(a) no *Flat ${flatStr}* com estadia prevista até *${checkoutFmt}*. Não é necessário preencher pré-check-in novamente!\n\nSe precisar de toalhas extras, orientações de Wi-Fi, agendamento de café ou qualquer outro suporte durante a sua permanência, estou à sua total disposição! ✨`);
        } else if (guestContext.stayStatus === "checkin_hoje") {
          const linkUrl = r.checkinUrl || guestContext.checkinUrl;
          const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nO seu check-in é *hoje (${checkinFmt})* a partir das 14:00h! Lembramos que para reservas diretas temos o benefício de early check-in a partir das 10h (mediante disponibilidade de higienização pela governança).${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua chegada, estou à total disposição!`);
        } else {
          const linkUrl = r.checkinUrl || guestContext.checkinUrl;
          const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
          replyText = ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nSua estadia está confirmada e programada para início em *${checkinFmt}*! Para agilizar sua liberação na portaria 24h, realize o seu cadastro antecipado:${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua estadia, estou à total disposição!`);
        }
      } else {
        replyText = ret(`Olá${name}! Não localizei nenhuma reserva confirmada para este número de WhatsApp no sistema. Se a reserva foi realizada em outro nome ou plataforma, me informe o *nome completo do titular* ou o *código da reserva* que consulto para você! 🛎️✨`);
      }
    }
  }

  // Regra 6: Blindagem Semântica & Sanitização Temporal Pós-Geração (Zero Pré-Check-in em Checkout/Estadia)
  if (guestContext?.stayStatus === "checkout_hoje" || guestContext?.isCheckoutDay) {
    if (/pr[eé]-?check-?in/i.test(replyText) || /pre-checkin/i.test(replyText)) {
      replyText = replyText
        .replace(/📋\s*\*?Pr[eé]-Check-in(?:\s+Digital)?:\*?\s*\n?(?:👉\s*)?(?:https?:\/\/)?[^\s]*/gi, "")
        .replace(/(?:👉\s*)?(?:https?:\/\/)?[^\s]*pre-?checkin[^\s]*/gi, "")
        .replace(/(?:acesse|fa[cç]a|preencha|link\s+(?:do|de)|realize\s+(?:o\s+)?)\s*(?:o\s+)?(?:nosso\s+)?pr[eé]-?check-?in(?:\s+em|\s+pelo|\s+no|\s+digital)?[^\n.]*[.\n]?/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    const mentionsReservaOrCheckout = /reserva|flat|estadia|quarto|sa[ií]da|checkout|check-out/i.test(queryText) || /reserva|flat|estadia/i.test(replyText);
    const hasCheckoutDetails = /12:00|12h|hor[aá]rio\s+limite/i.test(replyText);
    if (mentionsReservaOrCheckout && !hasCheckoutDetails) {
      const appOrigin = db?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || "https://corpflats.onrender.com";
      const checkoutUrl = guestContext.checkoutUrl || (guestContext?.reservation?.code ? `${appOrigin}/checkout/${guestContext.reservation.code}` : "");
      const checkoutLinkMsg = checkoutUrl && !replyText.includes(checkoutUrl) ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
      replyText += `\n\nLembramos que hoje é o dia do seu check-out, com horário limite de desocupação até as 12:00h.${checkoutLinkMsg}\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! ✨`;
    }
  } else if (guestContext?.stayStatus === "em_estadia" || guestContext?.isHosted) {
    if (/pr[eé]-?check-?in/i.test(replyText) || /pre-checkin/i.test(replyText)) {
      replyText = replyText
        .replace(/📋\s*\*?Pr[eé]-Check-in(?:\s+Digital)?:\*?\s*\n?(?:👉\s*)?(?:https?:\/\/)?[^\s]*/gi, "")
        .replace(/(?:👉\s*)?(?:https?:\/\/)?[^\s]*pre-?checkin[^\s]*/gi, "")
        .replace(/(?:acesse|fa[cç]a|preencha|link\s+(?:do|de)|realize\s+(?:o\s+)?)\s*(?:o\s+)?(?:nosso\s+)?pr[eé]-?check-?in(?:\s+em|\s+pelo|\s+no|\s+digital)?[^\n.]*[.\n]?/gi, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  }

  return {
    replyText,
    analysis,
    unmetDemand,
    missingDataOrCapability,
    shouldHandover,
    requiresHandover
  };
}

/**
 * Retorna a saudação contextual correspondente ao que o hóspede enviou (retribuição cordial de Bom dia / Boa tarde / Boa noite)
 */
export function getGreetingSalutation(messageText, name = "") {
  const lower = String(messageText || "").toLowerCase().trim();
  if (/\bbom\s+dia\b/i.test(lower)) return `Bom dia${name}!`;
  if (/\bboa\s+tarde\b/i.test(lower)) return `Boa tarde${name}!`;
  if (/\bboa\s+noite\b/i.test(lower)) return `Boa noite${name}!`;
  return `Olá${name}!`;
}

/**
 * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
 */
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG, dbOrFaqs = null, dbParam = null) {
  const text = (messageText || "").toLowerCase().trim();
  const kb = aiConfig.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";
  const greetingSalutation = getGreetingSalutation(messageText, name);

  const activeDb = dbParam || (dbOrFaqs && typeof dbOrFaqs === "object" && !Array.isArray(dbOrFaqs) ? dbOrFaqs : (typeof globalThis !== "undefined" ? globalThis.db : null));
  const activeGuidelines = (activeDb?.whatsappAiSettings?.developerGuidelines || []).filter(g => g && g.active !== false);
  const toneSettings = activeDb?.whatsappAiSettings?.toneSettings || aiConfig?.toneSettings || null;
  const ret = (msg) => applyToneFormatting(msg, toneSettings);

  const asksExtension = /(?:estender|prorroga|prolongar|mais\s+di[aá]rias|ficar\s+mais)/i.test(text);
  const asksCheckoutTime = /(?:hor[aá]rio\s+(?:de\s+)?check-?out|que\s+horas\s+(?:é\s+o\s+|tenho\s+que\s+)?sair|hor[aá]rio\s+de\s+sa[ií]da|hor[aá]rio\s+do\s+check-?out|limite\s+de\s+sa[ií]da)/i.test(text);

  // 0.A Comunicação de Check-out pelo Hóspede (Aviso de saída/desocupação)
  const queryAnalysis = analyzeGuestQuery(messageText, guestContext, activeDb);
  if (queryAnalysis.type === "OPERATIONAL_DEMAND" && queryAnalysis.primaryTopic === "checkout_comunicacao") {
    const extractedFlat = guestContext?.flatNumber || (messageText.match(/\b(?:flat|quarto|apto|apartamento|uh)\s*(\d{2,4})\b/i)?.[1]) || null;
    const effectiveCtx = extractedFlat && (!guestContext || !guestContext.flatNumber)
      ? { ...(guestContext || {}), flatNumber: extractedFlat }
      : guestContext;
    const checkoutResp = formatCheckoutCommunicationResponse(name, effectiveCtx);
    let extraAnswer = "";
    if (/almo[cç]|restaurante|comer|almo[cç]ar/i.test(messageText)) {
      extraAnswer = "\n\n🍽️ Para refeições, temos ótimos restaurantes nos arredores (Rua Conselheiro Otaviano e Praça do Santíssimo Salvador). Qualquer dúvida adicional, nossa recepção está à disposição!";
    } else if (/mala[s]?|bagagem|guardar/i.test(messageText)) {
      extraAnswer = "\n\n🧳 Se precisar guardar suas malas após a saída enquanto aguarda sua viagem, você pode deixá-las com segurança na recepção 24h!";
    }
    return ret(`${checkoutResp}${extraAnswer}`);
  }

  // 0.B Diretrizes do Desenvolvedor para Flat Específico (Prioridade Máxima para regras de unidade)
  if (activeGuidelines.length > 0) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    if (flatNum) {
      const flatGuideline = activeGuidelines.find(g => String(g.targetFlat) === String(flatNum));
      if (flatGuideline) {
        return ret(`${greetingSalutation} Sobre o Flat ${flatNum}: ${flatGuideline.text} Estamos à disposição! ✨`);
      }
    }
  }

  // 0.C Geração Multitópico Composta e Contextual (Anti-Copia-e-Cola e Respostas Integradas)
  // Executa tanto com diretrizes aprendidas dinâmicas quanto com a base de conhecimento padrão
  const asksCheckout = /(?:hor[aá]rio\s+(?:de\s+)?check-?out|que\s+horas\s+(?:é\s+o\s+|tenho\s+que\s+)?sair|hor[aá]rio\s+de\s+sa[ií]da|hor[aá]rio\s+do\s+check-?out|limite\s+de\s+sa[ií]da|\bcheck[- ]?out\b|\bsa[ií]da\b)/i.test(text) && !asksExtension;
  const asksCheckin = /(?:check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada)/i.test(text) && !/pr[eé]-?check-?in/i.test(text);
  const asksWifi = /(?:wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar)/i.test(text);
  const asksGarage = /(?:garagem|estacionamento|vaga\s*(?:de\s+garagem|para\s+carro|de\s+estacionamento|rotativa|coberta)|onde\s+estacionar|posso\s+(?:guardar|parar|estacionar)\s+o\s+carro)/i.test(text);
  const asksBreakfast = /(?:caf[eé]|desjejum)/i.test(text) && !isPricingOrQuoteInquiry(text);
  const asksPet = /(?:pet|cachorro|animal|gato)/i.test(text);
  const asksLeisure = /(?:piscina|jacuzzi|academia|cobertura|lazer|hidro)/i.test(text);
  const asksSmoking = /(?:fumo|fumar|cigarro|fumante)/i.test(text);
  const asksLocation = /(?:endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa)/i.test(text);

  const topicMatches = [
    Boolean(asksCheckout || asksCheckoutTime),
    Boolean(asksCheckin),
    Boolean(asksExtension),
    Boolean(asksWifi),
    Boolean(asksGarage),
    Boolean(asksBreakfast),
    Boolean(asksPet),
    Boolean(asksLeisure),
    Boolean(asksSmoking),
    Boolean(asksLocation)
  ].filter(Boolean);

  if (topicMatches.length >= 2) {
    const parts = [];

    // Check-out
    if (asksCheckout || asksCheckoutTime) {
      const checkoutGuide = activeGuidelines.find(g =>
        (g.category === "checkout" || (g.text || "").toLowerCase().includes("check-out")) &&
        !/(?:estender|prorroga|prolongar)/i.test(g.text || "")
      );
      if (checkoutGuide && !asksCheckoutTime) {
        parts.push(`Sobre o check-out: ${checkoutGuide.text}`);
      } else if (checkoutGuide && asksCheckoutTime && /(?:12:00|12h|hor[aá]rio)/i.test(checkoutGuide.text)) {
        parts.push(`Sobre o check-out: ${checkoutGuide.text}`);
      } else {
        parts.push("O horário padrão de check-out é até as 12:00h (desocupação e entrega das chaves/cartão na portaria).");
      }
    }
    // Check-in
    if (asksCheckin) {
      const checkinGuide = activeGuidelines.find(g => g.category === "checkin" || (g.text || "").toLowerCase().includes("check-in"));
      if (checkinGuide) {
        parts.push(`Sobre o check-in: ${checkinGuide.text}`);
      } else {
        parts.push("O horário padrão de check-in inicia a partir das 14:00h (com early check-in gratuito a partir das 10h para reservas diretas, mediante disponibilidade de liberação pela governança).");
      }
    }
    // Extensão de estadia pelo WhatsApp
    if (asksExtension) {
      const extGuide = activeGuidelines.find(g => /(?:estender|prorroga|prolongar)/i.test(g.text || "") || g.category === "checkout");
      if (extGuide) {
        const cleanGuide = extGuide.text.toLowerCase().startsWith("é possível")
          ? `E sim, ${extGuide.text.charAt(0).toLowerCase() + extGuide.text.slice(1)}`
          : `E sim, é possível estender: ${extGuide.text}`;
        parts.push(cleanGuide);
      } else {
        parts.push("E sim, é possível solicitar a prorrogação ou extensão da sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat.");
      }
    }
    // Wi-Fi
    if (asksWifi) {
      const flatNum = guestContext?.flatNumber || "";
      const netName = flatNum ? `apto ${flatNum}` : "apto {número do flat}";
      parts.push(`Sobre a internet: cada flat possui Wi-Fi veloz individual (Rede: ${netName} | Senha: \`${kb.wifiPassword || "1234567890123"}\`).`);
    }
    // Garagem
    if (asksGarage) {
      const garageGuide = activeGuidelines.find(g => g.category === "garagem" || /garagem|estacionamento|vaga/i.test(g.text || ""));
      if (garageGuide) {
        parts.push(`Sobre o estacionamento: ${garageGuide.text}`);
      } else {
        parts.push("Sobre o estacionamento: dispomos de 1 vaga rotativa coberta e gratuita no condomínio Soho (basta cadastrar a placa no seu Pré-Check-in Digital para liberação na portaria 24h).");
      }
    }
    // Café da manhã
    if (asksBreakfast) {
      const cafeGuide = activeGuidelines.find(g => g.category === "cafe" || (g.text || "").toLowerCase().includes("café"));
      if (cafeGuide) {
        parts.push(`Quanto ao café da manhã: ${cafeGuide.text}`);
      } else {
        parts.push("Quanto ao café da manhã: é servido em deliciosa bandeja diretamente no seu quarto das 05:00 às 09:30, com escolha de itens pelo portal até a véspera.");
      }
    }
    // Pet
    if (asksPet) {
      const petGuide = activeGuidelines.find(g => g.category === "pet" || (g.text || "").toLowerCase().includes("pet"));
      if (petGuide) {
        parts.push(`Sobre animais: ${petGuide.text}`);
      } else {
        parts.push("Sobre animais: aceitamos cães de pequeno porte (até 10kg) com todo carinho, mediante taxa adicional de diária e normas condominiais.");
      }
    }
    // Lazer
    if (asksLeisure) {
      const leisureGuide = activeGuidelines.find(g => g.category === "lazer" || /(?:piscina|academia|jacuzzi)/i.test(g.text || ""));
      if (leisureGuide) {
        parts.push(`Sobre o lazer: ${leisureGuide.text}`);
      } else {
        parts.push("Sobre o lazer: nossa piscina/jacuzzi aquecida e academia na cobertura funcionam diariamente das 06:00 às 22:00 exclusivamente para hóspedes.");
      }
    }
    // Fumo
    if (asksSmoking) {
      const smokingGuide = activeGuidelines.find(g => g.category === "fumo" || /fumo|fumar|cigarro/i.test(g.text || ""));
      if (smokingGuide) {
        parts.push(`Sobre fumo: ${smokingGuide.text}`);
      } else {
        parts.push("Sobre fumo: nossas acomodações são 100% livres de fumo, sendo estritamente proibido fumar dentro dos flats e áreas comuns fechadas.");
      }
    }
    // Localização
    if (asksLocation) {
      parts.push(`Nosso endereço é: ${kb.address} (Centro de Campos dos Goytacazes - RJ).`);
    }

    if (parts.length >= 2) {
      let compoundBody = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (/^(?:sobre|quanto|e\s+sim|al[eé]m)/i.test(p)) {
          compoundBody += `\n\n${p}`;
        } else {
          compoundBody += `\n\nAlém disso, ${p.charAt(0).toLowerCase() + p.slice(1)}`;
        }
      }
      const closing = asksExtension
        ? "\n\nCaso queira prorrogar sua estadia, por favor me informe até que data gostaria de ficar para verificarmos a disponibilidade! 🏨✨"
        : "\n\nQualquer dúvida adicional ou solicitação, estou à inteira disposição! 🏨✨";
      return ret(`${greetingSalutation} ${compoundBody}${closing}`);
    }
  }

  // 0.D Diretrizes do Desenvolvedor para Tópicos Individuais (Prioridade Máxima se houver diretriz)
  if (activeGuidelines.length > 0) {
    // 0.D.1 Café da manhã (apenas se NÃO for consulta de cotação/preço de diária)
    if (/caf[eé]|desjejum/i.test(text) && !isPricingOrQuoteInquiry(text)) {
      const cafeGuideline = activeGuidelines.find(g => g.category === "cafe" || (g.text || "").toLowerCase().includes("café"));
      if (cafeGuideline) {
        return ret(`${greetingSalutation} 🥐☕ ${cafeGuideline.text}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
      }
    }

    // 0.D.2 Check-in / Horário de Entrada
    if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/pr[eé]-?check-?in/i.test(text)) {
      const checkinGuideline = activeGuidelines.find(g => g.category === "checkin" || (g.text || "").toLowerCase().includes("check-in"));
      if (checkinGuideline) {
        return ret(`${greetingSalutation} ${checkinGuideline.text} 🔑`);
      }
    }

    // 0.D.3 Pet / Animais
    if (/pet|cachorro|animal/i.test(text)) {
      const petGuideline = activeGuidelines.find(g => g.category === "pet" || (g.text || "").toLowerCase().includes("pet"));
      if (petGuideline) {
        return ret(`${greetingSalutation} 🐾 ${petGuideline.text}`);
      }
    }

    // 0.D.4 Pergunta sobre Extensão de Reserva via WhatsApp / Prorrogação (Individual)
    if (asksExtension && !isPricingOrQuoteInquiry(text)) {
      const extGuide = activeGuidelines.find(g => /(?:estender|prorroga|prolongar)/i.test(g.text || "") || /(?:estender|prorroga)/i.test(g.category || ""));
      if (extGuide) {
        const gText = extGuide.text;
        const phrase = gText.toLowerCase().startsWith("é possível")
          ? `É possível ${gText.replace(/^é possível\s*/i, "")}`
          : gText;
        return ret(`${greetingSalutation} Sim! ${phrase} Caso queira estender sua estadia, por favor me informe até que data gostaria de permanecer para verificarmos para você! 🏨✨`);
      }
    }

    // 0.D.5 Check-out / Saída / Horário simples (Individual)
    if (classifyUnmetDemand(text).category !== "checkout_comunicacao" && /check[- ]?out|sa[ií]da|desocup|late\s+check[- ]?out/i.test(text) && !asksExtension) {
      const checkoutGuideline = activeGuidelines.find(g =>
        (g.category === "checkout" || (g.text || "").toLowerCase().includes("check-out") || (g.text || "").toLowerCase().includes("checkout")) &&
        !/(?:estender|prorroga|prolongar)/i.test(g.text || "")
      );
      if (checkoutGuideline) {
        const appOrigin = activeDb?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || kb.siteUrl || "https://corpflats.onrender.com";
        const checkoutUrl = guestContext?.checkoutUrl || (guestContext?.reservation?.code ? `${appOrigin}/checkout/${guestContext.reservation.code}` : "");
        const linkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
        return ret(`${greetingSalutation} ${checkoutGuideline.text}${linkMsg}`);
      }
    }

    // 0.D.6 Outras Diretrizes Aprendidas Dinâmicas (Correspondência Semântica por Tokens e Pergunta Original)
    for (const g of activeGuidelines) {
      if (!g || !g.text || g.active === false) continue;

      const gNorm = (g.text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
      const qClean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
      const qTokens = qClean.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
      const gTokens = gNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));

      const commonTokens = qTokens.filter(t => gTokens.includes(t));
      const nonGenericCommon = commonTokens.filter(t => !GENERIC_COMMON_WORDS.has(t));

      let origQMatch = false;
      if (g.question) {
        const origQNorm = (g.question || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ");
        const origQTokens = origQNorm.split(/\s+/).filter(w => w.length > 2 && !PORTUGUESE_STOP_WORDS.has(w));
        const sharedQTokens = qTokens.filter(t => origQTokens.includes(t));
        if (sharedQTokens.length >= 2 || (sharedQTokens.length === 1 && (origQTokens.length <= 2 || sharedQTokens[0].length >= 4))) {
          origQMatch = true;
        }
      }

      const isSpecificMatch = nonGenericCommon.length >= 2 || origQMatch || (nonGenericCommon.length === 1 && (qTokens.length <= 2 || nonGenericCommon[0].length >= 4));

      if (isSpecificMatch) {
        return ret(`${greetingSalutation} ${g.text}`);
      }
    }
  }

  // 0.E Fallback para Extensão de Reserva se ainda não houver diretriz cadastrada
  if (asksExtension && asksCheckoutTime) {
    return ret(`${greetingSalutation} O horário de check-out é até as 12:00h. E sim, é possível estender e prorrogar a sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! Caso queira prorrogar, por favor me informe até que data gostaria de ficar! 🏨✨`);
  }
  if (asksExtension && !isPricingOrQuoteInquiry(text)) {
    return ret(`${greetingSalutation} Sim! É possível solicitar a extensão ou prorrogação da sua estadia diretamente por aqui pelo WhatsApp com a nossa equipe, mediante disponibilidade do flat! 🏨✨ Para verificar, por favor me informe até que data gostaria de ficar.`);
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
      if (isPricingOrQuoteInquiry(text) && isOperationalNonPricingFaq(faq)) {
        continue;
      }
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
      return ret(`${greetingSalutation} ${bestFaq.answer}`);
    }
  }

  // 0.7 Consulta sobre Reserva Existente / Confirmação de Reserva (Prioridade para quem já tem reserva)
  const isExistingReservationInquiry = (
    /(?:m[ij]nhas?\s+reservas?|minhas?\s+di[aá]rias?|minha\s+estadia)/i.test(text) ||
    /(?:reserva|estadia).*(?:confirmad[ao]|aprovad[ao]|status|certo|ok|garantid[ao]|ativa)/i.test(text) ||
    /(?:confirmad[ao]|status|certo|ok).*(?:reserva|estadia)/i.test(text) ||
    /(?:tenho|tem|existe|possui)\s+(?:alguma\s+)?reserva/i.test(text) ||
    /(?:verificar|consultar|conferir|confirmar|saber)\s+(?:minha\s+|se\s+tenho\s+|a\s+|sobre\s+(?:a\s+|minha\s+)?)?reserva/i.test(text) ||
    /(?:saber\s+sobre|dados\s+da|informa[cç][oõ]es?\s+da)\s+minha\s+reserva/i.test(text) ||
    /(?:estou\s+hospedad[ao]|j[aá]\s+estou\s+hospedad[ao])/i.test(text) ||
    /^(?:est[aá]|t[aá])\s+confirmad[ao]\??$/i.test(text)
  );

  if (isExistingReservationInquiry) {
    if (guestContext?.hasReservation && guestContext?.reservation && guestContext.reservation.status !== "cancelada" && guestContext.reservation.status !== "cancelled") {
      const r = guestContext.reservation;
      const flatStr = r.flatNumber || guestContext.flatNumber || "UH a definir";
      const checkinFmt = r.checkinDate ? formatBrDate(r.checkinDate) : "Data a confirmar";
      const checkoutFmt = r.checkoutDate ? formatBrDate(r.checkoutDate) : "Data a confirmar";
      const paymentStr = (r.paymentStatus === "pago_total" || r.paymentStatus === "pago") ? "Pagamento Quitado" : "Pagamento Pendente";
      const appOrigin = activeDb?.settings?.baseUrl || (typeof process !== "undefined" && process.env?.SERVER_BASE_URL) || kb.siteUrl || "https://corpflats.onrender.com";
      const checkoutUrl = guestContext.checkoutUrl || (r.code ? `${appOrigin}/checkout/${r.code}` : "");

      // 1. Check-out hoje (Hóspede já hospedado, hoje é a data de saída até 12:00h - NUNCA mandar pré-check-in)
      if (guestContext.stayStatus === "checkout_hoje") {
        const checkoutLinkMsg = checkoutUrl ? `\n\n🚪 *Confirmação de Check-out:*\n👉 ${checkoutUrl}` : "";
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nLembramos que *hoje é o dia do seu check-out*, com horário limite de desocupação até as *12:00h*.${checkoutLinkMsg}\n\nCaso deseje solicitar prorrogação da estadia (late check-out) mediante disponibilidade ou se já tiver desocupado o flat, por favor me avise por aqui! Como posso te ajudar na sua saída hoje? ✨`);
      }

      // 2. Em estadia (Hóspede já hospedado, saída em data futura - NUNCA mandar pré-check-in)
      if (guestContext.stayStatus === "em_estadia") {
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nVocê já está acomodado(a) no *Flat ${flatStr}* com estadia prevista até *${checkoutFmt}*. Não é necessário preencher pré-check-in novamente!\n\nSe precisar de toalhas extras, orientações de Wi-Fi, agendamento de café ou qualquer outro suporte durante a sua permanência, estou à sua total disposição! ✨`);
      }

      // 3. Check-in hoje (Chegada hoje a partir das 14:00h)
      if (guestContext.stayStatus === "checkin_hoje") {
        const linkUrl = r.checkinUrl || guestContext.checkinUrl;
        const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
        return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nO seu check-in é *hoje (${checkinFmt})* a partir das 14:00h! Lembramos que para reservas diretas temos o benefício de early check-in a partir das 10h (mediante disponibilidade de higienização pela governança).${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua chegada, estou à total disposição!`);
      }

      // 4. Reserva futura
      const linkUrl = r.checkinUrl || guestContext.checkinUrl;
      const linkMsg = linkUrl ? `\n\n📋 *Pré-Check-in Digital:*\n👉 ${linkUrl}` : "";
      return ret(`Olá${name}! Sim, sua reserva está *confirmada*! 🏨✨\n\n• *Flat:* ${flatStr}\n• *Entrada (Check-in):* ${checkinFmt} a partir das 14:00h\n• *Saída (Check-out):* ${checkoutFmt} até as 12:00h\n• *Status:* Confirmada (${paymentStr})\n\nSua estadia está confirmada e programada para início em *${checkinFmt}*! Para agilizar sua liberação na portaria 24h, realize o seu cadastro antecipado:${linkMsg}\n\nSe precisar de qualquer apoio adicional sobre a sua estadia, estou à total disposição!`);
    } else {
      const displayPhone = clientPhone ? ` (*${formatPhoneDisplay ? formatPhoneDisplay(clientPhone) : clientPhone}*)` : "";
      return ret(`Olá${name}! Não localizei nenhuma reserva ativa ou futura confirmada para este número de WhatsApp${displayPhone} no nosso sistema.\n\nSe a sua reserva foi realizada em outro nome, com outro telefone ou por plataformas como Booking.com ou Airbnb, por favor me informe o seu *nome completo* ou o *código da reserva* para que eu possa verificar com a nossa equipe! 🛎️✨`);
    }
  }

  // 0.8 Motor Dinâmico de Cotações, Diárias e Tarifas (Prioridade Máxima sobre comodidades e rotinas operacionais)
  const mentionsGarage = /\b(?:garagem|estacionamento|carro|ve[ií]culo|placa)\b/i.test(text);
  const isPricingOrQuote = isPricingOrQuoteInquiry(text) || (
    /reserva|diaria|diária|preco|preço|valor|alugar|disponibilidade/i.test(text) && !mentionsGarage
  ) || (
    /\bvaga\b/i.test(text) && !mentionsGarage
  );
  if (isPricingOrQuote) {
    // 1. Extrai número de hóspedes mencionado no texto
    const isCoupleOr2 = /\b(?:2|duas)\s+pessoas|\bcasal\b/i.test(text);
    const is3Guests = /\b(?:3|tr[eê]s)\s+pessoas\b/i.test(text);
    const isExplicit1 = /\b(?:1|uma)\s+pessoa|\bsolteir[ao]\b|\bindividual\b/i.test(text);

    // 2. Extrai menção a café da manhã
    const mentionsWithBreakfast = /\b(?:com\s+caf[eé]|incluso\s+caf[eé]|incluindo\s+caf[eé]|caf[eé]\s+incluso)/i.test(text);
    const mentionsWithoutBreakfast = /\b(?:sem\s+caf[eé]|s[oó]\s+o\s+quarto|somente\s+quarto)/i.test(text);
    const isOnlyBreakfastAlone = (
      /\b(?:caf[eé]|desjejum)/i.test(text) &&
      !/\b(?:di[aá]rias?|estadia|hospedagem|quarto|flat|apto|pernoite|aluguel|alugar)/i.test(text) &&
      !isExplicit1 && !isCoupleOr2 && !is3Guests
    );

    // 2.1 Pergunta estritamente sobre o valor do café avulso (sem diária de quarto)
    if (isOnlyBreakfastAlone) {
      return ret(`${greetingSalutation} 🥐☕ O café da manhã da CorpFlats é servido exclusivamente em deliciosa bandeja personalizada com todo conforto diretamente no seu flat!\n\n• *Valor avulso:* R$ 35,00 por pessoa/dia.\n• *Dica especial:* Ao reservar sua diária diretamente conosco no plano com café incluso, você ganha o benefício exclusivo de *isenção total da taxa de limpeza*!\n\nGostaria de consultar as diárias com café para alguma data específica? ✨`);
    }

    // 3. Consulta valores base no banco dinâmico
    const tSettings = activeDb?.tariffSettings || {};
    const baseDailyRate = Number(tSettings.baseDailyRate != null ? tSettings.baseDailyRate : 237);
    const breakfastFeePerson = 35;
    const cleaningFee = 70;

    // 4. Se especificou "1 pessoa com café" (pergunta exata do usuário!)
    if (isExplicit1 && mentionsWithBreakfast) {
      const withBreakfastRate = baseDailyRate + breakfastFeePerson; // 237 + 35 = 272
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *1 pessoa com café da manhã* servido no quarto fica a partir de *R$ ${withBreakfastRate},00* (e você ainda conta com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSe preferir a opção sem café, a diária fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\nPara quais datas você gostaria da reserva? Me informando a entrada e saída, já verifico a disponibilidade e passo todos os detalhes! 🏨`);
    }

    // 5. Se especificou "1 pessoa sem café"
    if (isExplicit1 && mentionsWithoutBreakfast) {
      const withBreakfastRate = baseDailyRate + breakfastFeePerson; // 272
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *1 pessoa sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Opção com café no quarto:* a partir de *R$ ${withBreakfastRate},00 / diária* para 1 pessoa (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você deseja a hospedagem? Me informe a data de entrada e saída para que eu consulte as vagas para você! 🏨`);
    }

    // 6. Se especificou casal / 2 pessoas com café
    if (isCoupleOr2 && mentionsWithBreakfast) {
      const withBreakfastRate2 = baseDailyRate + (breakfastFeePerson * 2); // 237 + 70 = 307
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *2 pessoas (casal) com café da manhã* servido no quarto fica a partir de *R$ ${withBreakfastRate2},00* (com o benefício exclusivo de *isenção total da taxa de limpeza*!).\n\nSem café, a diária fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\nPara quais datas vocês pretendem vir? Me informe o check-in e check-out que já consulto a disponibilidade! 🏨`);
    }

    // 7. Se especificou casal / 2 pessoas sem café
    if (isCoupleOr2 && mentionsWithoutBreakfast) {
      const withBreakfastRate2 = baseDailyRate + (breakfastFeePerson * 2);
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária para *2 pessoas (casal) sem café* fica a partir de *R$ ${baseDailyRate},00* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Com café da manhã no quarto:* a partir de *R$ ${withBreakfastRate2},00 / diária* para o casal (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você gostaria da reserva? Me informe o período desejado! 🏨`);
    }

    // 8. Se mencionou "com café" genérico (sem quantidade explícita de pessoas)
    if (mentionsWithBreakfast) {
      const rate1 = baseDailyRate + breakfastFeePerson; // 272
      const rate2 = baseDailyRate + (breakfastFeePerson * 2); // 307
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, nossas diárias com *café da manhã incluso servido no flat* são a partir de:\n• *1 pessoa:* a partir de *R$ ${rate1},00 / diária*\n• *2 pessoas (casal):* a partir de *R$ ${rate2},00 / diária*\n\n🎁 *Grande benefício:* No plano com café incluso, você tem *isenção total da taxa de limpeza*!\n(Na opção sem café, a diária base é a partir de R$ ${baseDailyRate},00 + taxa única de limpeza de R$ ${cleaningFee},00).\n\nPara qual período você planeja a sua estadia? Me informe as datas de entrada e saída que já verifico as vagas! 🏨`);
    }

    // 9. Se mencionou "sem café" genérico
    if (mentionsWithoutBreakfast) {
      const rate1 = baseDailyRate + breakfastFeePerson;
      return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, a diária de acomodação completa *sem café* é a partir de *R$ ${baseDailyRate},00 / diária* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia).\n\n• *Com café da manhã no flat:* a partir de *R$ ${rate1},00 / diária* para 1 pessoa (com *isenção total da taxa de limpeza*!).\n\nPara quais datas você precisa da hospedagem? Me informe a data de entrada e saída que consulto a disponibilidade! 🏨`);
    }

    // 10. Pergunta genérica de diária / valores / cotação
    const rate1 = baseDailyRate + breakfastFeePerson; // 272
    const rate2 = baseDailyRate + (breakfastFeePerson * 2); // 307
    return ret(`${greetingSalutation} ✨ No canal direto da CorpFlats, nossas diárias para flats executivos completos são a partir de:\n\n• *Sem café:* a partir de *R$ ${baseDailyRate},00 / diária* (+ taxa única de limpeza de R$ ${cleaningFee},00 por estadia)\n• *Com café da manhã no quarto:* a partir de *R$ ${rate1},00 / diária* (1 pessoa) ou *R$ ${rate2},00 / diária* (casal), com *isenção total da taxa de limpeza*! 🥐☕\n\nDispomos de flats com cozinha completa, ar Split, Wi-Fi veloz e garagem no melhor ponto de Campos/RJ.\n\nQual período você pretende se hospedar e para quantas pessoas? Me informando as datas de entrada e saída, já verifico a disponibilidade em tempo real para você! 🏨`);
  }

  // 1. Wi-Fi / Internet
  if (/wifi|wi-fi|internet|senha(?:\s+do\s+wi-?fi)?|conectar/i.test(text)) {
    const flatNum = guestContext?.flatNumber || "";
    const netName = flatNum ? `apto ${flatNum}` : "apto {número do seu flat}";
    return ret(`${greetingSalutation} 📶 Cada flat possui sua própria rede Wi-Fi exclusiva para máxima estabilidade e velocidade:\n\n• *Nome da Rede:* ${netName}\n• *Senha:* \`${kb.wifiPassword || "1234567890123"}\`\n\nCaso tenha qualquer dificuldade para conectar, certifique-se de digitar a senha com atenção. Estamos à disposição! ✨`);
  }

  // 2. Café da Manhã (verificado antes de termos genéricos de acomodação)
  if (/caf[eé]|desjejum/i.test(text)) {
    if (/card[aá]pio|itens|o\s+que\s+tem|op[cç][oõ]es/i.test(text)) {
      return ret(`${greetingSalutation} 🥐☕ Nosso café da manhã é servido pontualmente no seu quarto das *05:00 às 09:30* em deliciosa bandeja.\n\nO cardápio padrão inclui:\n• *Bebidas:* Café, café com leite, leite e suco natural de laranja\n• *Pães:* Pão francês quentinho e pão de queijo\n• *Frios & Quentes:* Queijo mussarela, presunto e ovos mexidos\n• *Complementos & Doces:* Manteiga, bolo do dia e frutas frescas (mamão, maçã ou banana).\n\nPara agendar o horário e personalizar sua bandeja, basta acessar o link do Café no seu Portal do Hóspede até a véspera! ✨`);
    }

    const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
    const roomNum = guestContext?.flatNumber;
    const orders = Array.isArray(activeDb?.breakfastOrders) ? activeDb.breakfastOrders : [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrder = orders.find(o =>
      (o.date === todayStr || !o.date) &&
      ((roomNum && String(o.roomNumber) === String(roomNum)) || (clientPhone && cleanWhatsAppPhone(o.phone) === cleanWhatsAppPhone(clientPhone)))
    );

    if (todayOrder) {
      return ret(`${greetingSalutation} 🥐☕ Localizamos o seu pedido de café da manhã para o Flat ${todayOrder.roomNumber || roomNum}! A entrega na bandeja está agendada para às *${todayOrder.deliveryTime || "07:00"}h* no seu quarto. Tenha um excelente dia! ✨`);
    }

    return ret(`${greetingSalutation} 🥐☕ ${kb.breakfastInfo}\n\nPara agendar sua bandeja e escolher os itens do café da manhã, acesse o link do Portal do Hóspede até a véspera! ✨`);
  }

  // 3. Garagem / Estacionamento / Carro
  if (/garagem|estacionamento|vaga|carro|ve[ií]culo|placa/i.test(text)) {
    const clientPhone = guestContext?.phone || (typeof guestContext === "string" ? guestContext : null);
    const roomNum = guestContext?.flatNumber;
    const auths = Array.isArray(activeDb?.garageAuthorizations) ? activeDb.garageAuthorizations : [];
    const resVeh = guestContext?.reservation?.vehicle;

    const matchedAuth = auths.find(a =>
      (roomNum && String(a.flatNumber) === String(roomNum)) ||
      (clientPhone && cleanWhatsAppPhone(a.phone) === cleanWhatsAppPhone(clientPhone)) ||
      (resVeh?.plate && String(a.plate).toUpperCase() === String(resVeh.plate).toUpperCase())
    );

    if (matchedAuth || resVeh?.plate) {
      const plate = matchedAuth?.plate || resVeh?.plate;
      const model = matchedAuth?.model || resVeh?.model || "veículo";
      return ret(`${greetingSalutation} 🚗 Ótima notícia! O seu veículo (*${model} - Placa ${plate}*) já consta com liberação ativa na portaria 24h do condomínio Soho! Dispomos de 1 vaga rotativa gratuita coberta. Qualquer dúvida ao chegar, basta se identificar na portaria! ✨`);
    }

    return ret(`${greetingSalutation} 🚗 ${kb.garageInfo}\n\nSe ainda não informou os dados do veículo, acesse seu Pré-Check-in Digital ou envie por aqui a *Placa, Modelo e Cor* que já providenciamos a autorização com a portaria!`);
  }

  // 3.1 Achados e Perdidos / Objetos Esquecidos
  if (/(?:achad[ao]s?\s+e\s+perdid[ao]s?|esquec(?:i|eu|emos|ido)|perdi\s+(?:meu|minha|um|uma)|deixei\s+(?:no\s+quarto|no\s+flat|l[aá])|objeto\s+esquecido)/i.test(text)) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    const lostList = Array.isArray(activeDb?.lostAndFound) ? activeDb.lostAndFound : [];
    if (flatNum) {
      const foundItem = lostList.find(i => String(i.flatNumber) === String(flatNum) && i.status !== "devolvido");
      if (foundItem) {
        return ret(`${greetingSalutation} 🔍 Localizamos um item registrado para o Flat ${flatNum}: *${foundItem.description}* (local: ${foundItem.locationInRoom || "apartamento"}). O objeto está guardado com total segurança pela nossa equipe. Nossa recepção dará continuidade com você por aqui para combinar a retirada ou envio! 🧳✨`);
      }
    }
    return ret(`${greetingSalutation} 🧳 Todos os objetos encontrados nos apartamentos são catalogados e guardados com segurança pela nossa equipe de governança. Poderia nos informar qual item foi esquecido e o número do seu flat? Nossa equipe da recepção verificará imediatamente no sistema! 🔍✨`);
  }

  // 3.2 Manutenção / Reparos / Ordens de Serviço
  if (/(?:manuten[cç][aã]o|conserto|reparo|defeito|estragad[ao]|n[aã]o\s+(?:est[aá]\s+)?funcionando|quebrad[ao]|ar\s+(?:n[aã]o\s+gela|pingando)|chuveiro\s+(?:frio|n[aã]o\s+esquenta|queimado)|l[aâ]mpada\s+queimada|vazamento|ordem\s+de\s+servi[cç]o)\b/i.test(text)) {
    const flatNum = guestContext?.flatNumber || (text.match(/\b(?:flat|apto|quarto)\s*(\d{2,4})\b/i)?.[1] || null);
    const serviceOrders = Array.isArray(activeDb?.serviceOrders) ? activeDb.serviceOrders : [];
    if (flatNum) {
      const activeOrder = serviceOrders.find(so =>
        so.status === "active" && Array.isArray(so.flats) &&
        so.flats.some(sf => String(sf.flatNumber) === String(flatNum) && sf.status !== "done")
      );
      if (activeOrder) {
        return ret(`${greetingSalutation} 🛠️ Identificamos que já existe um chamado de manutenção aberto para o Flat ${flatNum} (*${activeOrder.title}*). Nossa equipe técnica já está atuando para normalizar o item com a maior brevidade possível! Caso precise de algo adicional, estamos à disposição! 🛎️`);
      }
    }
    return ret(`${greetingSalutation} 🛠️ Lamentamos pelo inconveniente! Já registrei o chamado de manutenção para a nossa equipe técnica e recepção cuidarem do conserto com prioridade. Se puder nos dar mais detalhes do problema e o número do seu flat, agilizaremos o atendimento imediatamente! 🛎️✨`);
  }

  // 3.3 Regras Gerais do Condomínio, Silêncio, Visitas e Convivência
  if (/(?:regras?|normas?|condom[ií]nio|regulamento|sil[eê]ncio|barulho|visitas?|receber\s+visita|visitante)/i.test(text)) {
    if (/(?:sil[eê]ncio|barulho|m[uú]sica\s+alta|som\s+alto)/i.test(text)) {
      return ret(`${greetingSalutation} 🤫 O condomínio Soho Residence preza pelo descanso de todos os hóspedes:\n\n• *Horário de Silêncio:* Das 22:00h às 08:00h.\n• Pedimos manter TV, som e conversas em volume suave nos flats e corredores durante todo o dia, especialmente após as 22h.\n\nContamos com a sua colaboração para uma estadia tranquila! ✨`);
    }

    if (/(?:visitas?|receber\s+visita|visitante|amigo|familiar)/i.test(text)) {
      return ret(`${greetingSalutation} 👥 Para a segurança de todos os moradores e hóspedes do condomínio Soho:\n\n• Todas as visitas devem ser informadas com antecedência à recepção/portaria com documento com foto (RG/CPF).\n• A permanência de visitantes para pernoite é restrita à capacidade máxima do flat e sujeita a taxa adicional.\n• As áreas de lazer da cobertura (piscina e academia) são de uso *exclusivo dos hóspedes cadastrados* na reserva (não permitida entrada de visitantes externos).\n\nQualquer dúvida, nossa recepção está à disposição! 🛎️`);
    }

    return ret(`${greetingSalutation} 📋 Conheça as principais regras e normas de convivência do condomínio Soho Residence:\n\n• *Check-in/Check-out:* Entrada a partir das 14h e saída até as 12h.\n• *Silêncio:* Das 22h às 08h em todos os apartamentos e áreas comuns.\n• *Lazer:* Piscina aquecida e academia na cobertura funcionam diariamente das 06:00 às 22:00 exclusivamente para hóspedes.\n• *Garagem:* 1 vaga rotativa coberta e gratuita por flat (necessário cadastrar placa no Pré-Check-in Digital).\n• *Fumo:* Proibido fumar no interior dos apartamentos (área 100% não fumante).\n• *Pets:* Permitido cães de pequeno porte (até 10kg) mediante prévia autorização e taxa.\n\nEstamos sempre à disposição para tornar sua estadia maravilhosa! 🏨✨`);
  }

  // 4. Localização / Endereço / Onde fica
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar|mapa/i.test(text)) {
    return ret(`${greetingSalutation} 📍 Estamos localizados no *${kb.address}*.\n\nLocalização privilegiada no Centro de Campos dos Goytacazes! Se precisar de instruções de rota ou localização no Google Maps, nos avise. 🏨`);
  }

  // 5. Check-in / Horário de Entrada
  if (/check-?in|entrada|hor[aá]rio\s+de\s+entrada|que\s+horas\s+posso\s+entrar|chegada/i.test(text) && !/pr[eé]-?check-?in/i.test(text)) {
    return ret(`${greetingSalutation} O horário padrão de check-in é a partir das *${kb.checkinTime}* 🔑.\n\nPara reservas diretas, o early check-in a partir das 10h é gratuito mediante disponibilidade de liberação pela governança.`);
  }

  // 5.1 Check-out / Horário de Saída
  if (/check-?out|sa[ií]da|hor[aá]rio\s+de\s+sa[ií]da|que\s+horas\s+sair|deixar\s+a\s+chave/i.test(text)) {
    return ret(`${greetingSalutation} O horário padrão de check-out é até às *${kb.checkoutTime}* ⏰.\n\nPara fazer a saída, pedimos que desligue ar-condicionado e luzes e entregue as chaves/cartão na portaria do condomínio. Caso necessite de late check-out, fale conosco com antecedência! 🙏`);
  }

  // 6. Status do Quarto / Posso entrar? / Está pronto?
  if (/(?:quarto|flat|apartamento|chave|porta).*(?:pront|liberad|limp|entrar|chegand)|(?:pront|liberad).*(?:quarto|flat|apartamento)|posso\s+(?:entrar|ir)|senha\s+da\s+porta|chegando/i.test(text)) {
    if (guestContext.stayStatus === "checkin_hoje") {
      if (guestContext.isRoomReady) {
        return ret(`Ótima notícia${name}! 🎉 O seu *Flat ${guestContext.flatNumber}* já está *100% limpo, higienizado e pronto* para te receber! Ao chegar, basta se identificar na portaria com seu documento para a liberação da chave. Seja muito bem-vindo(a)! 🏨🔑`);
      } else {
        return ret(`${greetingSalutation} O seu *Flat ${guestContext.flatNumber}* está sendo finalizado com todo carinho pela nossa governança para garantir máxima higiene e conforto ✨. O horário oficial de entrada é a partir das *${kb.checkinTime}*. Assim que a limpeza for 100% liberada pela equipe, nós te avisaremos por aqui imediatamente! 🕒`);
      }
    }
    if (guestContext.stayStatus === "em_estadia") {
      return ret(`${greetingSalutation} Você está acomodado(a) no *Flat ${guestContext.flatNumber}*. Caso precise de alguma manutenção, toalhas extras ou limpeza durante a estadia, é só nos avisar por aqui que cuidaremos para você! 🛎️`);
    }
  }

  // 7.5 Pré-Check-in / Link de Check-in
  if (/check-?in\s+online|pr[eé]-?check-?in|ficha(?:\s+de\s+check-?in)?|link(?:\s+do|\s+de)?\s+check-?in/i.test(text)) {
    if (guestContext.checkinUrl) {
      return ret(`${greetingSalutation} Você pode realizar o seu Pré-Check-in Digital pelo link seguro abaixo:\n👉 ${guestContext.checkinUrl}\n\nO preenchimento antecipado garante a liberação rápida da portaria na sua chegada! Qualquer dúvida, conte conosco. 🏨✨`);
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

  // 7.8 Comodidades Específicas dos Flats (Split, Micro-ondas, Casal, Cama Inteira, Solteiro, etc.)
  if (/(?:split|ar[- ]?split)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const splitFlats = searchFlatsByAmenities(activeDb, { split: true });
    const numbers = splitFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Os nossos flats equipados com ar-condicionado Split potente são: ${numbers || "113, 313, 712, 904 e 905"} ❄️. Deseja verificar disponibilidade para alguma data específica?`);
  }

  if (/(?:micro[- ]?ondas)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const microFlats = searchFlatsByAmenities(activeDb, { hasMicrowave: true });
    const numbers = microFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats dispõem de cozinha compacta equipada com micro-ondas e frigobar para sua total praticidade 🍽️⚡ (especialmente os flats: ${numbers || "113, 408, 511, 712"}).`);
  }

  if (/(?:cama\s+de\s+casal|cama\s+casal|cama\s+inteira|cama_inteira)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const casalFlats = searchFlatsByAmenities(activeDb, { bedType: "casal" });
    const numbers = casalFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats com cama inteira / casal são: ${numbers || "113, 211, 408, 509, 511, 907"} 🛏️.`);
  }

  if (/(?:2\s+camas?|duas\s+camas?|cama\s+solteiro|camas?\s+de\s+solteiro|solteiro)\b/i.test(text) && /(?:qual|quais|tem|existe|queria|temos|dispon[ií]vel|quarto|flat)/i.test(text)) {
    const solteiroFlats = searchFlatsByAmenities(activeDb, { bedType: "solteiro" });
    const numbers = solteiroFlats.map(f => f.number).join(", ");
    return ret(`${greetingSalutation} Sim! Nossos flats com duas camas de solteiro (twin) são: ${numbers || "114, 212, 215, 313, 512, 605, 712, 715, 1004, 1304"} 🛏️🛏️.`);
  }

  // 7.9 Comodidades e Estrutura Geral dos Flats
  if (/micro[- ]ondas|frigobar|cafeteira|cooktop|fog[aã]o|cozinha|utens[ií]lio|smart\s*tv|tv|televis[aã]o|cama|enxoval|toalha|len[cç]ol|roupa\s+de\s+cama|ar[- ]condicionado|ar\s+split|comodidade/i.test(text)) {
    return ret(`${greetingSalutation} ✨ Todos os nossos flats dispõem de: ${kb.amenities}`);
  }

  // 7.10 Animais e Pets
  if (/pet|cachorro|animal|gato/i.test(text)) {
    return ret(`${greetingSalutation} 🐾 ${kb.petPolicy}`);
  }

  // 7.11 Lazer, Cobertura, Piscina e Academia
  if (/piscina|jacuzzi|academia|cobertura|lazer|hidro/i.test(text)) {
    return ret(`${greetingSalutation} 🏊‍♂️ ${kb.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura das 06:00 às 22:00 para uso exclusivo dos hóspedes."}`);
  }

  // 7.12 Fumo e Cigarro
  if (/fumo|fumar|cigarro|fumante/i.test(text)) {
    return ret(`${greetingSalutation} 🚭 ${kb.smokingPolicy}`);
  }

  // 7.13 Solicitação de Troca de Quarto / Remanejamento
  if (/(?:trocar|mudar|alterar)\s+(?:de\s+)?(?:flat|quarto|apartamento)\b/i.test(text) || /(?:pode\s+me\s+colocar|quero\s+ficar|prefiro\s+o)\s+(?:no\s+)?(?:flat|quarto|apto)?\s*(\d{3,4})\b/i.test(text)) {
    const targetMatch = text.match(/\b(\d{3,4})\b/);
    const targetFlatNum = targetMatch ? targetMatch[1] : null;
    const res = guestContext?.reservation;
    if (res && targetFlatNum) {
      const botSettings = getBotActionsSettings(activeDb);
      if (!botSettings.apiActionsEnabled || !botSettings.allowedActions?.reallocateReservationFlat) {
        return ret(`${greetingSalutation} Compreendo seu pedido para o Flat ${targetFlatNum}. No momento, esta ação automática está pausada no sistema para validação da nossa equipe. Já registrei sua solicitação para a recepção verificar com prioridade! 🛎️✨`);
      }

      const realloc = handleReallocateReservationFlat(activeDb, {
        reservationId: res.id,
        targetFlatNumber: targetFlatNum,
        reason: "Solicitação via WhatsApp pelo hóspede"
      });
      if (realloc.success) {
        return ret(`${greetingSalutation} ${realloc.message} 🏨✨ Seu apartamento foi atualizado para o Flat ${targetFlatNum}!`);
      } else {
        return ret(`${greetingSalutation} Compreendo seu pedido para o Flat ${targetFlatNum}. ${realloc.message} Gostaria de verificar outro apartamento disponível? 😊`);
      }
    }
  }

  // 9. Se for demanda operacional não atendida pela base de conhecimento
  if (queryAnalysis.type === "OPERATIONAL_DEMAND") {
    const demandTitle = queryAnalysis.demandClassification?.demandTitle || "esta solicitação";
    return ret(`Olá${name}! Recebi sua solicitação sobre *${demandTitle}* 🛎️. Como essa operação requer acompanhamento da nossa equipe, já registrei o seu pedido no sistema para a recepção atender você com máxima atenção! ✨`);
  }

  // 10. Se for dúvida não mapeada
  if (queryAnalysis.type === "UNKNOWN_INQUIRY") {
    return ret(`Olá${name}! Anotei sua dúvida. Como não tenho essa informação cadastrada no sistema, já registrei sua pergunta para a equipe da recepção te responder por aqui em instantes! 🛎️✨`);
  }

  // 11. Resposta padrão prestativa
  return ret(`Olá${name}! Recebi sua mensagem. Sou a ${aiConfig.agentName}, concierge virtual da CorpFlats 🏨.\n\nPosso te ajudar com informações sobre *Wi-Fi, horários de check-in/out, status do flat, garagem, café da manhã e localização*. Como posso te ajudar? Se preferir falar com um atendente da recepção, basta me avisar! ✨`);
}

/**
 * Chama o Google Gemini com lista de candidatos e suporte multi-turn a Function Calling
 */
export async function callGeminiAi({ apiKey, systemInstruction, prompt, history = [], db, tools = [], customPrompt = false, requesterRole = "guest", requesterPhone = "" }) {
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

  const fullPrompt = customPrompt
    ? (systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt)
    : `${systemInstruction}\n\n[MENSAGEM ATUAL DO HÓSPEDE]:\n${prompt}\n\n[INSTRUÇÃO DE RESPOSTA]: Responda diretamente ao hóspede de forma concisa, educada e pronta para envio no WhatsApp.`;

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
        // Papel autorizado pelo sistema possui precedência estrita para blindagem contra elevação de privilégio LGPD
        const authorizedRole = requesterRole || "guest";
        const effectivePhone = requesterPhone || fnArgs.requesterPhone || "";
        actionResult = await executeBotAction(db, fnName, {
          ...fnArgs,
          requesterRole: authorizedRole,
          requesterPhone: effectivePhone
        });
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

  const isPricingQuery = isPricingOrQuoteInquiry(messageText);
  const applicableFaqs = allFaqItems.filter(faq => {
    if (!faq || faq.status !== "ativo" || !isFaqApplicableToClient(faq, phone)) return false;
    if (isPricingQuery && isOperationalNonPricingFaq(faq)) return false;
    return true;
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

  let stayStatusNotice = guestContext.stayStatus;
  if (guestContext.stayStatus === "checkout_hoje") {
    stayStatusNotice = "CHECK-OUT HOJE (Data de saída). ATENÇÃO: Hóspede em dia de saída. Limite de check-out até às 12:00h. NUNCA envie link de pré-check-in digital. Oriente sobre procedimentos de saída e devolução de chaves, pergunte se precisa prorrogar/late check-out ou se já desocupou o flat. Link para confirmação de check-out: " + (guestContext.checkoutUrl || "Não aplicável");
  } else if (guestContext.stayStatus === "em_estadia") {
    stayStatusNotice = "EM ESTADIA (Hóspede já acomodado no flat). ATENÇÃO: NUNCA envie link de pré-check-in digital! Preste suporte à estadia em andamento.";
  }

  const contextString = `
[CONTEXTO EM TEMPO REAL]
- Data atual: ${guestContext.todayStr} | Horário: ${guestContext.timeStr} (Brasília)
- Telefone do contato: ${guestContext.phone}
- Nome do contato: ${guestContext.guestName || "Não identificado ainda (possível novo cliente / lead)"}
- Status da estadia: ${stayStatusNotice}
- Possui reserva: ${guestContext.hasReservation ? "SIM" : "NÃO"}
${guestContext.hasReservation ? `- Flat atribuído: ${guestContext.flatNumber || "A definir"}
- Período da reserva: ${guestContext.reservation?.checkinDate} até ${guestContext.reservation?.checkoutDate}
- Status da reserva: ${guestContext.reservation?.status}
- Link do Pré-Check-in Digital: ${guestContext.checkinUrl ? guestContext.checkinUrl : "NÃO ENVIAR / NÃO APLICÁVEL (Hóspede já em estadia / check-out hoje / sem relevância)"}
${guestContext.isCheckoutDay && guestContext.checkoutUrl ? `- Link de Confirmação de Check-out: ${guestContext.checkoutUrl}\n` : ""}- Status da higienização/limpeza hoje: ${guestContext.cleaningStatus.toUpperCase()} (Liberado/Pronto: ${guestContext.isRoomReady ? "SIM" : "NÃO"})` : "- Modo: Atendimento a novo cliente / Cotação"}

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

[TARIFAS E DIÁRIAS OFICIAIS CORPFLATS - CANAL DIRETO / WHATSAPP]
- Flats executivos de alto padrão completos e decorados (Edifício Soho Residence Service).
- Diária base de acomodação (flat completo): a partir de R$ 237,00 / noite.
- Café da manhã avulso: R$ 35,00 por pessoa/dia (servido em deliciosa bandeja personalizada diretamente no flat).
- Opção 1: DIÁRIA COM CAFÉ DA MANHÃ (Recomendada):
  * 1 pessoa: a partir de R$ 272,00 / diária (R$ 237 base + R$ 35 café).
  * 2 pessoas (casal): a partir de R$ 307,00 / diária (R$ 237 base + 2x R$ 35 café).
  * VANTAGEM EXCLUSIVA: ISENÇÃO TOTAL da taxa de limpeza no plano com café incluso!
- Opção 2: DIÁRIA SEM CAFÉ DA MANHÃ (Apenas acomodação):
  * A partir de R$ 237,00 / diária (+ taxa única de limpeza de R$ 70,00 por estadia).
- Cama extra / 3º hóspede: R$ 60,00 adicional por diária.
- Benefícios exclusivos da reserva direta: melhor tarifa garantida sem taxas de intermediários, prioridade de early check-in a partir das 10h (quando disponível pela governança) e suporte direto.
- REGRA CRÍTICA PARA PERGUNTAS DE VALORES E DIÁRIAS (mesmo citando café, ex: "quanto tá a diária? 1 pessoa com café"):
  * Forneça sempre os valores das diárias com clareza e acolhimento (ex: R$ 272 com café / R$ 237 sem café).
  * NUNCA responda apenas explicando o funcionamento da bandeja ou horários do café quando o hóspede perguntar preço/diária!
  * Solicite gentilmente as datas desejadas de check-in e check-out para verificar a disponibilidade exata e fechar a cotação.
${dynamicFaqPromptSection}
${systemActionsNotice}
`;

  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;
  const { toneSection, guidelinesSection, flatsCatalogSection } = buildDynamicSystemInstruction(aiConfig, db, guestContext);

  // 3. Tenta responder via Google Gemini (com Function Calling adaptativo se disponível)
  if (apiKey) {
    try {
      const geminiRes = await callGeminiAi({
        apiKey,
        systemInstruction: `${aiConfig.systemPrompt}\n${toneSection}${guidelinesSection}\n${flatsCatalogSection || ""}\n${contextString}`,
        prompt: messageText,
        history,
        db,
        tools,
        requesterRole: "guest",
        requesterPhone: phone
      });

      if (geminiRes.ok && geminiRes.text) {
        const validation = validateAndRefineResponse({
          queryText: messageText,
          candidateText: geminiRes.text,
          guestContext,
          db,
          aiConfig
        });

        const finalReply = geminiRes.requiresHandover ? geminiRes.text : (validation.replyText || geminiRes.text);

        return {
          shouldHandover: Boolean(geminiRes.requiresHandover || validation.shouldHandover),
          requiresHandover: Boolean(geminiRes.requiresHandover || validation.requiresHandover),
          replyText: finalReply,
          guestContext,
          modelUsed: geminiRes.model,
          source: "gemini",
          functionCall: geminiRes.functionCall || null,
          functionResult: geminiRes.functionResult || null,
          unmetDemand: validation.unmetDemand || null,
          missingDataOrCapability: validation.missingDataOrCapability || false
        };
      }
    } catch (err) {
      console.warn("[WhatsApp AI] Falha inesperada ao invocar Gemini AI:", err?.message || err);
    }
  }

  // 4. Contingência Heurística Local de Alta Precisão (Zero-Crash Fallback)
  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig, applicableFaqs, db);
  const validation = validateAndRefineResponse({
    queryText: messageText,
    candidateText: heuristicText,
    guestContext,
    db,
    aiConfig
  });

  return {
    shouldHandover: Boolean(validation.shouldHandover),
    requiresHandover: Boolean(validation.requiresHandover),
    replyText: validation.replyText || heuristicText,
    guestContext,
    modelUsed: "heuristic_fallback",
    source: "heuristic",
    unmetDemand: validation.unmetDemand || null,
    missingDataOrCapability: validation.missingDataOrCapability || false
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

  // Descartar comandos do desenvolvedor, coaching, correções ou feedbacks
  if (/\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|sofia\s*[,:]|quando\s+(?:algu[eé]m|o\s+h[oó]spede|um\s+h[oó]spede|[a-z]+)\s+.*?\bper|n[aã]o\s+deve|n[aã]o\s+pode|n[aã]o\s+pergunte|n[aã]o\s+diga|voc[eê]\s+deve|voc[eê]\s+verificou|est[aá]\s+errad[ao]|aprenda\s+a|corrij[ao]|tom\s+calibrado)\b/i.test(lower)) return false;

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

export function generateIntelligentFaqDraft(questionText, db = null, category = "estrutura_flat") {
  if (!questionText || typeof questionText !== "string") return "";
  const lower = questionText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Micro-ondas / Cozinha / Eletrodomésticos
  if (/micro[- ]?ondas/i.test(lower)) {
    return "Sim! Todos os nossos flats dispõem de cozinha compacta equipada com micro-ondas, frigobar e utensílios completos para sua total comodidade. 🍽️⚡";
  }
  if (/frigobar|geladeira|congelador/i.test(lower)) {
    return "Sim! Todos os flats contam com frigobar privativo limpo e ligado para uso particular dos hóspedes. 🧊";
  }
  if (/cafeteira|cafezinh/i.test(lower)) {
    return "Sim! Nossos flats dispõem de cozinha compacta equipada com cafeteira para seu conforto. ☕";
  }
  if (/cooktop|fog[aã]o|panela|cozinha|lou[cç]a|talher|prato|copo/i.test(lower)) {
    return "Sim! Nossos flats possuem cozinha compacta equipada com cooktop, micro-ondas, frigobar e utensílios essenciais para refeições práticas. 🍳";
  }
  if (/ferro|passar|t[aá]bua/i.test(lower)) {
    return "Sim! Disponibilizamos ferro de passar roupa nos flats para seu uso (sem tábua de passar). 👔✨";
  }
  if (/voltagem|110|220|127|tomada|eletric/i.test(lower)) {
    return "A voltagem padrão em todos os nossos flats é 127V (110V), com tomadas no padrão ABNT. 🔌⚡";
  }
  if (/secador(?:\s+de\s+cabelo)?/i.test(lower)) {
    return "Sim! Os banheiros dos flats contam com secador de cabelo e ducha higiênica para seu conforto. 🚿";
  }
  if (/ar[- ]?condicionado|split|climatiza|calor|frio/i.test(lower)) {
    return "Sim! Todos os flats possuem ar-condicionado Split potente e controle individual. ❄️";
  }
  if (/cafe(?:\s+da\s+manha)?|desjejum/i.test(lower)) {
    return "Nosso delicioso café da manhã é servido em bandeja diretamente no seu quarto das 05:00 às 09:30, agendado previamente pelo portal do hóspede. ☕🥐";
  }
  if (/wi[- ]?fi|internet|senha(?:\s+do\s+wi-?fi)?|conex[aã]o/i.test(lower)) {
    return "O Wi-Fi é individual e de alta velocidade em cada flat! O nome da rede é o número do seu apartamento e a senha padrão é 1234567890123. 📶";
  }
  if (/piscina|jacuzzi|cobertura|lazer|hidro/i.test(lower)) {
    return "A área de lazer na cobertura (com piscina/jacuzzi aquecida e academia) funciona diariamente das 06:00 às 22:00 exclusivamente para hóspedes. 🏊‍♂️✨";
  }
  if (/academia|muscula[cç][aã]o|fitness|treino/i.test(lower)) {
    return "Sim! Nossa academia fica na cobertura do edifício e funciona diariamente das 06:00 às 22:00 com equipamentos completos para seu treino. 🏋️‍♂️✨";
  }
  if (/pet|cachorro|animal|gato/i.test(lower)) {
    return "Sim! Aceitamos pets de pequeno porte com todo carinho (máximo 1 pet por flat, mediante taxa única). 🐾✨";
  }
  if (/garagem|estacionamento|vaga|ve[ií]culo|carro|moto|caminhonete/i.test(lower)) {
    return "Dispomos de vaga de garagem coberta gratuita (rotativa) para 1 veículo de passeio por flat no condomínio Soho! 🚗";
  }
  if (/check[- ]?in|horario\s+(?:de\s+)?(?:entrada|chegada)|(?:horas?|quando)\s+(?:posso\s+|da\s+para\s+)?entrar|entrar\s+antes|early/i.test(lower)) {
    return "O horário de check-in inicia a partir das 14:00. Caso chegue antes, faremos o possível para liberar o flat conforme a disponibilidade. 🕒🛎️";
  }
  if (/check[- ]?out|horario\s+(?:de\s+)?saida|(?:horas?|quando)\s+(?:posso\s+|preciso\s+|tenho\s+que\s+)?sair|sair\s+depois|late/i.test(lower)) {
    return "O check-out deve ser realizado até as 12:00. Basta deixar os cartões-chave na recepção/portaria ao sair. 🕛👋";
  }
  if (/reserva|confirmad[ao]|voucher|localizador/i.test(lower)) {
    return "Para consultar os detalhes da sua reserva e status de confirmação, basta nos informar o nome completo do titular ou código da reserva. Também é possível acessar todos os dados diretamente no Portal do Hóspede! 🏨📋";
  }
  if (/toalha|roupa\s+de\s+cama|len[cç]ol|travesseiro|enxoval/i.test(lower)) {
    return "Sim! Disponibilizamos enxoval completo de cama e banho higienizado e de alta qualidade para todos os hóspedes da acomodação. 🛏️✨";
  }
  if (/limpeza|camareira|faxina|arruma[cç][aã]o/i.test(lower)) {
    return "O flat é entregue completamente limpo e higienizado antes do seu check-in. Limpezas extras durante a estadia podem ser solicitadas com a nossa equipe mediante taxa de serviço. 🧹✨";
  }
  if (/endere[cç]o|localiza[cç][aã]o|onde\s+fica|como\s+chegar/i.test(lower)) {
    return "Estamos localizados na Av. Jornalista Roberto Marinho, Edifício Soho, em Macaé/RJ, em localização privilegiada e de fácil acesso! 📍🏨";
  }
  if (/fumar|cigarro|narguile|tabaco/i.test(lower)) {
    return "Por lei e pelo regulamento do condomínio, é estritamente proibido fumar no interior dos flats e nas áreas comuns fechadas. 🚭";
  }
  if (/visita|convidad[ao]|terceiros/i.test(lower)) {
    return "Por segurança condominial, o acesso às instalações e áreas de lazer é restrito aos hóspedes devidamente cadastrados na reserva. 🛑👥";
  }

  return "";
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

  // 1. Comandos de coaching ou mensagens administrativas do desenvolvedor NUNCA devem virar FAQ
  const devCheck = classifyDeveloperMessage(text, db);
  if (devCheck && devCheck.type !== "guest_simulation") {
    return null;
  }

  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(?:sou\s+(?:o\s+)?miller|aqui\s+[eé]\s+(?:o\s+)?miller|sofia\s*[,:]|quando\s+.*?\bper|n[aã]o\s+deve|n[aã]o\s+pode|voc[eê]\s+deve|voc[eê]\s+verificou|est[aá]\s+errad[ao]|aprenda\s+a)\b/i.test(lower)) {
    return null;
  }

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

  const intelligentDraft = generateIntelligentFaqDraft(text, db, category);

  const newFaq = {
    id: `faq_${Date.now()}_${randomSuffix}`,
    question: text,
    answer: "",
    category,
    keywords,
    variations: [text],
    status: intelligentDraft ? "aguardando_aprovacao" : "pendente",
    suggestedAnswer: intelligentDraft || undefined,
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
        title: intelligentDraft ? `💡 Nova Sugestão de FAQ: ${senderName || cleanPhone}` : `❓ Nova Dúvida Hóspede: ${senderName || cleanPhone}`,
        message: intelligentDraft 
          ? `Pergunta identificada com rascunho de resposta sugerido: "${text.substring(0, 80)}". Aguardando aprovação.`
          : `Pergunta não mapeada recebida: "${text.substring(0, 100)}". Registrada como pendente no FAQ.`,
        type: intelligentDraft ? "faq_suggestion" : "whatsapp_faq_pending",
        targetUrl: "/whatsapp-automation",
        link: "/whatsapp-automation"
      });
    } catch (_) {}
  }

  console.log(`[Auto-Aprendizado FAQ] Nova dúvida ${intelligentDraft ? "com sugestão inteligente" : "pendente"}: "${text}" (${cleanPhone})`);

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
      let finalGuideline = devClassification.guideline;
      const devApiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY || aiConfig?.apiKey || null;
      if (devApiKey) {
        try {
          const aiSynthesized = await synthesizeDeveloperCoachingWithAi({
            rawText: incomingInfo.text,
            category: devClassification.guideline?.category,
            targetFlat: devClassification.guideline?.targetFlat,
            apiKey: devApiKey,
            db
          });
          if (aiSynthesized && aiSynthesized.ruleText) {
            finalGuideline = {
              ...devClassification.guideline,
              text: aiSynthesized.ruleText,
              category: aiSynthesized.category || devClassification.guideline?.category,
              sample: aiSynthesized.sampleResponse,
              sampleResponse: aiSynthesized.sampleResponse
            };
          }
        } catch (err) {
          console.warn("[WhatsApp AI Developer Mode] Erro na síntese via IA, mantendo heurística:", err?.message || err);
        }
      }

      console.log(`[WhatsApp AI Developer Mode] Treinamento Factual recebido de ${cleanTarget}:`, finalGuideline);
      const newGuideline = saveDeveloperGuideline(db, finalGuideline);
      if (typeof saveDatabase === "function") {
        try { saveDatabase("developer_guideline_saved"); } catch (_) {}
      }

      const confirmationText = formatDeveloperCoachingConfirmation({
        newGuideline,
        sampleResponse: newGuideline.sampleResponse || newGuideline.sample,
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
  const isDevCoaching = isDev && classifyDeveloperMessage(incomingInfo.text, db)?.type !== "guest_simulation";
  if (isQuestion && !isMapped && needsHandoverOrFallback && !isDevCoaching) {
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
  let unmetDemand = aiResult.unmetDemand || null;
  const isActionDisabled = Boolean(
    aiResult.functionResult?.error === "ACTION_DISABLED" ||
    (aiResult.requiresHandover && aiResult.functionCall)
  );
  const actionTarget = aiResult.functionCall?.name || (aiResult.functionResult?.action || null);
  const demandClassification = classifyUnmetDemand(incomingInfo.text, isActionDisabled ? actionTarget : null);
  const isOperationalDemand = demandClassification.category !== "outros" && demandClassification.category !== "operacoes_sistema_pausadas";
  const isMissingSystemDataOrCapability = Boolean(aiResult.missingDataOrCapability || (isQuestion && !isMapped && needsHandoverOrFallback));

  if (!unmetDemand && (isActionDisabled || aiResult.shouldHandover || aiResult.requiresHandover || isOperationalDemand || isMissingSystemDataOrCapability)) {
    try {
      unmetDemand = detectAndRecordUnmetDemand({
        db,
        text: incomingInfo.text,
        senderPhone: incomingInfo.senderPhone || cleanTarget,
        senderName: incomingInfo.senderName || conv?.name || "Hóspede",
        guestContext: aiResult.guestContext || null,
        actionTarget: isActionDisabled ? actionTarget : null,
        reason: isActionDisabled ? "action_disabled" : ((aiResult.shouldHandover || aiResult.missingDataOrCapability) ? "capability_missing" : "requires_operator"),
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

/**
 * Refinamento e Regeneração de Sugestões de Respostas de FAQ com IA
 * Permite ao operador indicar qual a resposta correta ou o que deseja mudar,
 * gerando 3 opções contextualizadas e formatadas para WhatsApp.
 */
export async function generateFaqResponseSuggestions({
  question = "",
  currentAnswer = "",
  instruction = "",
  category = "estrutura_flat",
  db = null,
  aiConfig = null
}) {
  const cfg = aiConfig || getWhatsAppAiConfig(db);
  const kb = cfg.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const apiKey = process.env.GEMINI_API_KEY || db?.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  const cleanInstruction = String(instruction || "").trim();
  const cleanQuestion = String(question || "").trim();

  // 1. Se houver chave Gemini, tenta gerar alternativas via LLM
  if (apiKey) {
    try {
      const systemInstruction = `Você é o redator oficial do FAQ e das respostas da Sofia (Concierge Virtual da CorpFlats Hotéis).
Seu objetivo é gerar opções de respostas profissionais, corretas e acolhedoras para WhatsApp com base na orientação do operador.

[DADOS DO HOTEL CORPFLATS]:
- Endereço: ${kb.address}
- Check-in: ${kb.checkinTime} | Check-out: ${kb.checkoutTime}
- Wi-Fi: Individual por flat (apto {número}), senha ${kb.wifiPassword}
- Estrutura e Comodidades: ${kb.amenities}
- Café da manhã: ${kb.breakfastInfo}
- Garagem: ${kb.garageInfo}
- Pets: ${kb.petPolicy}
- Lazer: ${kb.leisureInfo || "Piscina/jacuzzi aquecida e academia na cobertura 06h às 22h"}

[REGRAS DE FORMATAÇÃO WHATSAPP]:
- Use *negrito* para termos-chave e horários.
- Use emojis elegantes e moderados (ex: ✨, 🏨, 🛎️, ☕, 🚗).
- Não use markdown complexo como tabelas ou títulos (#); apenas formatação nativa de WhatsApp.
- Gere EXATAMENTE 3 opções com propostas de tom distintas:
  1. "Direta & Objetiva" (1 a 2 frases concisas, ideal para quem quer rapidez)
  2. "Completa & Acolhedora" (mais calorosa, trazendo detalhes úteis e acolhimento)
  3. "Executiva & Formal" (tom profissional e corporativo)`;

      const prompt = `[PERGUNTA DO HÓSPEDE]:
"${cleanQuestion}"

[RESPOSTA ANTERIOR / SUGERIDA]:
"${currentAnswer || "Nenhuma"}"

[ORIENTAÇÃO DO OPERADOR / O QUE DEVE SER DITO OU MUDADO]:
"${cleanInstruction}"

Retorne EXCLUSIVAMENTE um objeto JSON no seguinte formato:
{
  "suggestions": [
    { "id": "opt_1", "label": "Direta & Objetiva", "text": "..." },
    { "id": "opt_2", "label": "Completa & Acolhedora", "text": "..." },
    { "id": "opt_3", "label": "Executiva & Formal", "text": "..." }
  ]
}`;

      const res = await callGeminiAi({
        apiKey,
        systemInstruction,
        prompt,
        db,
        customPrompt: true
      });

      if (res?.ok && res?.text) {
        const jsonMatch = res.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
            return {
              success: true,
              source: "gemini",
              suggestions: parsed.suggestions.map((s, idx) => ({
                id: s.id || `opt_${idx + 1}`,
                label: s.label || (idx === 0 ? "Direta & Objetiva" : (idx === 1 ? "Completa & Acolhedora" : "Executiva & Formal")),
                text: String(s.text || "").trim()
              }))
            };
          }
        }
      }
    } catch (llmErr) {
      console.warn("[FAQ Suggestion Refinement] Gemini falhou ou indisponível, gerando via motor heurístico inteligente:", llmErr.message);
    }
  }

  // 2. Motor Heurístico Contextual Inteligente (Geração garantida 100% offline / resiliente)
  let cleanDir = cleanInstruction
    .replace(/^(?:dizer\s+que|informar\s+que|explicar\s+que|falar\s+que|responder\s+que)\s+/i, "")
    .replace(/^(?:diga\s+que|informe\s+que|explique\s+que|fale\s+que|responda\s+que)\s+/i, "")
    .trim();

  // Se o usuário digitou apenas "Sim" ou "Não"
  if (/^sim[.!]*$/i.test(cleanDir)) {
    cleanDir = generateIntelligentFaqDraft(cleanQuestion, db, category) || "temos essa comodidade à disposição";
    cleanDir = cleanDir.replace(/^Sim!\s*/i, "").trim();
  } else if (/^n[aã]o[.!]*$/i.test(cleanDir)) {
    cleanDir = "não dispomos dessa comodidade no momento";
  }

  // Se não foi fornecida instrução, gera rascunho com base na pergunta
  if (!cleanDir) {
    cleanDir = generateIntelligentFaqDraft(cleanQuestion, db, category) || "nossos flats dispõem de acomodação executiva completa com total conforto";
    cleanDir = cleanDir.replace(/^Sim!\s*/i, "").trim();
  }

  // Verifica se é uma instrução negativa / restritiva
  const isNegative = /^(?:n[aã]o|nunca|proibid[ao]|sem\b|indispon[ií]vel)/i.test(cleanDir) ||
                     /\b(?:n[aã]o\s+(?:temos|h[aá]|possu[ií]|aceita|permite|disp[oõ]e|conta|fornece|est[aá]|pode)|proibid[ao]\s+|sem\s+(?:vaga|estrutura|micro|aceite)|indispon[ií]vel)\b/i.test(cleanDir);

  // Normaliza o texto principal mantendo verbos e substantivos intactos
  let coreDirective = cleanDir
    .replace(/^sim[,!]\s*/i, "")
    .replace(/^n[aã]o,\s*(?:n[aã]o\s+)?/i, "não ")
    .trim();

  if (isNegative && !/^n[aã]o\b/i.test(coreDirective)) {
    if (/^proibid[ao]\b/i.test(coreDirective)) {
      coreDirective = `é ${coreDirective}`;
    } else if (/^(?:sem\b|indispon[ií]vel)/i.test(coreDirective)) {
      coreDirective = `está ${coreDirective}`;
    } else {
      coreDirective = `não ${coreDirective}`;
    }
  }

  // Normalização de capitalização
  coreDirective = coreDirective.charAt(0).toLowerCase() + coreDirective.slice(1);
  coreDirective = coreDirective.replace(/[.!?]+$/, "");

  let opt1 = "";
  let opt2 = "";
  let opt3 = "";

  if (isNegative) {
    opt1 = `Olá! ✨ Informamos que ${coreDirective}. Qualquer dúvida, estamos à total disposição! 🏨`;
    opt2 = `Olá! ✨ No momento, ${coreDirective}. Nosso time está à disposição caso necessite de qualquer assistência ou comodidade adicional! 😊`;
    opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para o que você precisar durante a sua hospedagem. 🛎️`;
  } else {
    const isExplicitAffirmative = /^(?:sim\b|temos\b|disp[oõ]e|conta\b|possui|pode|liberad[ao]|incluso)/i.test(coreDirective);
    const isInformative = /^(?:o\s+caf[eé]|o\s+check|a\s+voltagem|o\s+hor[aá]rio|a\s+taxa|o\s+valor|o\s+endere[cç]o|a\s+senha|a\s+rede|a\s+garagem|a\s+piscina|a\s+academia|das\b|de\s+\d|a\s+partir)/i.test(coreDirective);

    if (isExplicitAffirmative) {
      opt1 = `Olá! ✨ Sim, ${coreDirective}. Qualquer dúvida, estamos à total disposição! 🏨`;
      opt2 = `Olá! ✨ Sim, ${coreDirective}. Todos os flats da CorpFlats contam com estrutura pensada no seu conforto e praticidade. Se precisar de qualquer suporte, basta me avisar! 😊`;
      opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para o que você necessitar durante sua hospedagem. 🛎️`;
    } else if (isInformative) {
      const capitalized = coreDirective.charAt(0).toUpperCase() + coreDirective.slice(1);
      opt1 = `Olá! ✨ ${capitalized}. Qualquer dúvida, estamos à total disposição! 🏨`;
      opt2 = `Olá! ✨ ${capitalized}. Se precisar de qualquer suporte adicional, estou à disposição por aqui! 😊`;
      opt3 = `Olá! Informamos que ${coreDirective}. Permanecemos à inteira disposição durante a sua hospedagem. 🛎️`;
    } else {
      const capitalized = coreDirective.charAt(0).toUpperCase() + coreDirective.slice(1);
      opt1 = `Olá! ✨ ${capitalized}. Qualquer dúvida, estamos à disposição! 🏨`;
      opt2 = `Olá! ✨ Sim, ${coreDirective}. Nosso time CorpFlats está à total disposição caso precise de algo mais! 😊`;
      opt3 = `Olá! Confirmamos que ${coreDirective}. Permanecemos à inteira disposição para auxiliá-lo. 🛎️`;
    }
  }

  return {
    success: true,
    source: "heuristic_smart_generator",
    suggestions: [
      { id: "opt_1", label: "Direta & Objetiva", text: opt1 },
      { id: "opt_2", label: "Completa & Acolhedora", text: opt2 },
      { id: "opt_3", label: "Executiva & Formal", text: opt3 }
    ]
  };
}

