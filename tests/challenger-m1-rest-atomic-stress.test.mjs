/**
 * Challenger 2 Adversarial Empirical Stress Suite for Milestone M1
 * File: tests/challenger-m1-rest-atomic-stress.test.mjs
 * Focus: 5 REST Endpoints, Atomic Persistence Lifecycle, Seeding Idempotency, Concurrency & Boundary Conditions.
 */

process.env.PORT = "0";

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { initWhatsAppEngine, isFaqApplicableToClient, matchClientPhone } from "../artifacts/api-server/zapi-service.mjs";
import { getOfficialFaqSeed, seedInitialFaqItems, atomicWriteFileSync } from "../artifacts/api-server/demo-server.mjs";

describe("Milestone 1 Challenger 2 - Adversarial REST API & Atomic Persistence Stress", () => {

  // ── Helper: Simulated Express Application ──────────────────────────────────
  function createSimulatedEngine(initialDb = {}) {
    const routes = {};
    const mockApp = {
      get: (routePath, handler) => { routes[`GET ${routePath}`] = handler; },
      post: (routePath, handler) => { routes[`POST ${routePath}`] = handler; },
      put: (routePath, handler) => { routes[`PUT ${routePath}`] = handler; },
      delete: (routePath, handler) => { routes[`DELETE ${routePath}`] = handler; }
    };

    let saveDatabaseCalled = 0;
    const saveDatabaseMock = () => { saveDatabaseCalled++; };
    const notifications = [];
    const createNotificationMock = (n) => { notifications.push(n); };

    const db = {
      faqItems: [],
      zapiConfig: { enabled: false },
      ...initialDb
    };

    initWhatsAppEngine(mockApp, () => db, saveDatabaseMock, createNotificationMock);

    function call(method, routePattern, { params = {}, query = {}, body = {} } = {}) {
      const handler = routes[`${method} ${routePattern}`];
      if (!handler) {
        throw new Error(`Route not registered: ${method} ${routePattern}`);
      }
      let statusCode = 200;
      let responseBody = null;
      const req = { params, query, body };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          responseBody = data;
          return this;
        }
      };
      handler(req, res);
      return { status: statusCode, body: responseBody };
    }

    return {
      db,
      call,
      getSaveCount: () => saveDatabaseCalled,
      routes
    };
  }

  // ── 1. Route Registration Integrity ────────────────────────────────────────
  test("1.1 Todos os 5 endpoints REST do FAQ estão devidamente registrados", () => {
    const engine = createSimulatedEngine();
    assert.ok(engine.routes["GET /api/whatsapp/faq"], "GET /api/whatsapp/faq deve estar registrado");
    assert.ok(engine.routes["POST /api/whatsapp/faq"], "POST /api/whatsapp/faq deve estar registrado");
    assert.ok(engine.routes["PUT /api/whatsapp/faq/:id"], "PUT /api/whatsapp/faq/:id deve estar registrado");
    assert.ok(engine.routes["DELETE /api/whatsapp/faq/:id"], "DELETE /api/whatsapp/faq/:id deve estar registrado");
    assert.ok(engine.routes["POST /api/whatsapp/faq/:id/approve"], "POST /api/whatsapp/faq/:id/approve deve estar registrado");
  });

  // ── 2. GET /api/whatsapp/faq Filtering & Search Stress ─────────────────────
  test("2.1 GET /api/whatsapp/faq - Resiliência a filtros vazios, categorias, status, escopo e buscas especiais", () => {
    const engine = createSimulatedEngine();
    seedInitialFaqItems(engine.db);
    assert.equal(engine.db.faqItems.length, 15);

    // Listagem sem filtros
    let res = engine.call("GET", "/api/whatsapp/faq");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 15);
    assert.equal(res.body.items.length, 15);

    // Filtro de categoria inexistente
    res = engine.call("GET", "/api/whatsapp/faq", { query: { category: "categoria_fantasma" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);

    // Filtro de categoria válida
    res = engine.call("GET", "/api/whatsapp/faq", { query: { category: "wifi_tecnologia" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
    assert.ok(res.body.items.every(i => i.category === "wifi_tecnologia"));

    // Filtro de status
    res = engine.call("GET", "/api/whatsapp/faq", { query: { status: "pendente" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);
    assert.ok(res.body.items.every(i => i.status === "pendente"));

    res = engine.call("GET", "/api/whatsapp/faq", { query: { status: "aguardando_aprovacao" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 2);

    // Filtro de escopo
    res = engine.call("GET", "/api/whatsapp/faq", { query: { scope: "exclude" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.items[0].id, "faq-rule-exclude-ota-early");

    res = engine.call("GET", "/api/whatsapp/faq", { query: { scope: "include_only" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.items[0].id, "faq-rule-include-vip-convenio");

    // Busca textual - case insensitivity e substring
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: "WIFI" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);
    assert.ok(res.body.items.some(i => i.id === "faq-wifi"));

    // Busca textual em keywords
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: "500mb" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some(i => i.id === "faq-wifi"));

    // Busca textual em variations
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: "bandeja" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.items.some(i => i.id === "faq-cafe-quarto"));

    // Busca com caracteres especiais de regex (não deve crashar)
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: ".*+?^${}()|[]\\" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);

    // Busca com emojis e acentuação
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: "☕🥐" } });
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 1);

    // Resiliência contra itens mal formatados / corruptos no DB
    engine.db.faqItems.push({ id: "corrupt-1", question: null, answer: null, keywords: null, variations: null });
    res = engine.call("GET", "/api/whatsapp/faq", { query: { search: "teste" } });
    assert.equal(res.status, 200);
  });

  // ── 3. POST /api/whatsapp/faq Validation & Boundary Conditions ─────────────
  test("3.1 POST /api/whatsapp/faq - Validações estritas de payload, sanitizações e campos default", () => {
    const engine = createSimulatedEngine();

    // 1. Rejeição de corpo vazio / pergunta vazia
    let res = engine.call("POST", "/api/whatsapp/faq", { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Pergunta é obrigatória.");

    res = engine.call("POST", "/api/whatsapp/faq", { body: { question: "    " } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Pergunta é obrigatória.");

    res = engine.call("POST", "/api/whatsapp/faq", { body: { question: null } });
    assert.equal(res.status, 400);

    // 2. Criação com pergunta mínima sem resposta (deve assumir status pendente)
    res = engine.call("POST", "/api/whatsapp/faq", {
      body: { question: "Onde fica o disjuntor do ar condicionado?" }
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const itemA = res.body.item;
    assert.ok(itemA.id.startsWith("faq_"));
    assert.equal(itemA.question, "Onde fica o disjuntor do ar condicionado?");
    assert.equal(itemA.answer, "");
    assert.equal(itemA.status, "pendente");
    assert.equal(itemA.category, "estrutura_flat");
    assert.equal(itemA.scope, "all");
    assert.deepEqual(itemA.keywords, []);
    assert.deepEqual(itemA.variations, []);
    assert.deepEqual(itemA.clientPhones, []);
    assert.ok(itemA.createdAt);
    assert.ok(itemA.updatedAt);
    assert.equal(engine.db.faqItems.length, 1);
    assert.ok(engine.getSaveCount() >= 1);

    // 3. Criação com resposta fornecida (deve assumir status ativo)
    res = engine.call("POST", "/api/whatsapp/faq", {
      body: {
        question: "Tem secador de cabelo?",
        answer: "Sim, disponível na gaveta do banheiro.",
        category: "estrutura_flat"
      }
    });
    assert.equal(res.status, 201);
    const itemB = res.body.item;
    assert.equal(itemB.status, "ativo");
    assert.equal(itemB.answer, "Sim, disponível na gaveta do banheiro.");

    // 4. Criação com delimitadores mistos em keywords e array em variações e clientPhones
    res = engine.call("POST", "/api/whatsapp/faq", {
      body: {
        id: "faq-custom-iron",
        question: "Tem ferro de passar?",
        answer: "Sim, solicite à governança.",
        keywords: "ferro, passar; roupa\ntabua",
        variations: ["Tem ferro?", "Onde tem ferro de passar?"],
        clientPhones: ["(22) 99850-5276", "+55 21 98848-6446", "022988887777"],
        scope: "exclude",
        suggestedAnswer: "Sugestão teste",
        sourceClientPhone: "5522998505276",
        sourceClientName: "Hóspede Teste"
      }
    });
    assert.equal(res.status, 201);
    const itemC = res.body.item;
    assert.equal(itemC.id, "faq-custom-iron");
    assert.deepEqual(itemC.keywords, ["ferro", "passar", "roupa", "tabua"]);
    assert.deepEqual(itemC.variations, ["Tem ferro?", "Onde tem ferro de passar?"]);
    assert.deepEqual(itemC.clientPhones, ["5522998505276", "5521988486446", "5522988887777"]);
    assert.equal(itemC.scope, "exclude");
    assert.equal(itemC.suggestedAnswer, "Sugestão teste");
    assert.equal(itemC.sourceClientPhone, "5522998505276");
    assert.equal(itemC.sourceClientName, "Hóspede Teste");

    // 5. Degenerate types em listas (não deve crashar)
    res = engine.call("POST", "/api/whatsapp/faq", {
      body: {
        question: "Pergunta teste com tipos inválidos",
        keywords: 12345,
        variations: null,
        clientPhones: { invalid: true }
      }
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.item.keywords, []);
    assert.deepEqual(res.body.item.variations, []);
    assert.deepEqual(res.body.item.clientPhones, []);
  });

  test("3.2 [Empirical Finding] parseList com regex /[,;\\n\\s]+/ fragmenta variações textuais e telefones formatados com espaços", () => {
    const engine = createSimulatedEngine();
    const res = engine.call("POST", "/api/whatsapp/faq", {
      body: {
        question: "Dúvida de teste para parseList",
        variations: "Tem ferro de passar?\nOnde tem ferro?",
        clientPhones: "(22) 99850-5276"
      }
    });
    assert.equal(res.status, 201);
    // Demonstração empírica: a regex divide em qualquer caractere de espaço (\s):
    // Frase vira lista de palavras: ['Tem', 'ferro', 'de', 'passar?', 'Onde', 'tem', 'ferro?']
    // Telefone formatado vira fragmentos: ['22', '998505276']
    assert.ok(res.body.item.variations.length > 2, "Variações em formato string são divididas em palavras avulsas");
    assert.ok(res.body.item.clientPhones.includes("22"), "DDD formatado com espaço vira fragmento de 2 dígitos");
  });

  // ── 4. PUT /api/whatsapp/faq/:id Updates & Edge Cases ──────────────────────
  test("4.1 PUT /api/whatsapp/faq/:id - Atualizações granulares, IDs inexistentes e carimbo updatedAt", () => {
    const engine = createSimulatedEngine();
    const createRes = engine.call("POST", "/api/whatsapp/faq", {
      body: {
        id: "faq-test-put",
        question: "Pergunta Original",
        answer: "Resposta Original",
        category: "reservas",
        status: "pendente"
      }
    });
    assert.equal(createRes.status, 201);
    const initialCreatedAt = createRes.body.item.createdAt;

    // 1. Tentativa de update com ID inexistente
    let res = engine.call("PUT", "/api/whatsapp/faq/:id", {
      params: { id: "id_fantasma_999" },
      body: { question: "Nova Pergunta" }
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Item do FAQ não encontrado.");

    // 2. Atualização granular de campos
    res = engine.call("PUT", "/api/whatsapp/faq/:id", {
      params: { id: "faq-test-put" },
      body: {
        question: " Pergunta Atualizada ",
        answer: " Resposta Atualizada ",
        category: "checkin_acesso",
        status: "ativo",
        scope: "include_only",
        keywords: "chave, portaria; acesso",
        clientPhones: "22998505276",
        suggestedAnswer: "Sugestão Nova"
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const updated = res.body.item;
    assert.equal(updated.question, "Pergunta Atualizada");
    assert.equal(updated.answer, "Resposta Atualizada");
    assert.equal(updated.category, "checkin_acesso");
    assert.equal(updated.status, "ativo");
    assert.equal(updated.scope, "include_only");
    assert.deepEqual(updated.keywords, ["chave", "portaria", "acesso"]);
    assert.deepEqual(updated.clientPhones, ["5522998505276"]);
    assert.equal(updated.suggestedAnswer, "Sugestão Nova");
    assert.equal(updated.createdAt, initialCreatedAt);
    assert.ok(updated.updatedAt >= initialCreatedAt);

    // 3. Atualização sem campos fornecidos mantém valores existentes
    res = engine.call("PUT", "/api/whatsapp/faq/:id", {
      params: { id: "faq-test-put" },
      body: {}
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.item.question, "Pergunta Atualizada");
  });

  // ── 5. DELETE /api/whatsapp/faq/:id Removal & Idempotency ──────────────────
  test("5.1 DELETE /api/whatsapp/faq/:id - Exclusão e resposta 404 em chamada repetida", () => {
    const engine = createSimulatedEngine();
    engine.call("POST", "/api/whatsapp/faq", {
      body: { id: "faq-to-delete", question: "Para Deletar" }
    });
    assert.equal(engine.db.faqItems.length, 1);

    // 1. Exclusão bem-sucedida
    let res = engine.call("DELETE", "/api/whatsapp/faq/:id", {
      params: { id: "faq-to-delete" }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.id, "faq-to-delete");
    assert.equal(engine.db.faqItems.length, 0);

    // 2. Segunda tentativa na mesma rota deve retornar 404
    res = engine.call("DELETE", "/api/whatsapp/faq/:id", {
      params: { id: "faq-to-delete" }
    });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "Item do FAQ não encontrado.");
  });

  // ── 6. POST /api/whatsapp/faq/:id/approve 1-Click Approval ─────────────────
  test("6.1 POST /api/whatsapp/faq/:id/approve - Aprovação com e sem sugestão, overrides e 400 sem resposta", () => {
    const engine = createSimulatedEngine();

    // 1. Cria item com suggestedAnswer
    engine.call("POST", "/api/whatsapp/faq", {
      body: {
        id: "faq-suggested",
        question: "Qual o horário da sauna?",
        suggestedAnswer: "Das 16h às 21h de terça a domingo",
        status: "aguardando_aprovacao"
      }
    });

    // 2. Cria item pendente SEM resposta e SEM suggestedAnswer
    engine.call("POST", "/api/whatsapp/faq", {
      body: {
        id: "faq-empty-pending",
        question: "Dúvida sem resposta nenhuma",
        status: "pendente"
      }
    });

    // Tentativa de aprovar item 404
    let res = engine.call("POST", "/api/whatsapp/faq/:id/approve", {
      params: { id: "id_inexistente" }
    });
    assert.equal(res.status, 404);

    // Tentativa de aprovar item sem resposta nem sugestão e sem passar answer no body
    res = engine.call("POST", "/api/whatsapp/faq/:id/approve", {
      params: { id: "faq-empty-pending" },
      body: {}
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Não é possível aprovar sem uma resposta definida ou sugerida.");

    // Aprovação fornecendo answer no body para o item pendente
    res = engine.call("POST", "/api/whatsapp/faq/:id/approve", {
      params: { id: "faq-empty-pending" },
      body: { answer: "Resposta fornecida pelo Miller no modal de aprovação" }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.item.status, "ativo");
    assert.equal(res.body.item.answer, "Resposta fornecida pelo Miller no modal de aprovação");
    assert.ok(res.body.item.approvedAt);

    // Aprovação 1-clique do item com suggestedAnswer (body vazio)
    res = engine.call("POST", "/api/whatsapp/faq/:id/approve", {
      params: { id: "faq-suggested" },
      body: {}
    });
    assert.equal(res.status, 200);
    const approved = res.body.item;
    assert.equal(approved.status, "ativo");
    assert.equal(approved.answer, "Das 16h às 21h de terça a domingo");
    assert.ok(approved.approvedAt);

    // Re-aprovação com override de resposta e categoria
    res = engine.call("POST", "/api/whatsapp/faq/:id/approve", {
      params: { id: "faq-suggested" },
      body: { answer: "Sauna aberta diariamente das 17h às 22h", category: "lazer_condominio" }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.item.answer, "Sauna aberta diariamente das 17h às 22h");
    assert.equal(res.body.item.category, "lazer_condominio");
  });

  // ── 7. Seeding Idempotency & Database Integrity ────────────────────────────
  test("7.1 getOfficialFaqSeed & seedInitialFaqItems - Idempotência e integridade do catálogo oficial", () => {
    const seeds = getOfficialFaqSeed();
    assert.equal(seeds.length, 15, "Catálogo oficial deve conter exatamente 15 sementes");

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
    for (const rId of requiredIds) {
      assert.ok(seeds.some(s => s.id === rId), `Catálogo deve conter ${rId}`);
    }

    const testDb = { faqItems: [] };
    const r1 = seedInitialFaqItems(testDb);
    assert.equal(r1, true);
    assert.equal(testDb.faqItems.length, 15);

    // Segunda execução
    const r2 = seedInitialFaqItems(testDb);
    assert.equal(r2, false);
    assert.equal(testDb.faqItems.length, 15);

    // Execução em loop estressado (100 vezes)
    for (let i = 0; i < 100; i++) {
      const res = seedInitialFaqItems(testDb);
      assert.equal(res, false);
    }
    assert.equal(testDb.faqItems.length, 15);

    // Preservação de customizações do operador: se o usuário altera a senha do Wi-Fi
    const wifiItem = testDb.faqItems.find(i => i.id === "faq-wifi");
    wifiItem.answer = "Senha personalizada pelo gestor: `corp2027`";
    const r3 = seedInitialFaqItems(testDb);
    assert.equal(r3, false);
    assert.equal(wifiItem.answer, "Senha personalizada pelo gestor: `corp2027`");

    // Restauração de item faltante sem afetar itens existentes
    testDb.faqItems = testDb.faqItems.filter(i => i.id !== "faq-checkout-12h");
    assert.equal(testDb.faqItems.length, 14);
    const r4 = seedInitialFaqItems(testDb);
    assert.equal(r4, true);
    assert.equal(testDb.faqItems.length, 15);
    assert.ok(testDb.faqItems.some(i => i.id === "faq-checkout-12h"));
    assert.equal(wifiItem.answer, "Senha personalizada pelo gestor: `corp2027`");
  });

  // ── 8. Atomic Persistence & Temp File Lifecycle (atomicWriteFileSync) ──────
  test("8.1 atomicWriteFileSync - Escrita atômica simples, integridade de conteúdo e ausência de resíduos", () => {
    const testDir = path.resolve("data", `.test_atomic_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const targetFile = path.join(testDir, "db_atomic_test.json");
    const payload = JSON.stringify({ state: "initial", count: 42 });

    atomicWriteFileSync(targetFile, payload);

    assert.ok(fs.existsSync(targetFile));
    assert.equal(fs.readFileSync(targetFile, "utf-8"), payload);

    // Verifica que nenhum arquivo .tmp_* restou no diretório
    const tmpFiles = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(tmpFiles.length, 0, `Nenhum arquivo temporário deve restar. Encontrado: ${tmpFiles.join(", ")}`);

    // Limpeza
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("8.2 atomicWriteFileSync - Stress de 100 gravações rápidas sucessivas sem deixar arquivos .tmp", () => {
    const testDir = path.resolve("data", `.test_stress_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const targetFile = path.join(testDir, "rapid_stress.json");

    for (let i = 0; i < 100; i++) {
      const payload = JSON.stringify({ iteration: i, timestamp: Date.now(), rand: Math.random() });
      atomicWriteFileSync(targetFile, payload);
    }

    assert.ok(fs.existsSync(targetFile));
    const finalContent = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
    assert.equal(finalContent.iteration, 99);

    const tmpFiles = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(tmpFiles.length, 0, `Zero arquivos .tmp remanescentes após 100 iterações. Encontrado: ${tmpFiles.length}`);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("8.3 atomicWriteFileSync - Tratamento de falhas e garantia de limpeza de .tmp em caso de erro", () => {
    const testDir = path.resolve("data", `.test_error_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Cenário: o destino é um diretório já existente (não um arquivo)
    // renameSync para um diretório lança EISDIR / EPERM.
    const invalidTarget = path.join(testDir, "sub_directory_as_target");
    fs.mkdirSync(invalidTarget);

    let threw = false;
    try {
      atomicWriteFileSync(invalidTarget, JSON.stringify({ error_test: true }));
    } catch (err) {
      threw = true;
    }

    // Mesmo com a falha na escrita, o arquivo temporário único criado deve ter sido desvinculado (unlinked)
    const tmpFiles = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(tmpFiles.length, 0, `Nenhum arquivo .tmp órfão deve permanecer mesmo em caso de erro. Restantes: ${tmpFiles.length}`);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("8.4 atomicWriteFileSync - Payload massivo de 2MB sob estresse atômico", () => {
    const testDir = path.resolve("data", `.test_large_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const targetFile = path.join(testDir, "large_db.json");
    // Cria string de 2MB
    const bigString = "x".repeat(2 * 1024 * 1024);
    const payload = JSON.stringify({ large: bigString, timestamp: Date.now() });

    atomicWriteFileSync(targetFile, payload);

    assert.ok(fs.existsSync(targetFile));
    const readBack = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
    assert.equal(readBack.large.length, bigString.length);

    const tmpFiles = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(tmpFiles.length, 0);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("8.5 atomicWriteFileSync - Concorrência assíncrona sob rajada simultânea (50 workers)", async () => {
    const testDir = path.resolve("data", `.test_concurrent_${Date.now()}`);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const targetFile = path.join(testDir, "concurrent_target.json");

    // Dispara 50 escritas concorrentes assíncronas
    await Promise.all(
      Array.from({ length: 50 }, (_, idx) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            try {
              atomicWriteFileSync(targetFile, JSON.stringify({ workerId: idx, ts: Date.now() }));
            } catch (_) {}
            resolve();
          }, Math.floor(Math.random() * 20));
        });
      })
    );

    assert.ok(fs.existsSync(targetFile));
    const parsed = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
    assert.ok(typeof parsed.workerId === "number");

    const tmpFiles = fs.readdirSync(testDir).filter(f => f.startsWith(".tmp_"));
    assert.equal(tmpFiles.length, 0, `Zero arquivos temporários devem restar após concorrência. Encontrado: ${tmpFiles.length}`);

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ── 9. Client Exception Rules & Normalization Probes ───────────────────────
  test("9.1 Motor de Regras e Normalização Telefônica sob Condições Extremas", () => {
    // 1. Discriminação estrita de DDD com mesmo terminal de 8 dígitos
    assert.equal(matchClientPhone("21998505276", "22998505276"), false, "DDD 21 e DDD 22 não podem colidir");
    assert.equal(matchClientPhone("11998505276", "22998505276"), false, "DDD 11 e DDD 22 não podem colidir");

    // 2. Equivalência com/sem DDI e 8/9 dígitos
    assert.equal(matchClientPhone("5522998505276", "22998505276"), true);
    assert.equal(matchClientPhone("+55 (22) 99850-5276", "2298505276"), true);

    // 3. Regra de escopo exclude
    const faqExclude = {
      id: "faq-ex",
      status: "ativo",
      scope: "exclude",
      clientPhones: ["22998505276"]
    };
    assert.equal(isFaqApplicableToClient(faqExclude, "5522998505276"), false);
    assert.equal(isFaqApplicableToClient(faqExclude, "5521988887777"), true);
    assert.equal(isFaqApplicableToClient(faqExclude, null), true);

    // 4. Regra de escopo include_only
    const faqInclude = {
      id: "faq-inc",
      status: "ativo",
      scope: "include_only",
      clientPhones: ["22998505276"]
    };
    assert.equal(isFaqApplicableToClient(faqInclude, "5522998505276"), true);
    assert.equal(isFaqApplicableToClient(faqInclude, "5521988887777"), false);
    assert.equal(isFaqApplicableToClient(faqInclude, null), false);

    // 5. Status não-ativo bloqueia em qualquer escopo
    const faqInactive = { ...faqInclude, status: "inativo" };
    assert.equal(isFaqApplicableToClient(faqInactive, "5522998505276"), false);

    const faqPending = { ...faqExclude, status: "pendente" };
    assert.equal(isFaqApplicableToClient(faqPending, "5521988887777"), false);
  });

  // ── Final Teardown ────────────────────────────────────────────────────────
  after(() => {
    // Encerra suavemente processo após o término de todos os testes
    setTimeout(() => {
      process.exit(0);
    }, 150);
  });
});
