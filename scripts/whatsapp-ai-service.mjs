/**
 * CorpFlats / Guest Flow Manager - WhatsApp AI Agent Service
 * 
 * Recursos:
 * - Atuação Híbrida: Respostas autônomas no WhatsApp via Z-API e Copiloto para operadores
 * - Transbordo Humano Inteligente: Pausa automática da IA ao detectar pedido de atendente ou intervenção humana
 * - Reconhecimento de Contexto do Hóspede: Consulta em tempo real de reservas, flats e status de limpeza/liberação
 * - Google Gemini AI com cascata de modelos e Contingência Heurística Local garantida
 * - Base de conhecimento rica sobre o CorpFlats (Wi-Fi, garagem, café, horários, localização, comodidades)
 */

import { cleanWhatsAppPhone } from "./zapi-service.mjs";

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
  const reservations = Array.isArray(db.reservations) ? db.reservations : [];

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
  if (Array.isArray(db.guests) && cleanPhone) {
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
    if (flatNumber && Array.isArray(db.cleaningRequests)) {
      const cleanReq = db.cleaningRequests.find(c => 
        (String(c.flatNumber) === String(flatNumber) || c.flatId === flatId) &&
        (c.requestDate === todayStr || c.effectiveDate === todayStr)
      );
      if (cleanReq) {
        cleaningStatus = cleanReq.status || "pendente";
        isRoomReady = cleanReq.status === "clean" || cleanReq.completedAt != null;
      } else {
        // Se não há chamado de limpeza hoje, verifica status do flat
        const flatObj = (db.flats || []).find(f => String(f.number) === String(flatNumber) || f.id === flatId);
        if (flatObj && flatObj.status === "clean") {
          cleaningStatus = "clean";
          isRoomReady = true;
        }
      }
    }
  }

  return {
    todayStr,
    timeStr,
    phone: cleanPhone,
    guestName,
    hasReservation: Boolean(matchedReservation),
    reservation: matchedReservation ? {
      code: matchedReservation.code || matchedReservation.reservationCode || `RES-${flatNumber}`,
      guestName: matchedReservation.guestName,
      checkinDate: matchedReservation.checkinDate,
      checkoutDate: matchedReservation.checkoutDate,
      flatNumber: matchedReservation.flatNumber,
      status: matchedReservation.status,
      paymentStatus: matchedReservation.paymentStatus,
      channel: matchedReservation.channel,
      totalAmount: matchedReservation.totalAmount
    } : null,
    stayStatus,
    flatNumber,
    cleaningStatus,
    isRoomReady
  };
}

/**
 * Resposta Heurística de Contingência caso o Google Gemini esteja offline ou sem cota
 */
export function generateHeuristicResponse(messageText = "", guestContext = {}, aiConfig = DEFAULT_AI_CONFIG) {
  const text = (messageText || "").toLowerCase().trim();
  const kb = aiConfig.knowledgeBase || DEFAULT_AI_CONFIG.knowledgeBase;
  const name = guestContext.guestName ? `, ${guestContext.guestName.split(" ")[0]}` : "";

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

  // 5. Garagem / Estacionamento / Carro
  if (/garagem|estacionamento|vaga|carro|veiculo|veículo|placa/i.test(text)) {
    return `Olá${name}! 🚗 ${kb.garageInfo}\n\nSe ainda não informou os dados do veículo, pode mandar aqui a *Placa, Modelo e Cor* que já providenciamos a autorização na portaria!`;
  }

  // 6. Localização / Endereço / Onde fica
  if (/endereco|endereço|localizacao|localização|onde fica|como chegar|mapa|local/i.test(text)) {
    return `Olá${name}! 📍 Estamos localizados na *${kb.address}*.\n\nÉ um ponto nobre e privilegiado no coração da Pelinca em Campos dos Goytacazes! Se precisar de instruções de rota, nos avise. 🏨`;
  }

  // 7. Cotação / Nova Reserva / Preço
  if (/reserva|diaria|diária|preco|preço|valor|alugar|vaga|disponibilidade/i.test(text)) {
    return `Olá${name}! ✨ Será um enorme prazer receber você no CorpFlats!\n\nDispomos de 19 flats executivos finamente decorados, equipados com ar-condicionado Split, cozinha completa, Wi-Fi veloz e vaga de garagem no melhor ponto de Campos/RJ.\n\nPara consultar disponibilidade exata e garantir a melhor tarifa direta sem taxas de intermediários, acesse nosso site oficial:\n👉 ${kb.siteUrl}\n\nOu me informe as datas desejadas (entrada e saída) que posso te ajudar! 🏨`;
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
 * Chama o Google Gemini com lista de candidatos para resposta inteligente
 */
async function callGeminiAi({ apiKey, systemInstruction, prompt, history = [], db }) {
  if (!apiKey) return { ok: false, error: "Sem chave Gemini" };

  const candidateModels = [
    { ver: "v1beta", model: "gemini-2.0-flash" },
    { ver: "v1beta", model: "gemini-2.0-flash-lite" },
    { ver: "v1beta", model: "gemini-1.5-flash" },
    { ver: "v1", model: "gemini-1.5-flash" },
    { ver: "v1beta", model: "gemini-1.5-pro" }
  ];

  // Monta histórico de mensagens
  const contents = [];

  // Instrução do sistema + histórico recente
  const formattedHistory = (history || []).slice(-6).map(m => ({
    role: m.fromMe ? "model" : "user",
    parts: [{ text: String(m.text || "") }]
  })).filter(c => c.parts[0].text.trim().length > 0);

  // Adiciona instrução do sistema no primeiro prompt ou como system_instruction
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
          maxOutputTokens: 600
        }
      };

      const response = await fetch(`https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim().length > 0) {
          return { ok: true, text: text.trim(), model };
        }
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
`;

  const apiKey = process.env.GEMINI_API_KEY || db.settings?.geminiApiKey || process.env.GOOGLE_AI_API_KEY;

  // 3. Tenta responder via Google Gemini
  if (apiKey) {
    const geminiRes = await callGeminiAi({
      apiKey,
      systemInstruction: `${aiConfig.systemPrompt}\n\n${contextString}`,
      prompt: messageText,
      history,
      db
    });

    if (geminiRes.ok && geminiRes.text) {
      return {
        shouldHandover: false,
        replyText: geminiRes.text,
        guestContext,
        modelUsed: geminiRes.model,
        source: "gemini"
      };
    }
  }

  // 4. Contingência Heurística Local de Alta Precisão
  const heuristicText = generateHeuristicResponse(messageText, guestContext, aiConfig);
  return {
    shouldHandover: false,
    replyText: heuristicText,
    guestContext,
    modelUsed: "heuristic_fallback",
    source: "heuristic"
  };
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
  if (db.zapiConfig?.testModeOnly === true) {
    const allowed = String(db.zapiConfig.testAllowedPhones || "")
      .split(/[,\s]+/)
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
  const conv = (db.whatsappConversations || []).find(c => {
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
    return { handled: true, handover: true, replyText: aiResult.replyText };
  }

  // 8. Resposta Autônoma Normal:
  const delayMs = Math.max(1000, (aiConfig.responseDelaySeconds || 3) * 1000);
  await new Promise(resolve => setTimeout(resolve, delayMs));

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
    modelUsed: aiResult.modelUsed
  };
}
