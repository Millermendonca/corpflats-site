import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  isPotentialGuestQuestion,
  inferFaqCategory,
  extractFaqKeywords,
  isQuestionMappedInFaq,
  findExistingPendingFaq,
  autoCreatePendingFaq,
  generateHeuristicResponse,
  buildGuestContext,
  getWhatsAppAiConfig
} from "../artifacts/api-server/whatsapp-ai-service.mjs";
import {
  linkOperatorResponseToPendingFaq,
  captureOperatorResponseForFaq,
  initWhatsAppEngine
} from "../artifacts/api-server/zapi-service.mjs";

describe("Milestone 2 Challenger 2 — Bateria Empírica de Auto-Aprendizado & Captura de Operador", () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      zapiConfig: {
        instanceId: "TEST_ZAPI_CHALLENGER2",
        token: "TEST_TOKEN_CHALLENGER2",
        enabled: true,
        testModeOnly: false
      },
      settings: {
        geminiApiKey: "TEST_DUMMY_KEY"
      },
      whatsappConversations: [
        {
          phone: "5522998505276",
          name: "Carlos Drumond",
          messages: [],
          aiPaused: false
        }
      ],
      faqItems: [
        {
          id: "faq-wifi-master",
          question: "Qual é a senha do Wi-Fi?",
          answer: "A rede é CorpFlats_Hospedes e a senha é flat12345.",
          category: "wifi_tecnologia",
          keywords: ["wifi", "wi-fi", "internet", "senha"],
          variations: ["Qual a senha da internet?", "Como conecto no Wi-Fi?"],
          status: "ativo",
          scope: "all",
          clientPhones: []
        },
        {
          id: "faq-checkin-master",
          question: "Qual o horário de check-in?",
          answer: "O check-in padrão inicia às 14:00.",
          category: "checkin_acesso",
          keywords: ["check-in", "entrada", "horario"],
          variations: ["A que horas posso entrar?"],
          status: "ativo",
          scope: "all",
          clientPhones: []
        }
      ]
    };
  });

  // ── 1. Inbound Unmapped Question Auto-Detection ─────────────────────────────

  test("C1.1: Detecção e categorização de dúvidas inéditas", () => {
    // Dúvidas legítimas
    assert.equal(isPotentialGuestQuestion("Gostaria de saber se tem ferro de passar roupa no flat"), true);
    assert.equal(isPotentialGuestQuestion("Vocês têm tomada para recarga de carro elétrico no estacionamento?"), true);
    assert.equal(isPotentialGuestQuestion("Qual o horário da piscina?"), true);

    // Inferência de categorias padrão
    assert.equal(inferFaqCategory("Tem tomada para carro elétrico na garagem?"), "garagem");
    assert.equal(inferFaqCategory("Qual a senha do wi-fi da internet?"), "wifi_tecnologia");
    assert.equal(inferFaqCategory("Tem ferro de passar roupa?"), "estrutura_flat");
  });

  test("C1.2: VERIFICAÇÃO R2: 'Tudo bem?' é descartado como saudação e NÃO gera pergunta para FAQ", () => {
    // DISPATCH.md exige: "Send greetings ('Oi', 'Bom dia', 'Tudo bem?'). Verify NO pending FAQ is created."
    const isTudoBemClassifiedAsQuestion = isPotentialGuestQuestion("Tudo bem?");
    assert.equal(
      isTudoBemClassifiedAsQuestion,
      false,
      "VERIFICADO: 'Tudo bem?' é descartado como saudação e não cria pergunta pendente"
    );
  });

  test("C1.3: VERIFICAÇÃO R2: 'Aceitam pet no apartamento?' é categorizado como regras_visitas_pets", () => {
    // Categorias específicas têm precedência estrita sobre palavras genéricas de acomodação
    const category = inferFaqCategory("Aceitam cachorro no apartamento?");
    assert.equal(
      category,
      "regras_visitas_pets",
      "VERIFICADO: 'Aceitam cachorro no apartamento?' é categorizado como regras_visitas_pets"
    );
  });

  test("C1.4: VERIFICAÇÃO R2: Deduplicação com normalização de acentuação ('têm' vs 'tem')", () => {
    const db = JSON.parse(JSON.stringify(mockDb));
    // 1ª vez: pergunta com 'tem' sem acento
    const f1 = autoCreatePendingFaq({
      db,
      questionText: "Tem ferro de passar roupa?",
      senderPhone: "5522998505276",
      senderName: "Carlos Drumond"
    });
    assert.ok(f1);

    // 2ª vez: mesma dúvida com 'têm' com acento circumflexo
    const f2 = autoCreatePendingFaq({
      db,
      questionText: "Vocês têm ferro de passar roupa?",
      senderPhone: "5522998505276",
      senderName: "Carlos Drumond"
    });

    // Com normalização NFD em findExistingPendingFaq, deduplica com sucesso!
    assert.equal(
      f2.id,
      f1.id,
      "VERIFICADO: Normalização de acentos em findExistingPendingFaq previne duplicata e reutiliza ID existente"
    );
  });

  test("C1.5: Deduplicação bem-sucedida para strings com acentos idênticos", () => {
    const db = JSON.parse(JSON.stringify(mockDb));
    const f1 = autoCreatePendingFaq({
      db,
      questionText: "Tem ferro de passar roupa?",
      senderPhone: "5522998505276",
      senderName: "Carlos Drumond"
    });

    const f2 = autoCreatePendingFaq({
      db,
      questionText: "Tem ferro de passar roupa?",
      senderPhone: "5522998505276",
      senderName: "Carlos Drumond"
    });

    assert.equal(f2.id, f1.id, "Perguntas com texto idêntico são deduplicadas com sucesso");
    assert.equal(db.faqItems.filter(f => f.status === "pendente").length, 1);
  });

  // ── 2. Operator Response Capture ───────────────────────────────────────────

  test("C2.1: Captura de resposta do operador via linkOperatorResponseToPendingFaq", () => {
    const db = JSON.parse(JSON.stringify(mockDb));
    const nowIso = new Date().toISOString();

    db.faqItems.push({
      id: "faq_baby_crib",
      question: "Vocês têm berço para bebê?",
      answer: "",
      category: "estrutura_flat",
      status: "pendente",
      sourceClientPhone: "5522998505276",
      clientPhones: ["5522998505276"],
      createdAt: nowIso,
      updatedAt: nowIso
    });

    const operatorReply = "Sim, disponibilizamos berço desmontável gratuito!";
    const linked = linkOperatorResponseToPendingFaq(db, "5522998505276", operatorReply);

    assert.ok(linked, "Deve vincular resposta");
    assert.equal(linked.id, "faq_baby_crib");
    assert.equal(linked.suggestedAnswer, operatorReply);
    assert.equal(linked.status, "aguardando_aprovacao");
    assert.equal(linked.answeredBy, "operador");

    // Verifica pausa da IA na conversa
    const conv = db.whatsappConversations.find(c => c.phone === "5522998505276");
    assert.equal(conv.aiPaused, true);
    assert.equal(conv.aiPausedReason, "operator_manual_reply");
  });

  test("C2.2: Captura via endpoint HTTP POST /api/whatsapp/chats/:phone/messages", async () => {
    const routes = {};
    const mockApp = {
      get: (path, handler) => { routes[`GET ${path}`] = handler; },
      post: (path, handler) => { routes[`POST ${path}`] = handler; },
      put: (path, handler) => { routes[`PUT ${path}`] = handler; },
      delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
    };

    const endpointDb = JSON.parse(JSON.stringify(mockDb));
    endpointDb.faqItems.push({
      id: "faq_iron_test",
      question: "Tem ferro de passar roupa?",
      answer: "",
      category: "estrutura_flat",
      status: "pendente",
      sourceClientPhone: "5522998505276",
      clientPhones: ["5522998505276"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    let saved = false;
    initWhatsAppEngine(mockApp, () => endpointDb, () => { saved = true; }, () => {});

    assert.ok(routes["POST /api/whatsapp/chats/:phone/messages"], "Endpoint deve estar registrado");

    const mockReq = {
      params: { phone: "5522998505276" },
      body: { message: "Sim, temos ferro de passar e tábua na governança!" },
      protocol: "http",
      get: () => "localhost"
    };

    let responseData = null;
    let responseStatus = 200;
    const mockRes = {
      status: (s) => { responseStatus = s; return mockRes; },
      json: (d) => { responseData = d; }
    };

    await routes["POST /api/whatsapp/chats/:phone/messages"](mockReq, mockRes);

    assert.ok(responseData, "Deve retornar resposta");
    assert.ok(responseData.linkedFaq, "Deve retornar linkedFaq no payload");
    assert.equal(responseData.linkedFaq.id, "faq_iron_test");
    assert.equal(responseData.linkedFaq.status, "aguardando_aprovacao");
    assert.equal(responseData.linkedFaq.suggestedAnswer, "Sim, temos ferro de passar e tábua na governança!");

    const conv = endpointDb.whatsappConversations.find(c => c.phone === "5522998505276");
    assert.equal(conv.aiPaused, true);
    assert.equal(conv.aiPausedReason, "operator_manual_reply");
  });

  test("C2.3: Captura via webhook Z-API POST /api/whatsapp/webhook/received com fromMe: true", async () => {
    const routes = {};
    const mockApp = {
      get: (path, handler) => { routes[`GET ${path}`] = handler; },
      post: (path, handler) => { routes[`POST ${path}`] = handler; },
      put: (path, handler) => { routes[`PUT ${path}`] = handler; },
      delete: (path, handler) => { routes[`DELETE ${path}`] = handler; }
    };

    const webhookDb = JSON.parse(JSON.stringify(mockDb));
    webhookDb.faqItems.push({
      id: "faq_pool_depth",
      question: "Qual a profundidade da piscina?",
      answer: "",
      category: "lazer_condominio",
      status: "pendente",
      sourceClientPhone: "5522998505276",
      clientPhones: ["5522998505276"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    let notifications = [];
    initWhatsAppEngine(
      mockApp,
      () => webhookDb,
      () => {},
      (n) => notifications.push(n)
    );

    const webhookPayload = {
      isFromMe: true,
      fromMe: true,
      phone: "5522998505276",
      text: { message: "A piscina tem 1,40m de profundidade." }
    };

    let resData = null;
    const mockRes = {
      status: () => mockRes,
      json: (d) => { resData = d; }
    };

    await routes["POST /api/whatsapp/webhook/received"]({ body: webhookPayload }, mockRes);

    const updatedFaq = webhookDb.faqItems.find(f => f.id === "faq_pool_depth");
    assert.equal(updatedFaq.status, "aguardando_aprovacao");
    assert.equal(updatedFaq.suggestedAnswer, "A piscina tem 1,40m de profundidade.");
    assert.equal(updatedFaq.answeredBy, "operador");

    const conv = webhookDb.whatsappConversations.find(c => c.phone === "5522998505276");
    assert.equal(conv.aiPaused, true);
  });

  test("C2.4: Janela de expiração de 24 horas", () => {
    const db = JSON.parse(JSON.stringify(mockDb));
    // Dúvida de 25 horas atrás
    db.faqItems.push({
      id: "faq_too_old",
      question: "Dúvida de ontem?",
      status: "pendente",
      sourceClientPhone: "5522998505276",
      createdAt: new Date(Date.now() - 25 * 3600 * 1000).toISOString()
    });

    const linked = linkOperatorResponseToPendingFaq(db, "5522998505276", "Resposta tardia");
    assert.equal(linked, null, "Não pode vincular pergunta criada há mais de 24 horas");

    const item = db.faqItems.find(f => f.id === "faq_too_old");
    assert.equal(item.status, "pendente");
    assert.equal(item.suggestedAnswer, undefined);
  });

  // ── 3. Paridade SHA-256 ────────────────────────────────────────────────────

  test("C3.1: Paridade SHA-256 entre artifacts e scripts", () => {
    for (const f of ["whatsapp-ai-service.mjs", "zapi-service.mjs"]) {
      const art = fs.readFileSync(`artifacts/api-server/${f}`);
      const scr = fs.readFileSync(`scripts/${f}`);
      const hArt = crypto.createHash("sha256").update(art).digest("hex");
      const hScr = crypto.createHash("sha256").update(scr).digest("hex");
      assert.equal(hArt, hScr, `Divergência SHA256 em ${f}`);
    }
  });
});
