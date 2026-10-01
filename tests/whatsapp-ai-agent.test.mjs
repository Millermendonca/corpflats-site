import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  DEFAULT_AI_CONFIG,
  getWhatsAppAiConfig,
  detectHandoverIntent,
  buildGuestContext,
  generateHeuristicResponse,
  generateAiWhatsAppResponse,
  processAiInboundMessage
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

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

    initWhatsAppEngine(mockApp, () => mockDb, () => {}, () => {});

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
});

