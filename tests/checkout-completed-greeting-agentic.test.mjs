/**
 * Teste Pontual: Arquitetura Agêntica 100% Contextual, Ciclo de Vida de Check-out Concluído
 * e Postura de Memória Silenciosa em Saudações (Incidente RES-116-0449)
 */

import assert from "node:assert/strict";
import {
  buildGuestContext,
  isReservationCheckoutCompleted,
  getRecentAutomatedTriggers,
  prepareAgenticPreAnalysis,
  validateAndRefineResponse,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  handleGetReservationDetails
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
  console.log("✅ [1/6] Incidente RES-116-0449 (Gatilho 01:06 + 'olá' 01:14) validado com sucesso!");
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
  console.log("✅ [2/6] Detecção multimodal de check-out concluído (Governança & Tool Calling) validada!");
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
  console.log("✅ [3/6] Postura de Memória Silenciosa em saudações ('Bom dia' vs consulta explícita) validada!");
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
  console.log("✅ [4/6] Consulta explícita de reserva após check-out concluído validada!");
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
  console.log("✅ [5/6] Pré-análise agêntica (prepareAgenticPreAnalysis) sem duplicação validada!");
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
  console.log("✅ [6/6] Sanitização de pré-check-in indevido em checkout_hoje validada!");
}

if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
if (prevGoogleKey !== undefined) process.env.GOOGLE_AI_API_KEY = prevGoogleKey;

console.log("🎉 TODOS OS TESTES PONTUAIS PASSARAM COM SUCESSO!");
