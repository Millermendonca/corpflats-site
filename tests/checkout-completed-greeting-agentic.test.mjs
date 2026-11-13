/**
 * Teste Pontual: Arquitetura Agêntica 100% Contextual, Ciclo de Vida de Check-out Concluído
 * e Postura de Memória Silenciosa em Saudações (Incidente RES-116-0449)
 */

import assert from "node:assert/strict";
import {
  buildGuestContext,
  isReservationCheckoutCompleted,
  getRecentAutomatedTriggers,
  analyzeGuestQuery,
  prepareAgenticPreAnalysis,
  validateAndRefineResponse,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  handleGetReservationDetails,
  handleGetFlatStatus
} from "../scripts/whatsapp-ai-service.mjs";

const prevGeminiKey = process.env.GEMINI_API_KEY;
const prevGoogleKey = process.env.GOOGLE_AI_API_KEY;
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_AI_API_KEY;

const nowBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const yyyy = nowBr.getFullYear();
const mm = String(nowBr.getMonth() + 1).padStart(2, "0");
const dd = String(nowBr.getDate()).padStart(2, "0");
const todayStr = `${yyyy}-${mm}-${dd}`;

const yesterdayDate = new Date(nowBr);
yesterdayDate.setDate(yesterdayDate.getDate() - 2);
const checkinPastStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

const tomorrowDate = new Date(nowBr);
tomorrowDate.setDate(tomorrowDate.getDate() + 2);
const checkoutFutureStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

console.log("=== Iniciando Teste Pontual: Check-out Concluído (RES-116-0449) & Arquitetura Agêntica ===");

// 1. Reprodução Exata do Incidente RES-116-0449 (Gatilho Check-out Concluído às 01:06 -> "olá" às 01:14)
{
  const phone = "5522999990449";
  const checkoutCompletedMsg = `🏢 *CorpFlats • Check-out Concluído*\n\nOlá, *Miller*!\nConfirmamos o encerramento da sua hospedagem referente à reserva *RES-116-0449* (Flat 116).\nAgradecemos pela preferência e esperamos recebê-lo novamente em breve!`;

  const db = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    reservations: [
      {
        id: "res_116_0449",
        code: "RES-116-0449",
        guestName: "Miller",
        guestPhone: phone,
        flatNumber: "116",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada", // Mesmo que o status da reserva ainda esteja 'confirmada'
        paymentStatus: "pago_total"
      }
    ],
    whatsappHistory: [
      {
        id: "wh_0106",
        phone,
        templateId: "tpl_checkout_completed",
        triggerEvent: "checkout_completed",
        reservationCode: "RES-116-0449",
        status: "sent",
        sentAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        message: checkoutCompletedMsg
      }
    ],
    whatsappConversations: [
      {
        id: "conv_0449",
        phone,
        contactName: "Miller",
        aiEnabled: true,
        messages: [
          {
            id: "msg_0106",
            fromMe: true,
            senderName: "Sistema (Gatilho Automático)",
            templateId: "tpl_checkout_completed",
            triggerEvent: "checkout_completed",
            text: checkoutCompletedMsg,
            timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString()
          }
        ]
      }
    ],
    cleaningRequests: [],
    unmetDemands: [],
    faqItems: []
  };

  const ctx = buildGuestContext({ db, phone, history: db.whatsappConversations[0].messages });
  assert.equal(ctx.isCheckoutCompleted, true, "Deve detectar que o check-out da reserva RES-116-0449 já foi concluído");
  assert.equal(ctx.stayStatus, "checkout_concluido", "stayStatus deve ser 'checkout_concluido'");
  assert.equal(ctx.isCheckoutDay, false, "isCheckoutDay deve ser false após check-out concluído");
  assert.equal(ctx.isHosted, false, "isHosted deve ser false após check-out concluído");
  assert.equal(ctx.checkoutUrl, null, "checkoutUrl deve ser null após check-out concluído");
  assert.equal(ctx.checkinUrl, null, "checkinUrl deve ser null após check-out concluído");
  assert.ok(ctx.recentTriggers.length >= 1, "Deve listar o gatilho recente de checkout_completed no contexto");

  const aiRes = await generateAiWhatsAppResponse({
    db,
    phone,
    messageText: "olá",
    history: db.whatsappConversations[0].messages
  });

  assert.ok(aiRes.replyText.includes("Miller"), "Deve cumprimentar o hóspede pelo nome (Miller)");
  assert.ok(!/12:00h|hor[aá]rio\s+limite\s+de\s+desocupa/i.test(aiRes.replyText), "NUNCA deve cobrar desocupação até 12:00h após check-out concluído");
  assert.ok(!/hoje\s+[eé]\s+o\s+dia\s+do\s+seu\s+check-?out/i.test(aiRes.replyText), "NUNCA deve dizer que hoje é o dia do check-out após check-out concluído");
  assert.ok(!aiRes.replyText.includes("/checkout/"), "NUNCA deve enviar link /checkout/ após check-out concluído");
  assert.ok(!aiRes.replyText.includes("/pre-checkin/"), "NUNCA deve enviar link /pre-checkin/ após check-out concluído");

  // Verifica também via processAiInboundMessage com sendZapiMessage mockada (sem disparo externo)
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  let sentPayload = null;
  const inboundRes = await processAiInboundMessage({
    db,
    incomingInfo: {
      text: "olá",
      fromMe: false,
      isGroup: false,
      senderName: "Miller",
      senderPhone: phone
    },
    cleanTarget: phone,
    sendZapiMessage: async (_cfg, payload) => {
      sentPayload = payload;
      return { ok: true };
    }
  });
  process.env.NODE_ENV = prevNodeEnv;
  assert.equal(inboundRes.handled, true, "processAiInboundMessage deve processar a saudação");
  assert.ok(sentPayload && sentPayload.message, "Deve ter enviado a resposta via sendZapiMessage mockada");
  assert.ok(!sentPayload.message.includes("/checkout/RES-116-0449"), "processAiInboundMessage não deve anexar link de check-out");
  assert.ok(!/hor[aá]rio\s+limite\s+de\s+desocupa/i.test(sentPayload.message), "processAiInboundMessage não deve cobrar saída até 12h");
  console.log("✅ [1/11] Incidente RES-116-0449 (Gatilho 01:06 + 'olá' 01:14) validado com sucesso!");
}

// 2. Detecção de Check-out Concluído via Governança (isVacant + isVacantExplicitlySet) e via Flags da Reserva
{
  const phoneGov = "5522999990450";
  const dbGov = {
    reservations: [
      {
        id: "res_gov",
        code: "RES-313-0450",
        guestName: "Carlos Silva",
        guestPhone: phoneGov,
        flatNumber: "313",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada"
      }
    ],
    cleaningRequests: [
      {
        id: "clean_313",
        flatNumber: "313",
        date: todayStr,
        status: "pending",
        isVacant: true,
        isVacantExplicitlySet: true
      }
    ],
    whatsappConversations: []
  };

  const ctxGov = buildGuestContext({ db: dbGov, phone: phoneGov });
  assert.equal(ctxGov.isCheckoutCompleted, true, "Deve detectar check-out concluído quando a governança já marcou o flat como Vago Hoje");
  assert.equal(ctxGov.stayStatus, "checkout_concluido", "stayStatus deve ser 'checkout_concluido' via governança");

  const toolRes = handleGetReservationDetails(dbGov, { reservationCode: "RES-313-0450" });
  assert.equal(toolRes.found, true);
  assert.equal(toolRes.reservation.stayStatus, "checkout_concluido", "Tool getReservationDetails deve retornar stayStatus='checkout_concluido'");
  assert.equal(toolRes.reservation.isCheckoutCompleted, true, "Tool getReservationDetails deve retornar isCheckoutCompleted=true");
  assert.equal(toolRes.reservation.checkoutUrl, null, "Tool getReservationDetails não deve retornar checkoutUrl quando já concluído");
  console.log("✅ [2/11] Detecção multimodal de check-out concluído (Governança & Tool Calling) validada!");
}

// 3. Postura Reativa Contextual (Memória Silenciosa): Saudação simples em dia de check-out pendente ("checkout_hoje")
{
  const phonePending = "5522999990500";
  const dbPending = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    reservations: [
      {
        id: "res_211_0500",
        code: "RES-211-0500",
        guestName: "Fernanda Costa",
        guestPhone: phonePending,
        flatNumber: "211",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada",
        paymentStatus: "pago_total"
      }
    ],
    whatsappConversations: [],
    cleaningRequests: []
  };

  const ctxPending = buildGuestContext({ db: dbPending, phone: phonePending });
  assert.equal(ctxPending.stayStatus, "checkout_hoje", "Deve estar em 'checkout_hoje' quando ainda não fez check-out");
  assert.equal(ctxPending.isCheckoutCompleted, false, "isCheckoutCompleted deve ser false");

  // Quando o hóspede manda apenas "olá" ou "bom dia", Sofia NÃO deve despejar cobrança de check-out nem link não solicitado!
  const greetRes = await generateAiWhatsAppResponse({
    db: dbPending,
    phone: phonePending,
    messageText: "Bom dia",
    history: []
  });

  assert.ok(greetRes.replyText.includes("Fernanda"), "Deve saudar Fernanda pelo nome");
  assert.ok(!greetRes.replyText.includes("/checkout/RES-211-0500"), "NÃO deve despejar link de check-out em uma saudação simples ('Bom dia')");
  assert.ok(!/hor[aá]rio\s+limite\s+de\s+desocupa/i.test(greetRes.replyText), "NÃO deve cobrar desocupação até 12h quando o hóspede apenas disse 'Bom dia'");

  // Porém, quando o mesmo hóspede pergunta sobre a reserva, Sofia usa a memória e fornece os detalhes completos de check-out_hoje!
  const askRes = await generateAiWhatsAppResponse({
    db: dbPending,
    phone: phonePending,
    messageText: "minha reserva está confirmada?",
    history: []
  });
  assert.ok(askRes.replyText.includes("12:00h"), "Ao perguntar da reserva em dia de saída pendente, deve informar o horário de 12:00h");
  assert.ok(askRes.replyText.includes("/checkout/RES-211-0500"), "Ao perguntar da reserva em dia de saída pendente, deve incluir o link de check-out");
  console.log("✅ [3/11] Postura de Memória Silenciosa em saudações ('Bom dia' vs consulta explícita) validada!");
}

// 4. Consulta de reserva após check-out concluído ("como está minha reserva?" / "meu check-out já foi feito?")
{
  const phoneDone = "5522999990449";
  const dbDone = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    reservations: [
      {
        id: "res_116_0449",
        code: "RES-116-0449",
        guestName: "Miller",
        guestPhone: phoneDone,
        flatNumber: "116",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "checkout_concluido",
        checkoutCompleted: true,
        paymentStatus: "pago_total"
      }
    ],
    whatsappConversations: []
  };

  const askDoneRes = await generateAiWhatsAppResponse({
    db: dbDone,
    phone: phoneDone,
    messageText: "minha reserva está confirmada?",
    history: []
  });

  assert.ok(/check-?out\s+conclu[ií]do/i.test(askDoneRes.replyText), "Deve informar claramente que o check-out já foi concluído");
  assert.ok(!askDoneRes.replyText.includes("/checkout/"), "Não deve enviar link para fazer check-out novamente");
  assert.ok(!/hor[aá]rio\s+limite\s+de\s+desocupa/i.test(askDoneRes.replyText), "Não deve cobrar desocupação até 12h");
  console.log("✅ [4/11] Consulta explícita de reserva após check-out concluído validada!");
}

// 5. Pré-Análise Agêntica (prepareAgenticPreAnalysis): pré-registro de demandas e FAQs antes da redação
{
  const phoneDemand = "5522999990600";
  const dbDemand = {
    reservations: [
      {
        id: "res_408_0600",
        code: "RES-408-0600",
        guestName: "Roberto Almeida",
        guestPhone: phoneDemand,
        flatNumber: "408",
        checkinDate: checkinPastStr,
        checkoutDate: "2099-12-31",
        status: "hospedado"
      }
    ],
    unmetDemands: [],
    faqItems: [],
    whatsappConversations: []
  };

  const ctxDemand = buildGuestContext({ db: dbDemand, phone: phoneDemand });
  const pre = prepareAgenticPreAnalysis({
    queryText: "Preciso de 2 toalhas extras e um travesseiro no flat 408 por favor",
    guestContext: ctxDemand,
    db: dbDemand,
    history: []
  });

  assert.equal(pre.analysis.type, "OPERATIONAL_DEMAND", "Deve classificar pedido de enxoval como OPERATIONAL_DEMAND na pré-análise");
  assert.ok(pre.unmetDemand, "Deve registrar a demanda em db.unmetDemands ANTES da geração do texto");
  assert.equal(dbDemand.unmetDemands.length, 1, "Deve existir exatamente 1 demanda registrada no banco após a pré-análise");
  assert.ok(pre.promptBlock.includes("DEMANDA REGISTRADA PREVIAMENTE NO SISTEMA"), "promptBlock deve informar ao LLM que a demanda já foi registrada");

  // Ao passar pelo validateAndRefineResponse com preRecordedUnmetDemand, não deve duplicar o registro
  const val = validateAndRefineResponse({
    queryText: "Preciso de 2 toalhas extras e um travesseiro no flat 408 por favor",
    candidateText: "Olá, Roberto! Já registrei seu pedido de 2 toalhas extras e travesseiro para a equipe da recepção atender no Flat 408!",
    guestContext: ctxDemand,
    db: dbDemand,
    history: [],
    preRecordedUnmetDemand: pre.unmetDemand
  });
  assert.equal(dbDemand.unmetDemands.length, 1, "Não deve duplicar a demanda na validação pós-resposta");
  assert.equal(val.unmetDemand?.id, pre.unmetDemand?.id, "Deve preservar a mesma demanda pré-registrada");
  console.log("✅ [5/11] Pré-análise agêntica (prepareAgenticPreAnalysis) sem duplicação validada!");
}

// 6. Compatibilidade com sanitização de link /pre-checkin/ indevido quando em checkout_hoje real
{
  const guestCtxCheckoutToday = {
    guestName: "Fernanda Costa",
    phone: "5522999990500",
    hasReservation: true,
    flatNumber: "211",
    stayStatus: "checkout_hoje",
    isCheckoutDay: true,
    isCheckoutCompleted: false,
    isHosted: true,
    checkinUrl: null,
    checkoutUrl: "https://corpflats.onrender.com/checkout/RES-211-0500",
    reservation: {
      code: "RES-211-0500",
      flatNumber: "211",
      checkinDate: checkinPastStr,
      checkoutDate: todayStr,
      status: "confirmada"
    }
  };

  const sanitized = validateAndRefineResponse({
    queryText: "minha reserva está confirmada?",
    candidateText: "Olá, Fernanda! Sua reserva no Flat 211 está confirmada.\n\n📋 *Pré-Check-in Digital:*\n👉 https://corpflats.onrender.com/pre-checkin/RES-211-0500",
    guestContext: guestCtxCheckoutToday,
    db: { settings: { baseUrl: "https://corpflats.onrender.com" } }
  });

  assert.ok(!sanitized.replyText.includes("pre-checkin"), "Deve remover link incorreto de pre-checkin em dia de checkout_hoje");
  assert.ok(sanitized.replyText.includes("12:00h"), "Deve incluir orientação de 12:00h quando perguntou da reserva em checkout_hoje");
  assert.ok(sanitized.replyText.includes("/checkout/RES-211-0500"), "Deve incluir link correto de checkout quando perguntou da reserva em checkout_hoje");
  console.log("✅ [6/11] Sanitização de pré-check-in indevido em checkout_hoje validada!");
}

// 7. Proteção contra Falso Positivo em Reservas Back-to-Back (Check-out concluído da reserva antiga + Check-in hoje de nova reserva)
{
  const phoneRepeat = "5522999990700";
  const oldCheckoutMsg = `🏢 *CorpFlats • Check-out Concluído*\n\nOlá, *Miller*!\nConfirmamos o encerramento da sua hospedagem referente à reserva *RES-116-0449* (Flat 116).`;

  const dbRepeat = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    flats: [{ id: "f116", number: "116" }, { id: "f215", number: "215" }],
    reservations: [
      {
        id: "449",
        code: "RES-116-0449",
        guestName: "Miller",
        guestPhone: phoneRepeat,
        flatNumber: "116",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada"
      },
      {
        id: "888",
        code: "RES-215-0888",
        guestName: "Miller",
        guestPhone: phoneRepeat,
        flatNumber: "215",
        checkinDate: todayStr,
        checkoutDate: checkoutFutureStr,
        status: "confirmada"
      }
    ],
    whatsappHistory: [
      {
        id: "wh_old",
        guestPhone: phoneRepeat,
        templateId: "tpl_checkout_completed",
        triggerEvent: "checkout_completed",
        reservationCode: "RES-116-0449",
        status: "sent",
        sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        message: oldCheckoutMsg
      }
    ],
    whatsappConversations: [
      {
        id: "conv_repeat",
        phone: phoneRepeat,
        messages: [
          {
            id: "msg_old_co",
            fromMe: true,
            triggerEvent: "checkout_completed",
            text: oldCheckoutMsg,
            timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString()
          }
        ]
      }
    ],
    cleaningRequests: []
  };

  const ctxRepeat = buildGuestContext({ db: dbRepeat, phone: phoneRepeat, history: dbRepeat.whatsappConversations[0].messages });
  assert.equal(ctxRepeat.reservationCode, "RES-215-0888", "Deve selecionar a reserva ativa de check-in hoje (RES-215-0888) em vez da que já concluiu check-out");
  assert.equal(ctxRepeat.stayStatus, "checkin_hoje", "A nova reserva que inicia hoje NÃO pode ser contaminada como checkout_concluido pelo gatilho da reserva anterior");
  assert.equal(ctxRepeat.isCheckoutCompleted, false, "isCheckoutCompleted da nova reserva deve ser false");
  assert.ok(ctxRepeat.checkinUrl && ctxRepeat.checkinUrl.includes("RES-215-0888"), "A nova reserva de checkin_hoje deve preservar seu link de pré-check-in");

  // Verifica handleGetReservationDetails por telefone (deve priorizar a reserva ativa e não a que concluiu check-out)
  const detailsByPhone = handleGetReservationDetails(dbRepeat, { phone: phoneRepeat });
  assert.equal(detailsByPhone.found, true);
  assert.equal(detailsByPhone.reservation.code, "RES-215-0888", "handleGetReservationDetails deve priorizar reserva ativa sobre reserva com check-out concluído");
  assert.equal(detailsByPhone.reservation.stayStatus, "checkin_hoje");

  // Verifica handleGetFlatStatus para o Flat 116 (cujo check-out já foi concluído hoje)
  const flat116Status = handleGetFlatStatus(dbRepeat, { flatNumber: "116" });
  assert.equal(flat116Status.success, true);
  assert.equal(flat116Status.isOccupied, false, "Flat 116 com check-out já concluído não deve constar como ocupado");
  assert.equal(flat116Status.currentGuestName, null, "Flat 116 com check-out já concluído não deve constar com hóspede atual");
  console.log("✅ [7/11] Proteção contra falso positivo em reservas back-to-back e precisão de tools validadas!");
}

// 8. Compatibilidade com Schema Real do Z-API (whatsappHistory.guestPhone + Código Canônico RES-{flat}-{id} sem r.code explícito)
{
  const phoneSchema = "5522999990449";
  const dbSchema = {
    reservations: [
      {
        id: "449", // Sem propriedade 'code' explícita no objeto da reserva
        guestName: "Miller",
        guestPhone: phoneSchema,
        flatNumber: "116",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada"
      }
    ],
    whatsappHistory: [
      {
        id: "wh_real_zapi",
        guestPhone: phoneSchema, // Propriedade real gravada pelo zapi-service.mjs
        templateId: "tpl_checkout_completed",
        triggerEvent: "checkout_completed",
        reservationCode: "RES-116-0449",
        status: "sent",
        sentAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        message: "🏢 *CorpFlats • Check-out Concluído*\nConfirmamos o encerramento da reserva *RES-116-0449*."
      }
    ],
    whatsappConversations: []
  };

  const ctxSchema = buildGuestContext({ db: dbSchema, phone: phoneSchema });
  assert.equal(ctxSchema.reservationCode, "RES-116-0449", "Deve derivar o código canônico RES-116-0449 mesmo quando r.code está ausente");
  assert.equal(ctxSchema.isCheckoutCompleted, true, "Deve detectar check-out concluído via whatsappHistory.guestPhone + código canônico");
  assert.equal(ctxSchema.stayStatus, "checkout_concluido");
  assert.equal(ctxSchema.recentTriggers.length, 1, "getRecentAutomatedTriggers deve encontrar gatilhos usando h.guestPhone");
  console.log("✅ [8/11] Compatibilidade com whatsappHistory.guestPhone e código canônico RES-{flat}-{id} validada!");
}

// 9. Comunicação de Check-out pelo Hóspede em checkout_hoje: Sem colagem contraditória da Regra 6 e sem execução duplicada
{
  const phoneCoMsg = "5522999990800";
  const dbCoMsg = {
    settings: {
      baseUrl: "https://corpflats.onrender.com"
    },
    botActionsSettings: {
      apiActionsEnabled: true,
      allowedActions: { informCheckout: true }
    },
    flats: [{ id: "f509", number: "509" }],
    reservations: [
      {
        id: "800",
        code: "RES-509-0800",
        guestName: "Lucas Mendes",
        guestPhone: phoneCoMsg,
        flatNumber: "509",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada"
      }
    ],
    cleaningRequests: [],
    whatsappConversations: []
  };

  const coRes = await generateAiWhatsAppResponse({
    db: dbCoMsg,
    phone: phoneCoMsg,
    messageText: "Bom dia! Já fiz o check-out e deixei a chave na portaria.",
    history: []
  });

  assert.ok(!/hor[aá]rio\s+limite\s+de\s+desocupa/i.test(coRes.replyText), "NÃO deve colar lembrete de desocupação até 12h quando o hóspede avisa que já saiu");
  assert.ok(!coRes.replyText.includes("/checkout/RES-509-0800"), "NÃO deve colar link /checkout/ quando o hóspede avisa que já fez o check-out");
  assert.equal(dbCoMsg.cleaningRequests.length, 1, "Deve criar/atualizar apenas 1 registro de governança (sem duplicação entre pré-análise e validação)");
  assert.equal(dbCoMsg.cleaningRequests[0].isVacant, true, "Deve marcar o flat 509 como vago na governança");
  console.log("✅ [9/11] Comunicação de check-out sem colagem contraditória da Regra 6 e sem dupla execução validada!");
}

// 10. Prioridade de Classificação: Demandas Operacionais e FAQs com palavras "minha estadia" / "minha reserva" / "estou hospedado"
{
  const phoneInStay = "5522999990900";
  const dbInStay = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    reservations: [
      {
        id: "900",
        code: "RES-605-0900",
        guestName: "Patrícia Lima",
        guestPhone: phoneInStay,
        flatNumber: "605",
        checkinDate: checkinPastStr,
        checkoutDate: todayStr,
        status: "confirmada"
      }
    ],
    unmetDemands: [],
    whatsappConversations: []
  };

  const ctxInStay = buildGuestContext({ db: dbInStay, phone: phoneInStay });

  // Caso A: Demanda operacional mencionando "minha estadia" / "estou hospedada" em dia de checkout_hoje
  const towelQuery = "Estou hospedada no flat 605 e preciso de uma toalha extra para minha estadia";
  const towelAnalysis = analyzeGuestQuery(towelQuery, ctxInStay, dbInStay);
  assert.equal(towelAnalysis.type, "OPERATIONAL_DEMAND", "Pedido de toalha extra com 'estou hospedada'/'minha estadia' deve ser OPERATIONAL_DEMAND e não EXISTING_RESERVATION");

  const towelRes = await generateAiWhatsAppResponse({
    db: dbInStay,
    phone: phoneInStay,
    messageText: towelQuery,
    history: []
  });
  assert.equal(dbInStay.unmetDemands.length, 1, "Deve registrar a demanda operacional de toalha extra");
  assert.ok(!/hor[aá]rio\s+limite\s+de\s+desocupa/i.test(towelRes.replyText), "Não deve despejar lembrete de check-out 12h ao responder demanda de toalha");
  assert.ok(!/Todos os nossos flats dispõem de:/i.test(towelRes.replyText), "Não deve responder com lista genérica de comodidades quando é uma demanda operacional de toalha");

  // Caso B: Pergunta específica de Wi-Fi mencionando "minha reserva"
  const wifiQuery = "Qual a senha do wi-fi da minha reserva?";
  const wifiAnalysis = analyzeGuestQuery(wifiQuery, ctxInStay, dbInStay);
  assert.equal(wifiAnalysis.type, "GENERIC_FAQ", "Pergunta de Wi-Fi mencionando 'minha reserva' deve ser GENERIC_FAQ");
  assert.equal(wifiAnalysis.primaryTopic, "wifi_tecnologia");
  console.log("✅ [10/11] Prioridade de classificação (OPERATIONAL_DEMAND & FAQ específico sobre EXISTING_RESERVATION) validada!");
}

// 11. Deduplicação de autoCreatePendingFaq entre prepareAgenticPreAnalysis, validateAndRefineResponse e processAiInboundMessage
{
  const phoneFaq = "5522999990950";
  const dbFaq = {
    settings: { baseUrl: "https://corpflats.onrender.com" },
    reservations: [],
    faqItems: [],
    unmetDemands: [],
    whatsappConversations: [
      {
        id: "conv_faq",
        phone: phoneFaq,
        contactName: "Visitante",
        aiEnabled: true,
        messages: []
      }
    ]
  };

  let saveCount = 0;
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  await processAiInboundMessage({
    db: dbFaq,
    incomingInfo: {
      text: "Vocês possuem heliporto privativo para helicópteros no prédio?",
      fromMe: false,
      isGroup: false,
      senderName: "Visitante",
      senderPhone: phoneFaq
    },
    cleanTarget: phoneFaq,
    saveDatabase: () => { saveCount++; },
    sendZapiMessage: async () => ({ ok: true })
  });
  process.env.NODE_ENV = prevNodeEnv;

  assert.equal(dbFaq.faqItems.length, 1, "Deve criar exatamente 1 item de FAQ pendente para pergunta inédita");
  console.log("✅ [11/11] Deduplicação de autoCreatePendingFaq no ciclo completo validada!");
}

if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
if (prevGoogleKey !== undefined) process.env.GOOGLE_AI_API_KEY = prevGoogleKey;

console.log("🎉 TODOS OS 11 TESTES PONTUAIS PASSARAM COM SUCESSO!");

