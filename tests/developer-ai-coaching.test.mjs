import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

import {
  isDeveloperPhone,
  DEVELOPER_PHONES,
  cleanWhatsAppPhone,
  appendMessageToConversation,
  linkOperatorResponseToPendingFaq,
  initWhatsAppEngine
} from "../scripts/zapi-service.mjs";

import {
  classifyDeveloperMessage,
  applyToneCalibration,
  saveDeveloperGuideline,
  formatDeveloperToneConfirmation,
  formatDeveloperCoachingConfirmation,
  buildDynamicSystemInstruction,
  applyToneFormatting,
  generateHeuristicResponse,
  processAiInboundMessage,
  DEFAULT_AI_CONFIG
} from "../scripts/whatsapp-ai-service.mjs";

// ── 1. Reconhecimento de Identidade do Desenvolvedor & Imunidade a aiPaused ─────
test("R1: Reconhecimento de Telefone do Desenvolvedor (isDeveloperPhone)", () => {
  // Telefones oficiais normalizados e sem normalização
  assert.equal(isDeveloperPhone("22998505276"), true, "Deve reconhecer 11 dígitos");
  assert.equal(isDeveloperPhone("5522998505276"), true, "Deve reconhecer com DDI 55");
  assert.equal(isDeveloperPhone("+55 (22) 99850-5276"), true, "Deve reconhecer formatado");
  assert.equal(isDeveloperPhone("5522998505276@c.us"), true, "Deve reconhecer formato JID Z-API");
  assert.equal(isDeveloperPhone("+55 22 9850-5276"), true, "Deve tolerar 8 dígitos com DDD 22");

  // Telefones de hóspedes comuns não são desenvolvedores
  assert.equal(isDeveloperPhone("21997142513"), false, "Hóspede comum não é dev");
  assert.equal(isDeveloperPhone("5521997142513"), false, "Hóspede comum com DDI não é dev");
  assert.equal(isDeveloperPhone(""), false, "String vazia não é dev");
  assert.equal(isDeveloperPhone(null), false, "Null não é dev");
});

test("R1: Imunidade a aiPaused em appendMessageToConversation e linkOperatorResponse", () => {
  const db = {
    whatsappConversations: [],
    reservations: [],
    faqItems: [
      {
        id: "faq_dev",
        question: "Dúvida do dev",
        sourceClientPhone: "5522998505276",
        status: "pendente",
        createdAt: new Date().toISOString()
      },
      {
        id: "faq_guest",
        question: "Dúvida do hóspede",
        sourceClientPhone: "5521997142513",
        status: "pendente",
        createdAt: new Date().toISOString()
      }
    ],
    whatsappAiSettings: { developerGuidelines: [] }
  };

  // 1. Mensagem para o desenvolvedor cria conversa com isDeveloper: true e aiPaused: false
  const devConv = appendMessageToConversation(db, {
    phone: "22998505276",
    senderName: "Miller",
    fromMe: false,
    text: "Olá Sofia"
  });

  assert.equal(devConv.isDeveloper, true, "Conversa deve estar marcada como desenvolvedor");
  assert.equal(devConv.aiPaused, false, "Conversa de desenvolvedor nunca inicia pausada");

  // 2. Operador responde ao desenvolvedor -> NÃO deve pausar a IA
  linkOperatorResponseToPendingFaq(db, {
    clientPhone: "22998505276",
    text: "Resposta do operador"
  });
  assert.equal(devConv.aiPaused, false, "Conversa de dev não deve ser pausada por linkOperatorResponseToPendingFaq");

  // 3. Compare com hóspede normal: deve ser pausado
  const guestConv = appendMessageToConversation(db, {
    phone: "21997142513",
    senderName: "Hóspede Carlos",
    fromMe: false,
    text: "Olá"
  });
  assert.equal(guestConv.isDeveloper, false);
  linkOperatorResponseToPendingFaq(db, {
    clientPhone: "21997142513",
    text: "Resposta do operador para o hóspede"
  });
  assert.equal(guestConv.aiPaused, true, "Conversa de hóspede comum deve ser pausada após resposta do operador");
});

test("R1: Imunidade e Auto-Unpause de Desenvolvedor em processAiInboundMessage", async () => {
  const db = {
    whatsappConversations: [
      {
        id: "5522998505276",
        phone: "5522998505276",
        isDeveloper: true,
        aiPaused: true, // simulando pausa prévia acidental
        aiPausedReason: "operator_manual_reply",
        messages: []
      }
    ],
    whatsappAiSettings: { developerGuidelines: [] },
    zapiConfig: { enabled: true, testModeOnly: false }
  };

  const sentMessages = [];
  const fakeSendZapi = async (config, payload) => {
    sentMessages.push(payload);
    return { success: true, messageId: "fake_zapi_123" };
  };

  const res = await processAiInboundMessage({
    db,
    incomingInfo: { text: "Qual horário de check-in?", fromMe: false },
    cleanTarget: "5522998505276",
    saveDatabase: () => {},
    createNotification: () => {},
    sendZapiMessage: fakeSendZapi,
    appendMessageFn: appendMessageToConversation
  });

  const conv = db.whatsappConversations[0];
  assert.equal(conv.aiPaused, false, "Conversa do desenvolvedor deve ser despausada automaticamente");
  assert.ok(res.handled || !res.skipped, "Mensagem do desenvolvedor não deve ser ignorada");
  assert.ok(sentMessages.length > 0, "Deve ter enviado mensagem de resposta para o desenvolvedor");
});

// ── 2. Classificação Tri-Modal de Intenção do Desenvolvedor ────────────────────
test("R2: Classificação Tri-Modal de Mensagens do Desenvolvedor", () => {
  // A: Simulação de Hóspede (guest_simulation)
  const q1 = classifyDeveloperMessage("Qual horário de check-in?");
  assert.equal(q1.type, "guest_simulation");

  const q2 = classifyDeveloperMessage("Flat 408 está livre?");
  assert.equal(q2.type, "guest_simulation");

  const q3 = classifyDeveloperMessage("Tem Wi-Fi no flat 605?");
  assert.equal(q3.type, "guest_simulation");

  const q4 = classifyDeveloperMessage("Como funciona o café da manhã?");
  assert.equal(q4.type, "guest_simulation");

  // B: Calibração de Tom & Persona (tone_calibration)
  const t1 = classifyDeveloperMessage("responda de forma mais curta por favor");
  assert.equal(t1.type, "tone_calibration");
  assert.equal(t1.updates.conciseness, "compact");

  const t2 = classifyDeveloperMessage("use menos emojis");
  assert.equal(t2.type, "tone_calibration");
  assert.equal(t2.updates.emojiUsage, "minimal");

  const t3 = classifyDeveloperMessage("sem emojis por favor");
  assert.equal(t3.type, "tone_calibration");
  assert.equal(t3.updates.emojiUsage, "none");

  const t4 = classifyDeveloperMessage("seja mais executiva");
  assert.equal(t4.type, "tone_calibration");
  assert.equal(t4.updates.formality, "executive");

  const t5 = classifyDeveloperMessage("adote um tom mais descontraído");
  assert.equal(t5.type, "tone_calibration");
  assert.equal(t5.updates.formality, "casual");

  // C: Treinamento Factual (factual_coaching)
  const f1 = classifyDeveloperMessage("Sofia, o horário do café mudou para 06:30 às 09:30");
  assert.equal(f1.type, "factual_coaching");
  assert.equal(f1.guideline.category, "cafe");
  assert.ok(f1.guideline.text.includes("06:30"));

  const f2 = classifyDeveloperMessage("Sofia, para o flat 905 a informação correta é que tem micro-ondas e cafeteira Nespresso");
  assert.equal(f2.type, "factual_coaching");
  assert.equal(f2.guideline.targetFlat, "905");
  assert.ok(f2.guideline.text.includes("cafeteira Nespresso"));

  const f3 = classifyDeveloperMessage("Não diga que temos restaurante presencial");
  assert.equal(f3.type, "factual_coaching");
});

// ── 3. Execução de Calibração de Tom com Amostra e Persistência ───────────────
test("R2: Execução de Calibração de Tom via WhatsApp (Anti-Papagaio)", async () => {
  const db = {
    whatsappConversations: [],
    whatsappAiSettings: { developerGuidelines: [] },
    zapiConfig: {
      enabled: true,
      testModeOnly: false,
      aiAgent: {
        agentName: "Sofia",
        systemPrompt: DEFAULT_AI_CONFIG.systemPrompt
      }
    }
  };

  const sentMessages = [];
  const fakeSendZapi = async (config, payload) => {
    sentMessages.push(payload);
    return { success: true, messageId: `msg_${Date.now()}` };
  };

  const res = await processAiInboundMessage({
    db,
    incomingInfo: { text: "responda de forma mais curta por favor", fromMe: false },
    cleanTarget: "5522998505276",
    saveDatabase: () => {},
    createNotification: () => {},
    sendZapiMessage: fakeSendZapi,
    appendMessageFn: appendMessageToConversation
  });

  assert.equal(res.type, "tone_calibration");
  assert.equal(db.whatsappAiSettings.toneSettings.conciseness, "compact");
  assert.equal(db.zapiConfig.aiAgent.toneSettings.conciseness, "compact");

  // O systemPrompt base deve conter a calibração de tom preservando as regras básicas
  assert.ok(db.zapiConfig.aiAgent.systemPrompt.includes("CALIBRAÇÃO DE ESTILO & TOM"));
  assert.ok(db.zapiConfig.aiAgent.systemPrompt.includes("Soho Residence Service"), "Deve preservar regras originais do hotel");

  // Resposta para o desenvolvedor deve conter confirmação cordial + resumo + amostra
  assert.ok(sentMessages.length > 0);
  const reply = sentMessages[0].message;
  assert.ok(reply.includes("Miller"), "Deve tratar cordialmente o desenvolvedor");
  assert.ok(reply.includes("Concisão") || reply.includes("curta"), "Deve resumir a nova diretriz");
  assert.ok(reply.includes("Amostra imediata"), "Deve conter amostra imediata no novo tom");
});

// ── 4. Execução de Treinamento Factual (developerGuidelines) ───────────────────
test("R3: Execução de Treinamento Factual via WhatsApp", async () => {
  const db = {
    whatsappConversations: [],
    whatsappAiSettings: { developerGuidelines: [] },
    zapiConfig: { enabled: true, testModeOnly: false }
  };

  const sentMessages = [];
  const fakeSendZapi = async (config, payload) => {
    sentMessages.push(payload);
    return { success: true };
  };

  const res = await processAiInboundMessage({
    db,
    incomingInfo: { text: "Sofia, o horário do café mudou para 06:30 às 09:30", fromMe: false },
    cleanTarget: "5522998505276",
    saveDatabase: () => {},
    createNotification: () => {},
    sendZapiMessage: fakeSendZapi,
    appendMessageFn: appendMessageToConversation
  });

  assert.equal(res.type, "factual_coaching");
  assert.equal(db.whatsappAiSettings.developerGuidelines.length, 1);
  const g = db.whatsappAiSettings.developerGuidelines[0];
  assert.equal(g.category, "cafe");
  assert.equal(g.active, true);
  assert.ok(g.text.includes("06:30 às 09:30"));

  // Resposta para o desenvolvedor deve confirmar assimilação
  assert.ok(sentMessages.length > 0);
  assert.ok(sentMessages[0].message.includes("Nova diretriz assimilada"));
});

// ── 5. Endpoint de Retificação e CRUD de Diretrizes ───────────────────────────
test("R3 & R4: Endpoint POST /api/whatsapp/chat/:phone/correct-message e CRUD de Diretrizes", async () => {
  const db = {
    whatsappConversations: [],
    whatsappAiSettings: { developerGuidelines: [] },
    zapiConfig: { enabled: true, testModeOnly: false }
  };

  const app = express();
  app.use(express.json());

  let dbSaved = false;
  const saveDatabase = () => { dbSaved = true; };
  const createNotification = () => {};

  initWhatsAppEngine(app, () => db, saveDatabase, createNotification);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5.1 POST /api/whatsapp/chat/:phone/correct-message
    const rectRes = await fetch(`${baseUrl}/api/whatsapp/chat/5521997142513/correct-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        correctionText: "O café da manhã é servido exclusivamente em bandeja no quarto",
        rectificationMessage: "Olá! Gostaria de retificar: nosso café é servido em bandeja no quarto. ✨",
        sendToGuest: true,
        category: "cafe"
      })
    });

    assert.equal(rectRes.status, 200);
    const rectJson = await rectRes.json();
    assert.equal(rectJson.success, true);
    assert.ok(rectJson.guideline);
    assert.equal(rectJson.guideline.category, "cafe");
    assert.equal(db.whatsappAiSettings.developerGuidelines.length, 1);
    assert.equal(dbSaved, true, "Deve persistir no banco");

    // Verifica se a conversa com o hóspede registrou a retificação
    const guestConv = db.whatsappConversations.find(c => c.phone.includes("997142513"));
    assert.ok(guestConv, "Conversa deve existir no chat");
    const lastMsg = guestConv.messages[guestConv.messages.length - 1];
    assert.ok(lastMsg.text.includes("bandeja no quarto"), "Mensagem deve estar gravada no histórico");

    // 5.2 GET /api/whatsapp/developer-guidelines
    const getRes = await fetch(`${baseUrl}/api/whatsapp/developer-guidelines`);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.success, true);
    assert.equal(getJson.guidelines.length, 1);

    // 5.3 POST /api/whatsapp/developer-guidelines
    const postRes = await fetch(`${baseUrl}/api/whatsapp/developer-guidelines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Flat 408 possui cafeteira Nespresso",
        category: "flat",
        targetFlat: "408"
      })
    });
    assert.equal(postRes.status, 201);
    const postJson = await postRes.json();
    assert.equal(postJson.guideline.targetFlat, "408");
    assert.equal(db.whatsappAiSettings.developerGuidelines.length, 2);

    // 5.4 PATCH /api/whatsapp/developer-guidelines/:id
    const patchRes = await fetch(`${baseUrl}/api/whatsapp/developer-guidelines/${postJson.guideline.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false })
    });
    assert.equal(patchRes.status, 200);
    const patchJson = await patchRes.json();
    assert.equal(patchJson.guideline.active, false);

    // 5.5 DELETE /api/whatsapp/developer-guidelines/:id
    const delRes = await fetch(`${baseUrl}/api/whatsapp/developer-guidelines/${postJson.guideline.id}`, {
      method: "DELETE"
    });
    assert.equal(delRes.status, 200);
    assert.equal(db.whatsappAiSettings.developerGuidelines.length, 1);

    // 5.6 GET & POST /api/whatsapp/tone-settings
    const toneGet = await fetch(`${baseUrl}/api/whatsapp/tone-settings`);
    assert.equal(toneGet.status, 200);

    const tonePost = await fetch(`${baseUrl}/api/whatsapp/tone-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conciseness: "compact", emojiUsage: "minimal" })
    });
    assert.equal(tonePost.status, 200);
    const toneJson = await tonePost.json();
    assert.equal(toneJson.toneSettings.conciseness, "compact");
  } finally {
    server.close();
  }
});

// ── 6. Reflexo Dinâmico: Respostas ao Hóspede Refletem Diretrizes e Tom ────────
test("R4: Reflexo Dinâmico das Calibrações e Diretrizes no Atendimento ao Hóspede", () => {
  const db = {
    whatsappAiSettings: {
      toneSettings: {
        conciseness: "compact",
        emojiUsage: "none",
        formality: "casual_professional"
      },
      developerGuidelines: [
        {
          id: "g_1",
          text: "O horário do café da manhã mudou para 06:30 às 09:30 em bandeja no quarto.",
          category: "cafe",
          active: true
        },
        {
          id: "g_2",
          text: "O flat 905 conta com cafeteira Nespresso e duas toalhas extras no armário.",
          category: "flat",
          targetFlat: "905",
          active: true
        }
      ]
    }
  };

  // 1. Pergunta sobre café da manhã para hóspede comum
  const respCafe = generateHeuristicResponse(
    "Como funciona o café da manhã?",
    { guestName: "Carlos", phone: "5521997142513" },
    DEFAULT_AI_CONFIG,
    db
  );

  // Deve refletir a diretriz aprendida (06:30 às 09:30)
  assert.ok(respCafe.includes("06:30 às 09:30"), "Deve incorporar novo horário de café da manhã");
  // Deve respeitar a calibração de tom (emojiUsage: none -> sem emojis)
  assert.ok(!respCafe.includes("🥐") && !respCafe.includes("☕"), "Deve respeitar calibração sem emojis");

  // 2. Pergunta sobre flat 905
  const respFlat = generateHeuristicResponse(
    "Flat 905 tem cafeteira?",
    { guestName: "Carlos", phone: "5521997142513", flatNumber: "905" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respFlat.includes("Nespresso"), "Deve incorporar informação específica do Flat 905");

  // 3. Pergunta sobre check-in com conciseness: compact
  const respCheckin = generateHeuristicResponse(
    "Qual horário de check-in?",
    { guestName: "Carlos", phone: "5521997142513" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respCheckin.includes("14h") || respCheckin.includes("14:00"), "Deve informar check-in");
  // Compacto: não deve conter quebras de parágrafo múltiplas ou texto prolixo
  assert.ok(!respCheckin.includes("\n\n"), "Resposta compacta não deve ter parágrafos adicionais");

  // 4. Teste de buildDynamicSystemInstruction para Gemini
  const promptBlocks = buildDynamicSystemInstruction(DEFAULT_AI_CONFIG, db, { guestName: "Carlos" });
  assert.ok(promptBlocks.toneSection.includes("SEJA EXTREMAMENTE CONCISA"));
  assert.ok(promptBlocks.toneSection.includes("NÃO USE EMOJIS"));
  assert.ok(promptBlocks.guidelinesSection.includes("06:30 às 09:30"));
  assert.ok(promptBlocks.guidelinesSection.includes("flat 905"));
});

// ── 5. Correção de Checagem de Reserva & Prevenção de Falso-Positivo de FAQ ────
test("R5: Treinamento e Resposta de Confirmação de Reserva ('mijnha reserva ta confirmada?')", () => {
  // 1. Mensagem de coaching do desenvolvedor com erro de digitação ("pergiuntar")
  const coachingMsg = "Quando alguém pergiuntar se tem reserva você deve verificar se a pessoa possui reserva cadastrada para data atual ou futura";
  const classification = classifyDeveloperMessage(coachingMsg);
  assert.equal(classification.type, "factual_coaching", "Deve reconhecer como factual_coaching mesmo com erro 'pergiuntar'");
  assert.equal(classification.guideline.category, "reserva");
  assert.ok(classification.guideline.text.includes("reserva ativa para data atual ou futura"));

  const confirmation = formatDeveloperCoachingConfirmation({ newGuideline: classification.guideline });
  assert.ok(confirmation.includes("Nova diretriz assimilada"));
  assert.ok(confirmation.includes("Flat: 605") || confirmation.includes("sua reserva está confirmada"));

  // 2. Consulta de hóspede com reserva confirmada (inclusive com erro de digitação 'mijnha')
  const ctxWithRes = {
    guestName: "Miller",
    hasReservation: true,
    stayStatus: "checkin_hoje",
    flatNumber: "712",
    checkinUrl: "https://corpflats.onrender.com/pre-checkin/RES-712-0291",
    reservation: {
      flatNumber: "712",
      checkinDate: "2026-10-12",
      checkoutDate: "2026-10-13",
      status: "confirmada",
      paymentStatus: "pago_total"
    }
  };

  const respWithRes = generateHeuristicResponse("mijnha reserva ta confirmada?", ctxWithRes, DEFAULT_AI_CONFIG);
  assert.ok(respWithRes.includes("sua reserva está *confirmada*"), "Deve confirmar a reserva do hóspede");
  assert.ok(respWithRes.includes("712"), "Deve citar o Flat 712");
  assert.ok(respWithRes.includes("12/10/2026") || respWithRes.includes("12/10"), "Deve informar a data de check-in formatada");
  assert.ok(respWithRes.includes("https://corpflats.onrender.com/pre-checkin/RES-712-0291"), "Deve enviar link do pré-check-in");
  assert.ok(!respWithRes.includes("Dispomos de 19 flats"), "NÃO pode retornar apresentação comercial para quem já tem reserva");

  // 3. Consulta de hóspede sem reserva
  const ctxNoRes = {
    guestName: "Visitante",
    phone: "21988887777",
    hasReservation: false,
    stayStatus: "sem_reserva_ativa"
  };

  const respNoRes = generateHeuristicResponse("mijnha reserva ta confirmada?", ctxNoRes, DEFAULT_AI_CONFIG);
  assert.ok(respNoRes.includes("Não localizei nenhuma reserva ativa ou futura"), "Deve informar que não localizou reserva para o número");
  assert.ok(respNoRes.includes("nome completo") || respNoRes.includes("código da reserva"), "Deve solicitar nome completo ou código");
  assert.ok(!respNoRes.includes("Dispomos de 19 flats"), "NÃO pode retornar apresentação comercial genérica de 19 flats");
});

test("R5: Imunidade a Falso-Positivo em FAQ (palavra 'possui' não deve disparar ferro de passar)", () => {
  const db = {
    faqItems: [
      {
        id: "faq-pending-ferro",
        question: "O flat possui ferro e tábua de passar roupa disponíveis?",
        answer: "👔 *Ferro de Passar Roupas:*\n\nSim! Disponibilizamos ferro de passar roupas no flat.",
        category: "estrutura_flat",
        keywords: ["ferro", "ferro de passar", "tabua", "passar roupa"],
        variations: ["Tem ferro de passar no quarto?"],
        status: "ativo"
      }
    ],
    whatsappAiSettings: { developerGuidelines: [] }
  };

  // Frase longa contendo 'possui' NÃO deve acionar a FAQ de ferro
  const respMsgLonga = generateHeuristicResponse(
    "Quando alguém perguntar se tem reserva você deve verificar se a pessoa possui reserva cadastrada para data atual ou futura",
    { guestName: "Miller" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(!respMsgLonga.includes("Ferro de Passar"), "Não deve responder ferro de passar para frase sobre reserva");

  // Pergunta legítima sobre ferro DEVE acionar a FAQ de ferro
  const respFerro = generateHeuristicResponse(
    "Tem ferro de passar roupa?",
    { guestName: "Miller" },
    DEFAULT_AI_CONFIG,
    db
  );
  assert.ok(respFerro.includes("Ferro de Passar"), "Pergunta legítima deve responder FAQ de ferro");
});

