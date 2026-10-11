import { test, describe, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import http from "node:http";
import {
  DEFAULT_AI_CONFIG,
  getWhatsAppAiConfig,
  detectHandoverIntent,
  buildGuestContext,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage,
  isFaqApplicableToClient,
  matchClientPhone,
  buildGeminiTools,
  getBotActionsSettings,
  executeBotAction,
  callGeminiAi
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

// Captura e gerencia servidores e timers de background para encerramento limpo sem mascaramento
const openServers = [];
const origListen = http.Server.prototype.listen;
http.Server.prototype.listen = function(...args) {
  const srv = origListen.apply(this, args);
  openServers.push(srv);
  return srv;
};

const activeIntervals = [];
const originalSetInterval = globalThis.setInterval;
globalThis.setInterval = function(...args) {
  const handle = originalSetInterval.apply(this, args);
  if (handle && typeof handle.unref === "function") {
    handle.unref();
  }
  activeIntervals.push(handle);
  return handle;
};

const activeTimeouts = [];
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function(...args) {
  const handle = originalSetTimeout.apply(this, args);
  if (handle && typeof handle.unref === "function") {
    handle.unref();
  }
  activeTimeouts.push(handle);
  return handle;
};

describe("Agente de IA para WhatsApp - Testes Unitários e de Integração", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      zapiConfig: {
        instanceId: "TEST_INSTANCE",
        token: "TEST_TOKEN",
        enabled: true,
        testModeOnly: true,
        testAllowedPhones: "22998505276, 22988486446"
      },
      settings: {
        geminiApiKey: "" // Testa contingência heurística
      },
      flats: [
        { id: 1, number: "101", status: "clean" },
        { id: 2, number: "202", status: "dirty" }
      ],
      cleaningRequests: [
        {
          id: 1010,
          flatId: 1,
          flatNumber: "101",
          requestDate: new Date().toISOString().slice(0, 10),
          status: "clean"
        },
        {
          id: 2020,
          flatId: 2,
          flatNumber: "202",
          requestDate: new Date().toISOString().slice(0, 10),
          status: "dirty"
        }
      ],
      reservations: [
        {
          id: 501,
          code: "RES-101-9999",
          guestName: "Carlos Drumond",
          guestPhone: "5522998505276",
          flatId: 1,
          flatNumber: "101",
          checkinDate: new Date().toISOString().slice(0, 10),
          checkoutDate: "2026-10-05",
          status: "confirmada"
        }
      ],
      whatsappConversations: [
        {
          id: "5522998505276",
          phone: "5522998505276",
          name: "Carlos Drumond",
          aiPaused: false,
          messages: []
        }
      ],
      notifications: []
    };
  });

  test("1. Configurações padrão do Agente de IA são inicializadas com sucesso", () => {
    const config = getWhatsAppAiConfig(mockDb);
    assert.equal(config.enabled, true);
    assert.equal(config.mode, "autonomous");
    assert.equal(config.agentName, "Sofia");
    assert.ok(Array.isArray(config.handoverKeywords));
    assert.ok(config.handoverKeywords.includes("humano"));
    assert.ok(config.knowledgeBase.wifiNetwork);
    assert.ok(config.knowledgeBase.wifiPassword);
  });

  test("2. Detecção precisa de intenção de transbordo humano", () => {
    const res1 = detectHandoverIntent("Olá, gostaria de falar com um atendente humano por favor");
    assert.equal(res1.shouldHandover, true);

    const res2 = detectHandoverIntent("Me passa para a recepção");
    assert.equal(res2.shouldHandover, true);

    const res3 = detectHandoverIntent("Quero reclamar da limpeza do banheiro");
    assert.equal(res3.shouldHandover, true);

    const res4 = detectHandoverIntent("Qual a senha do wifi?");
    assert.equal(res4.shouldHandover, false);

    const res5 = detectHandoverIntent("Meu quarto já está pronto?");
    assert.equal(res5.shouldHandover, false);
  });

  test("3. Contexto em tempo real identifica hóspede com check-in hoje e flat limpo", () => {
    const ctx = buildGuestContext(mockDb, "5522998505276");
    assert.equal(ctx.hasReservation, true);
    assert.equal(ctx.guestName, "Carlos Drumond");
    assert.equal(ctx.flatNumber, "101");
    assert.equal(ctx.stayStatus, "checkin_hoje");
    assert.equal(ctx.isRoomReady, true);
  });

  test("4. Contexto em tempo real para contato sem reserva (Lead)", () => {
    const ctx = buildGuestContext(mockDb, "5521999998888");
    assert.equal(ctx.hasReservation, false);
    assert.equal(ctx.stayStatus, "sem_reserva_ativa");
  });

  test("5. Resposta Heurística atende dúvidas essenciais com dados da base", () => {
    const ctx = buildGuestContext(mockDb, "5522998505276");
    const aiConfig = getWhatsAppAiConfig(mockDb);

    // Wi-Fi
    const wifiReply = generateHeuristicResponse("Como conecto na internet? Qual a senha do wifi?", ctx, aiConfig);
    assert.ok(wifiReply.includes(aiConfig.knowledgeBase.wifiPassword));
    assert.ok(wifiReply.includes(aiConfig.knowledgeBase.wifiNetwork));

    // Quarto pronto
    const roomReply = generateHeuristicResponse("O flat 101 já está pronto para eu entrar?", ctx, aiConfig);
    assert.ok(roomReply.includes("Flat 101"));
    assert.ok(roomReply.includes("pronto"));

    // Check-out
    const checkoutReply = generateHeuristicResponse("Que horas tenho que fazer o check-out amanhã?", ctx, aiConfig);
    assert.ok(checkoutReply.includes(aiConfig.knowledgeBase.checkoutTime));

    // Café da manhã
    const breakfastReply = generateHeuristicResponse("Tem café da manhã no flat?", ctx, aiConfig);
    assert.ok(breakfastReply.includes("06:30 às 10:00"));

    // Localização / Endereço
    const addressReply = generateHeuristicResponse("Onde fica o hotel? Me passa o endereço", ctx, aiConfig);
    assert.ok(addressReply.includes("Pelinca"));
  });

  test("6. Transbordo Humano via processAiInboundMessage pausa a conversa e gera notificação", async () => {
    let sentMessage = null;
    const sendZapiMock = async (cfg, opts) => {
      sentMessage = opts;
      return { success: true };
    };

    let createdNotif = null;
    const createNotifMock = (n) => {
      createdNotif = n;
      mockDb.notifications.push(n);
    };

    let appendedMsg = null;
    const appendMsgMock = (db, msg) => {
      appendedMsg = msg;
      const c = db.whatsappConversations.find(conv => conv.phone === msg.phone);
      if (c) c.messages.push(msg);
    };

    const res = await processAiInboundMessage({
      db: mockDb,
      incomingInfo: {
        fromMe: false,
        isGroup: false,
        text: "Preciso falar com uma pessoa urgente",
        senderName: "Carlos Drumond"
      },
      cleanTarget: "5522998505276",
      saveDatabase: () => {},
      createNotification: createNotifMock,
      sendZapiMessage: sendZapiMock,
      appendMessageFn: appendMsgMock
    });

    assert.equal(res.handled, true);
    assert.equal(res.handover, true);
    assert.ok(sentMessage);
    assert.ok(sentMessage.message.includes("transferindo"));
    assert.ok(createdNotif);
    assert.equal(createdNotif.type, "whatsapp_handover");

    // Confirma que a conversa agora está pausada
    const conv = mockDb.whatsappConversations.find(c => c.phone === "5522998505276");
    assert.equal(conv.aiPaused, true);
    assert.equal(conv.aiPausedReason, "guest_requested_human");
  });

  test("7. Conversa pausada não é respondida pela IA", async () => {
    const conv = mockDb.whatsappConversations.find(c => c.phone === "5522998505276");
    conv.aiPaused = true;

    const res = await processAiInboundMessage({
      db: mockDb,
      incomingInfo: {
        fromMe: false,
        isGroup: false,
        text: "Qual a senha do wifi?"
      },
      cleanTarget: "5522998505276",
      saveDatabase: () => {},
      createNotification: () => {},
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {}
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, "conversation_ai_paused");
  });

  test("8. Modo de teste ignora números não autorizados", async () => {
    mockDb.zapiConfig.testModeOnly = true;
    mockDb.zapiConfig.testAllowedPhones = "5522998505276";

    const res = await processAiInboundMessage({
      db: mockDb,
      incomingInfo: {
        fromMe: false,
        isGroup: false,
        text: "Qual o valor da diária?"
      },
      cleanTarget: "5511999990000", // Não autorizado
      saveDatabase: () => {},
      createNotification: () => {},
      sendZapiMessage: async () => ({ success: true }),
      appendMessageFn: () => {}
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, "test_mode_not_allowed");
  });

  test("9. Endpoints do Agente de IA são registrados e executam com sucesso", async () => {
    const { initWhatsAppEngine } = await import("../artifacts/api-server/zapi-service.mjs");
    const routes = {};
    const mockApp = {
      get: (path, handler) => { routes[`GET ${path}`] = handler; },
      post: (path, handler) => { routes[`POST ${path}`] = handler; },
      put: (path, handler) => { routes[`PUT ${path}`] = handler; },
      delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
    };

    const endpointDb = JSON.parse(JSON.stringify(mockDb));
    endpointDb.zapiConfig.enabled = false; // Evita inicializar watchdog em testes

    initWhatsAppEngine(mockApp, () => endpointDb, () => {}, () => {});

    // Verifica se os 5 novos endpoints foram registrados
    assert.ok(routes["GET /api/whatsapp/ai-config"]);
    assert.ok(routes["POST /api/whatsapp/ai-config"]);
    assert.ok(routes["POST /api/whatsapp/ai-simulate"]);
    assert.ok(routes["POST /api/whatsapp/chat/:phone/ai-toggle"]);
    assert.ok(routes["POST /api/whatsapp/chat/:phone/ai-suggest"]);

    // Testa GET /api/whatsapp/ai-config
    let resData = null;
    const mockRes = {
      json: (d) => { resData = d; return mockRes; },
      status: () => mockRes
    };
    routes["GET /api/whatsapp/ai-config"]({}, mockRes);
    assert.equal(resData.success, true);
    assert.ok(resData.aiConfig);
    assert.equal(resData.aiConfig.agentName, "Sofia");

    // Testa POST /api/whatsapp/ai-config
    let savedData = null;
    routes["POST /api/whatsapp/ai-config"]({
      body: {
        agentName: "Sofia VIP",
        responseDelaySeconds: 4
      }
    }, { json: (d) => { savedData = d; } });
    assert.equal(savedData.success, true);
    assert.equal(savedData.aiConfig.agentName, "Sofia VIP");
    assert.equal(savedData.aiConfig.responseDelaySeconds, 4);

    // Testa POST /api/whatsapp/chat/:phone/ai-toggle
    let toggleData = null;
    routes["POST /api/whatsapp/chat/:phone/ai-toggle"]({
      params: { phone: "5522998505276" },
      body: { aiPaused: true, reason: "test_toggle" }
    }, { json: (d) => { toggleData = d; } });
    assert.equal(toggleData.success, true);
    assert.equal(toggleData.aiPaused, true);
    assert.equal(toggleData.aiPausedReason, "test_toggle");

    // Testa POST /api/whatsapp/chat/:phone/ai-suggest (Copiloto)
    let suggestData = null;
    await routes["POST /api/whatsapp/chat/:phone/ai-suggest"]({
      params: { phone: "5522998505276" },
      body: { message: "Qual a senha do wifi?" }
    }, { json: (d) => { suggestData = d; }, status: () => mockRes });
    assert.equal(suggestData.success, true);
    assert.ok(suggestData.suggestion.includes("corpflats2026"));

    // Testa POST /api/whatsapp/ai-simulate
    let simData = null;
    await routes["POST /api/whatsapp/ai-simulate"]({
      body: { message: "Quero falar com um humano", phone: "5522998505276" }
    }, { json: (d) => { simData = d; }, status: () => mockRes });
    assert.equal(simData.success, true);
    assert.equal(simData.shouldHandover, true);
  });

  test("10. Integridade dos Arquivos Duplos Espelhados (SHA256)", async () => {
    const crypto = await import("crypto");
    const getHash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

    const hashAiApi = getHash("artifacts/api-server/whatsapp-ai-service.mjs");
    const hashAiScript = getHash("scripts/whatsapp-ai-service.mjs");
    assert.equal(hashAiApi, hashAiScript, "whatsapp-ai-service.mjs deve ser idêntico em artifacts e scripts");

    const hashZapiApi = getHash("artifacts/api-server/zapi-service.mjs");
    const hashZapiScript = getHash("scripts/zapi-service.mjs");
    assert.equal(hashZapiApi, hashZapiScript, "zapi-service.mjs deve ser idêntico em artifacts e scripts");

    const hashServerApi = getHash("artifacts/api-server/demo-server.mjs");
    const hashServerScript = getHash("scripts/demo-server.mjs");
    assert.equal(hashServerApi, hashServerScript, "demo-server.mjs deve ser idêntico em artifacts e scripts");
  });

  test("11. Normalização de Telefones e Matching Seguro (matchClientPhone)", () => {
    // 1. Igualdade exata
    assert.equal(matchClientPhone("5522998505276", "5522998505276"), true);

    // 2. Com e sem DDI 55
    assert.equal(matchClientPhone("22998505276", "5522998505276"), true);
    assert.equal(matchClientPhone("5522998505276", "22998505276"), true);

    // 3. Variação 8 vs 9 dígitos celular brasileiro
    assert.equal(matchClientPhone("552298505276", "5522998505276"), true);
    assert.equal(matchClientPhone("2298505276", "5522998505276"), true);

    // 4. Formatação e caracteres especiais
    assert.equal(matchClientPhone("+55 (22) 99850-5276", "5522998505276"), true);
    assert.equal(matchClientPhone("5522998505276@c.us", "22998505276"), true);

    // 5. Blindagem contra colisão de DDDs distintos (21 vs 22 com mesmo terminal)
    assert.equal(matchClientPhone("5521998505276", "5522998505276"), false);
    assert.equal(matchClientPhone("21998505276", "22998505276"), false);

    // 6. Valores inválidos ou nulos
    assert.equal(matchClientPhone("", "5522998505276"), false);
    assert.equal(matchClientPhone(null, "5522998505276"), false);
    assert.equal(matchClientPhone("123", "5522998505276"), false);
  });

  test("12. Motor de Regras de Exceção e Segmentação por Cliente (isFaqApplicableToClient)", () => {
    // 1. Escopo padrão 'all'
    const faqAll = { id: "faq-1", question: "Wi-fi?", answer: "corpflats", scope: "all", status: "ativo" };
    assert.equal(isFaqApplicableToClient(faqAll, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqAll, "5521988887777"), true);
    assert.equal(isFaqApplicableToClient(faqAll, null), true);

    // 2. Escopo 'exclude' (regra negativa)
    const faqExclude = {
      id: "faq-2",
      question: "Early checkin gratuito?",
      answer: "Apenas reservas diretas",
      scope: "exclude",
      clientPhones: ["5521999990001", "21999990002"],
      status: "ativo"
    };
    // Cliente na lista de exclusão -> não aplicável
    assert.equal(isFaqApplicableToClient(faqExclude, "5521999990001"), false);
    assert.equal(isFaqApplicableToClient(faqExclude, "+55 (21) 99999-0002"), false);
    // Cliente fora da lista de exclusão -> aplicável
    assert.equal(isFaqApplicableToClient(faqExclude, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqExclude, null), true);

    // 3. Escopo 'include_only' (regra restrita/VIP)
    const faqInclude = {
      id: "faq-3",
      question: "Tarifa com faturamento corporativo?",
      answer: "Faturamento em 15 dias",
      scope: "include_only",
      clientPhones: ["5522998505276", "22988486446"],
      status: "ativo"
    };
    // Cliente na lista de inclusão -> aplicável
    assert.equal(isFaqApplicableToClient(faqInclude, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqInclude, "22988486446"), true);
    // Cliente fora da lista -> não aplicável
    assert.equal(isFaqApplicableToClient(faqInclude, "5521999998888"), false);
    assert.equal(isFaqApplicableToClient(faqInclude, null), false);

    // 4. Status não-ativo deve ser sempre rejeitado
    const faqPending = { ...faqAll, status: "pendente" };
    assert.equal(isFaqApplicableToClient(faqPending, "5522998505276"), false);

    const faqApproval = { ...faqAll, status: "aguardando_aprovacao" };
    assert.equal(isFaqApplicableToClient(faqApproval, "5522998505276"), false);
  });

  test("13. Endpoints REST da Base de Conhecimento e FAQ (CRUD e Aprovação em 1 Clique)", async () => {
    const { initWhatsAppEngine } = await import("../artifacts/api-server/zapi-service.mjs");
    const routes = {};
    const mockApp = {
      get: (path, handler) => { routes[`GET ${path}`] = handler; },
      post: (path, handler) => { routes[`POST ${path}`] = handler; },
      put: (path, handler) => { routes[`PUT ${path}`] = handler; },
      delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
    };

    const endpointDb = {
      faqItems: [],
      zapiConfig: { enabled: false }
    };

    let saved = false;
    const saveDbMock = () => { saved = true; };

    initWhatsAppEngine(mockApp, () => endpointDb, saveDbMock, () => {});

    // 1. Verifica registro de todos os 5 endpoints do FAQ
    assert.ok(routes["GET /api/whatsapp/faq"]);
    assert.ok(routes["POST /api/whatsapp/faq"]);
    assert.ok(routes["PUT /api/whatsapp/faq/:id"]);
    assert.ok(routes["DELETE /api/whatsapp/faq/:id"]);
    assert.ok(routes["POST /api/whatsapp/faq/:id/approve"]);

    const createMockRes = () => {
      let status = 200;
      let data = null;
      return {
        status: (s) => { status = s; return { json: (d) => { data = d; } }; },
        json: (d) => { data = d; },
        getData: () => data,
        getStatus: () => status
      };
    };

    // 2. POST /api/whatsapp/faq - Criação com validação
    let res = createMockRes();
    routes["POST /api/whatsapp/faq"]({ body: {} }, res);
    assert.equal(res.getStatus(), 400);

    res = createMockRes();
    routes["POST /api/whatsapp/faq"]({
      body: {
        question: "Qual o horário da piscina?",
        category: "lazer_condominio",
        suggestedAnswer: "Das 06h às 22h na cobertura",
        status: "aguardando_aprovacao"
      }
    }, res);
    assert.equal(res.getStatus(), 201);
    const createdItem = res.getData().item;
    assert.ok(createdItem.id);
    assert.equal(createdItem.question, "Qual o horário da piscina?");
    assert.equal(createdItem.status, "aguardando_aprovacao");
    assert.equal(endpointDb.faqItems.length, 1);

    // 3. GET /api/whatsapp/faq - Listagem com filtros
    res = createMockRes();
    routes["GET /api/whatsapp/faq"]({ query: { category: "lazer_condominio" } }, res);
    assert.equal(res.getData().count, 1);

    res = createMockRes();
    routes["GET /api/whatsapp/faq"]({ query: { search: "piscina" } }, res);
    assert.equal(res.getData().count, 1);

    // 4. PUT /api/whatsapp/faq/:id - Edição
    res = createMockRes();
    routes["PUT /api/whatsapp/faq/:id"]({
      params: { id: createdItem.id },
      body: { keywords: ["piscina", "horario", "lazer"] }
    }, res);
    assert.equal(res.getData().success, true);
    assert.equal(res.getData().item.keywords.length, 3);

    // 5. POST /api/whatsapp/faq/:id/approve - Aprovação em 1 clique
    res = createMockRes();
    routes["POST /api/whatsapp/faq/:id/approve"]({
      params: { id: createdItem.id },
      body: {}
    }, res);
    assert.equal(res.getData().success, true);
    const approvedItem = res.getData().item;
    assert.equal(approvedItem.status, "ativo");
    assert.equal(approvedItem.answer, "Das 06h às 22h na cobertura");
    assert.ok(approvedItem.approvedAt);

    // 6. DELETE /api/whatsapp/faq/:id - Exclusão
    res = createMockRes();
    routes["DELETE /api/whatsapp/faq/:id"]({ params: { id: createdItem.id } }, res);
    assert.equal(res.getData().success, true);
    assert.equal(endpointDb.faqItems.length, 0);
  });

  test("14. Catálogo Oficial e Seeding Idempotente de FAQs", async () => {
    const { getOfficialFaqSeed, seedInitialFaqItems } = await import("../artifacts/api-server/demo-server.mjs");
    const seeds = getOfficialFaqSeed();
    assert.ok(Array.isArray(seeds));
    assert.ok(seeds.length >= 9, "Deve conter todos os 9 FAQs oficiais essenciais");

    // Valida presença de todos os temas oficiais mandatórios
    const requiredIds = [
      "faq-wifi",
      "faq-cafe-quarto",
      "faq-recolhimento-loucas",
      "faq-agua-frigobar",
      "faq-regras-visitas",
      "faq-regras-pets",
      "faq-checkin-14h",
      "faq-early-checkin-direto",
      "faq-checkout-12h"
    ];
    for (const reqId of requiredIds) {
      assert.ok(seeds.some(s => s.id === reqId), `Seed deve conter o item ${reqId}`);
    }

    // Testa idempotência de seedInitialFaqItems
    const testDb = { faqItems: [] };
    const firstRun = seedInitialFaqItems(testDb);
    assert.equal(firstRun, true);
    assert.equal(testDb.faqItems.length, seeds.length);

    // Segunda execução não duplica itens
    const secondRun = seedInitialFaqItems(testDb);
    assert.equal(secondRun, false);
    assert.equal(testDb.faqItems.length, seeds.length);
  });

  test("15. Persistência Atômica em Disco (atomicWriteFileSync)", async () => {
    const { atomicWriteFileSync } = await import("../artifacts/api-server/demo-server.mjs");
    const tmpDir = path.resolve("data");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const testFile = path.join(tmpDir, `.atomic_test_${Date.now()}.json`);
    const payload = JSON.stringify({ test: "atomic_ok", timestamp: Date.now() });

    atomicWriteFileSync(testFile, payload);

    assert.ok(fs.existsSync(testFile));
    const content = fs.readFileSync(testFile, "utf-8");
    assert.equal(content, payload);

    // Limpeza
    fs.unlinkSync(testFile);
  });

  test("16. Chave Mestra de Ações Desativada: Gemini é chamado com tools: [] e prompt orienta transbordo cordial", async () => {
    const disabledDb = JSON.parse(JSON.stringify(mockDb));
    disabledDb.botActionsSettings = {
      apiActionsEnabled: false,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      },
      handoverMessage: "Operações automáticas em manutenção."
    };

    // 1. buildGeminiTools retorna array vazio
    const tools = buildGeminiTools(disabledDb.botActionsSettings);
    assert.deepEqual(tools, [], "Quando apiActionsEnabled for false, tools deve ser array vazio []");

    // 2. Intercepta chamada ao Gemini para validar payload
    const originalFetch = globalThis.fetch;
    let interceptedPayload = null;
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          interceptedPayload = JSON.parse(opts.body);
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      { text: "No momento as operações automatizadas estão pausadas. Estou transferindo você para a nossa equipe humana da recepção dar continuidade! 🛎️" }
                    ]
                  }
                }
              ]
            })
          };
        }
        return originalFetch(url, opts);
      };

      disabledDb.settings.geminiApiKey = "TEST_GEMINI_KEY";
      const res = await generateAiWhatsAppResponse({
        db: disabledDb,
        phone: "5522998505276",
        messageText: "Quero reservar um quarto para o final de semana"
      });

      assert.ok(interceptedPayload, "Gemini deve ter sido chamado");
      assert.equal(interceptedPayload.tools, undefined, "tools não deve ser enviado ou deve ser vazio quando desativado");
      assert.ok(interceptedPayload.contents[0].parts[0].text.includes("OPERAÇÕES AUTOMATIZADAS PAUSADAS"), "System instruction deve instruir transbordo cordial");
      assert.ok(res.replyText.includes("transferindo"), "Resposta do Gemini deve orientar transbordo");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("17. Chave Mestra Ativada & Granularidade: apenas ferramentas permitidas em allowedActions são geradas em tools", async () => {
    const activeDb = JSON.parse(JSON.stringify(mockDb));
    activeDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: false,
        createPreReservation: false,
        commitReservation: false
      }
    };

    // 1. buildGeminiTools gera apenas as duas autorizadas
    const tools = buildGeminiTools(activeDb.botActionsSettings);
    assert.equal(tools.length, 1);
    const decls = tools[0].functionDeclarations;
    assert.equal(decls.length, 2);
    const names = decls.map(d => d.name);
    assert.ok(names.includes("checkAvailability"));
    assert.ok(names.includes("calculateQuote"));
    assert.ok(!names.includes("generatePayment"));
    assert.ok(!names.includes("createPreReservation"));
    assert.ok(!names.includes("commitReservation"));

    // 2. Chamada ao Gemini envia exatamente essas tools
    const originalFetch = globalThis.fetch;
    let interceptedPayload = null;
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          interceptedPayload = JSON.parse(opts.body);
          return {
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      { text: "Temos disponibilidade nos flats 101 e 202 para as datas solicitadas!" }
                    ]
                  }
                }
              ]
            })
          };
        }
        return originalFetch(url, opts);
      };

      activeDb.settings.geminiApiKey = "TEST_GEMINI_KEY";
      await generateAiWhatsAppResponse({
        db: activeDb,
        phone: "5522998505276",
        messageText: "Tem disponibilidade para o próximo feriado?"
      });

      assert.ok(interceptedPayload);
      assert.ok(Array.isArray(interceptedPayload.tools));
      const sentNames = interceptedPayload.tools[0].functionDeclarations.map(d => d.name);
      assert.deepEqual(sentNames, ["checkAvailability", "calculateQuote"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("18. Fluxo Multi-Turn de Function Calling: execução de ferramenta e resposta conversacional formatada", async () => {
    const multiTurnDb = JSON.parse(JSON.stringify(mockDb));
    multiTurnDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      }
    };

    const originalFetch = globalThis.fetch;
    const calls = [];
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(opts.body);
          calls.push({ url, body });

          if (calls.length === 1) {
            // Turno 1: Gemini decide chamar a ferramenta checkAvailability
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "checkAvailability",
                            args: {
                              checkIn: "2026-11-10",
                              checkOut: "2026-11-12",
                              guests: 2
                            }
                          }
                        }
                      ]
                    }
                  }
                ]
              })
            };
          } else {
            // Turno 2: Gemini recebe o resultado da função e sintetiza resposta amigável para o WhatsApp
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          text: "Ótima notícia! Temos disponibilidade confirmada para o período de 10 a 12 de novembro no Flat 101 e Flat 202. Diárias a partir de R$ 237! Deseja que eu gere uma cotação completa ou reserve agora? 🏨✨"
                        }
                      ]
                    }
                  }
                ]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      multiTurnDb.settings.geminiApiKey = "TEST_GEMINI_KEY";
      const res = await generateAiWhatsAppResponse({
        db: multiTurnDb,
        phone: "5522998505276",
        messageText: "Tem quarto livre de 10 a 12 de novembro para 2 pessoas?"
      });

      assert.equal(calls.length, 2, "Deve executar exatamente 2 turnos de requisição ao Gemini");

      // Validação do Turno 2
      const turn2Contents = calls[1].body.contents;
      const funcResponsePart = turn2Contents.find(c => c.role === "function");
      assert.ok(funcResponsePart, "Turno 2 deve conter role 'function' com o resultado da ferramenta");
      assert.equal(funcResponsePart.parts[0].functionResponse.name, "checkAvailability");
      assert.equal(funcResponsePart.parts[0].functionResponse.response.success, true);
      assert.equal(funcResponsePart.parts[0].functionResponse.response.available, true);

      // Validação da resposta final
      assert.equal(res.source, "gemini");
      assert.equal(res.shouldHandover, false);
      assert.ok(res.replyText.includes("10 a 12 de novembro"));
      assert.ok(res.replyText.includes("Flat 101"));
      assert.equal(res.functionCall.name, "checkAvailability");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("19. Transbordo Cordial quando uma Ação Específica está Desativada (ACTION_DISABLED)", async () => {
    const actionDisabledDb = JSON.parse(JSON.stringify(mockDb));
    actionDisabledDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: false, // Desativada pontualmente
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      },
      handoverMessage: "O cálculo de cotação automatizada está temporariamente suspenso para manutenção."
    };

    // 1. Execução direta de executeBotAction retorna erro e requiresHandover
    const directAction = await executeBotAction(actionDisabledDb, "calculateQuote", { checkIn: "2026-11-01", checkOut: "2026-11-03" });
    assert.equal(directAction.error, "ACTION_DISABLED");
    assert.equal(directAction.requiresHandover, true);
    assert.ok(directAction.message.includes("manutenção"));

    // 2. Simulação Multi-Turn no Agente:
    const originalFetch = globalThis.fetch;
    const calls = [];
    try {
      globalThis.fetch = async (url, opts) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const body = JSON.parse(opts.body);
          calls.push({ url, body });

          if (calls.length === 1) {
            // Turno 1 tenta chamar a ação desativada
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          functionCall: {
                            name: "calculateQuote",
                            args: { checkIn: "2026-11-01", checkOut: "2026-11-03" }
                          }
                        }
                      ]
                    }
                  }
                ]
              })
            };
          } else {
            // Turno 2 responde cordialmente orientando transbordo
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [
                        {
                          text: "O nosso sistema de cálculo de cotações automáticas está passando por uma rápida manutenção. Estou transferindo o seu atendimento agora mesmo para a nossa recepção te passar os valores com desconto! 🛎️"
                        }
                      ]
                    }
                  }
                ]
              })
            };
          }
        }
        return originalFetch(url, opts);
      };

      actionDisabledDb.settings.geminiApiKey = "TEST_GEMINI_KEY";
      const res = await generateAiWhatsAppResponse({
        db: actionDisabledDb,
        phone: "5522998505276",
        messageText: "Quanto fica a diária para o próximo feriado?"
      });

      assert.equal(calls.length, 2);
      assert.equal(res.shouldHandover, true, "Deve sinalizar transbordo humano obrigatório");
      assert.equal(res.requiresHandover, true);
      assert.ok(res.replyText.includes("transferindo"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("20. Proteção Anti-Crash e Fallback Gracioso com Timeout / Erro da API Gemini", async () => {
    const errorDb = JSON.parse(JSON.stringify(mockDb));
    errorDb.settings.geminiApiKey = "FAIL_KEY";

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url) => {
        if (typeof url === "string" && url.includes("generativelanguage.googleapis.com")) {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          throw err;
        }
        return originalFetch(url);
      };

      const res = await generateAiWhatsAppResponse({
        db: errorDb,
        phone: "5522998505276",
        messageText: "Qual a senha do wifi?"
      });

      assert.equal(res.source, "heuristic", "Deve cair na contingência heurística sem travar o processo");
      assert.equal(res.modelUsed, "heuristic_fallback");
      assert.ok(res.replyText.includes("corpflats2026"));
      assert.equal(res.shouldHandover, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  after(async () => {
    activeIntervals.forEach(h => clearInterval(h));
    activeTimeouts.forEach(h => clearTimeout(h));
    for (const srv of openServers) {
      try {
        await new Promise(r => srv.close(r));
      } catch (_) {}
    }
  });
});

