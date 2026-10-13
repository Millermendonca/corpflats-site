/**
 * Test Suite: Universal System Data Query Engine (querySystemData),
 * LGPD Privacy Protection by Profile, and Admin Copilot AI Chat Endpoint.
 * File: tests/universal-system-data-query.test.mjs
 * Execution: node --test tests/universal-system-data-query.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  querySystemData,
  handleQuerySystemData,
  executeBotAction,
  buildGeminiTools,
  getBotActionsSettings,
  generateHeuristicResponse,
  maskSensitivePhone,
  maskSensitiveCpf,
  maskSensitiveEmail,
  maskSensitiveName
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-universal-query-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Universal System Data Query & Admin Copilot Suite", () => {
  // Mock Database Fixture
  const createMockDb = () => ({
    flats: [
      {
        id: 1,
        number: "113",
        tags: ["Split ❄️", "Micro-ondas ⚡", "Casal 🛏️"],
        airConditionerType: "split",
        bedType: "casal",
        hasMicrowave: true,
        isOccupied: true,
        isActive: true
      },
      {
        id: 2,
        number: "212",
        tags: ["Janela", "2 Camas Solteiro"],
        airConditionerType: "janela",
        bedType: "2_solteiro",
        hasMicrowave: false,
        isOccupied: false,
        isActive: true
      },
      {
        id: 3,
        number: "408",
        tags: ["Split ❄️", "Casal 🛏️"],
        airConditionerType: "split",
        bedType: "casal",
        hasMicrowave: true,
        isOccupied: false,
        isActive: true
      }
    ],
    reservations: [
      {
        id: 301,
        code: "RES-113-0301",
        flatNumber: "113",
        flatId: 1,
        guestName: "Carlos Drumond de Andrade",
        guestPhone: "5522998881234",
        phone: "5522998881234",
        guestCpf: "12345678901",
        guestEmail: "carlos@drumond.com.br",
        status: "confirmada",
        paymentStatus: "pago_total",
        totalAmount: 950.0,
        paidAmount: 950.0,
        checkinDate: "2026-10-10",
        checkoutDate: "2026-10-15",
        channel: "direct"
      },
      {
        id: 302,
        code: "RES-212-0302",
        flatNumber: "212",
        flatId: 2,
        guestName: "Mariana Silva Costa",
        guestPhone: "5521987654321",
        phone: "5521987654321",
        guestCpf: "98765432100",
        guestEmail: "mariana@silva.com.br",
        status: "confirmada",
        paymentStatus: "pendente",
        totalAmount: 1200.0,
        paidAmount: 0.0,
        checkinDate: "2026-10-16",
        checkoutDate: "2026-10-20",
        channel: "booking"
      }
    ],
    cleaningRequests: [
      {
        id: 10,
        flatNumber: "113",
        flatId: 1,
        status: "clean",
        assignedUsername: "Grazi Silva",
        assignedUserId: 5,
        adminNote: "Limpeza caprichada finalizada",
        requestDate: "2026-10-10"
      },
      {
        id: 11,
        flatNumber: "212",
        flatId: 2,
        status: "dirty",
        assignedUsername: "Cris Santos",
        assignedUserId: 2,
        adminNote: "Aguardando entrada da camareira",
        requestDate: "2026-10-13"
      }
    ],
    serviceOrders: [
      {
        id: "so_1",
        title: "Manutenção do Ar-Condicionado",
        status: "active",
        token: "tok_secret_service_123",
        createdAt: "2026-10-12T10:00:00.000Z",
        flats: [
          { flatNumber: "212", status: "pending", instructions: "Verificar vazamento de gás" }
        ]
      }
    ],
    serviceWorkers: [
      {
        id: "sw_1",
        serviceOrderId: "so_1",
        token: "tok_secret_service_123",
        mainWorker: { name: "Roberto Eletricista", cpf: "11122233344" },
        vehicle: { needsGarage: true, plate: "KZZ9A88", modelColor: "Fiorino Branca" }
      }
    ],
    breakfastMenu: {
      availableTimes: ["05:00", "06:00", "07:00", "08:00", "09:00"],
      categories: [
        { id: "bebidas", name: "☕ Cafés & Bebidas", items: ["Café", "Leite", "Suco de laranja"] },
        { id: "paes", name: "🍞 Pães", items: ["Pão francês", "Pão de queijo"] }
      ]
    },
    breakfastOrders: [
      {
        id: 101,
        roomNumber: "113",
        clientName: "Carlos Drumond",
        phone: "5522998881234",
        deliveryTime: "07:30",
        items: [{ name: "Café", quantity: 1 }, { name: "Pão de queijo", quantity: 2 }],
        date: "2026-10-13"
      },
      {
        id: 102,
        roomNumber: "212",
        clientName: "Outro Hóspede",
        phone: "5521999999999",
        deliveryTime: "08:00",
        items: [{ name: "Leite", quantity: 1 }],
        date: "2026-10-13"
      }
    ],
    garageAuthorizations: [
      {
        id: 1001,
        plate: "BRA2E19",
        brand: "Toyota",
        model: "Corolla",
        guestName: "Carlos Drumond",
        flatNumber: "113",
        phone: "5522998881234",
        status: "autorizado"
      },
      {
        id: 1002,
        plate: "XYZ9999",
        brand: "Jeep",
        model: "Compass",
        guestName: "Outro Hóspede Privado",
        flatNumber: "502",
        phone: "5511988887777",
        status: "autorizado"
      }
    ],
    lostAndFound: [
      {
        id: 1,
        flatNumber: "113",
        description: "Relógio de pulso prata",
        locationInRoom: "Mesa de cabeceira",
        status: "guardado",
        lastGuestName: "Carlos Drumond",
        lastGuestPhone: "5522998881234",
        lastGuestEmail: "carlos@drumond.com.br",
        createdAt: "2026-10-09T14:00:00.000Z"
      }
    ],
    faqItems: [
      {
        id: "faq-wifi",
        question: "Qual a senha do Wi-Fi?",
        answer: "A senha do Wi-Fi é 1234567890123 na rede apto {{quarto}}.",
        status: "ativo",
        keywords: ["wifi", "internet", "senha"]
      }
    ],
    tariffSettings: {
      baseDailyRate: 237,
      weekendMarkupPct: 0.15,
      cleaningFee: 70,
      breakfastFeePerson: 35
    },
    reviews: [
      { author: "João", rating: 5, comment: "Excelente localização e flat muito limpo!", date: "2026-10-01" },
      { author: "Ana", rating: 5, comment: "Atendimento da Sofia impecável.", date: "2026-10-05" }
    ],
    guestSentiment: [
      { guestPhone: "5522998881234", overallScore: 95, overallTone: "positive" }
    ],
    npsResponses: [
      { score: 5, guestPhone: "5522998881234" }
    ],
    users: [
      { id: 1, username: "admin", role: "admin" }
    ]
  });

  // ── 1. Testes Unitários de Sanitização LGPD ──────────────────────────────────
  describe("LGPD Masking Utilities", () => {
    it("masks phone numbers correctly", () => {
      const masked = maskSensitivePhone("5522998881234");
      assert.match(masked, /\*\*\*\*\*-1234$/);
      assert.ok(!masked.includes("99888"));
    });

    it("masks CPF correctly keeping only middle fragment", () => {
      const masked = maskSensitiveCpf("12345678901");
      assert.equal(masked, "***.456.***-**");
      assert.ok(!masked.includes("123"));
      assert.ok(!masked.includes("901"));
    });

    it("masks email addresses correctly", () => {
      const masked = maskSensitiveEmail("carlos@drumond.com.br");
      assert.equal(masked, "ca***@drumond.com.br");
    });

    it("masks names preserving only initials of surnames", () => {
      const masked = maskSensitiveName("Carlos Drumond de Andrade");
      assert.equal(masked, "Carlos D*** d*** A***");
    });
  });

  // ── 2. Testes do Motor querySystemData em Todos os 10 Módulos ──────────────
  describe("querySystemData Module Support & Profiling", () => {
    const mockDb = createMockDb();

    it("Módulo flats: consulta flats com tags, amenidades e status", async () => {
      const res = await querySystemData(mockDb, {
        module: "flats",
        query: "split",
        requesterRole: "admin"
      });

      assert.equal(res.success, true);
      assert.equal(res.module, "flats");
      assert.ok(res.flats.length >= 2);
      assert.ok(res.flats.every(f => f.airConditionerType === "split"));
    });

    it("Módulo reservations: admin recebe dados completos desmascarados", async () => {
      const res = await querySystemData(mockDb, {
        module: "reservations",
        query: "RES-113",
        requesterRole: "admin"
      });

      assert.equal(res.success, true);
      assert.equal(res.reservations.length, 1);
      const r = res.reservations[0];
      assert.equal(r.guestCpf, "12345678901");
      assert.equal(r.guestPhone, "5522998881234");
      assert.equal(r.totalAmount, 950.0);
    });

    it("Módulo reservations: hóspede recebe dados mascarados de terceiros (LGPD)", async () => {
      const res = await querySystemData(mockDb, {
        module: "reservations",
        query: "Mariana",
        requesterRole: "guest",
        requesterPhone: "5522998881234" // Carlos consultando Mariana
      });

      assert.equal(res.success, true);
      assert.equal(res.reservations.length, 1);
      const r = res.reservations[0];
      assert.equal(r.guestCpf, "***.654.***-**");
      assert.ok(!r.guestPhone.includes("98765"));
      assert.equal(r.totalAmount, "[RESTRITO_LGPD]");
      assert.equal(r.paidAmount, "[RESTRITO_LGPD]");
    });

    it("Módulo reservations: hóspede consultando sua própria reserva vê seus dados", async () => {
      const res = await querySystemData(mockDb, {
        module: "reservations",
        query: "RES-113",
        requesterRole: "guest",
        requesterPhone: "5522998881234" // Carlos consultando a si mesmo
      });

      assert.equal(res.success, true);
      const r = res.reservations[0];
      assert.equal(r.guestName, "Carlos Drumond de Andrade");
      assert.equal(r.totalAmount, 950.0);
    });

    it("Módulo cleaning: hóspede vê primeiro nome da camareira sem CPF ou dados sigilosos", async () => {
      const res = await querySystemData(mockDb, {
        module: "cleaning",
        requesterRole: "guest"
      });

      assert.equal(res.success, true);
      assert.ok(res.cleaningRequests.length >= 2);
      assert.equal(res.cleaningRequests[0].assignedTo, "Grazi");
      assert.equal(res.cleaningRequests[0].assignedUserId, undefined);
      assert.equal(res.cleaningRequests[0].adminNote, undefined);
    });

    it("Módulo maintenance: admin vê token e CPF de prestador; hóspede não vê", async () => {
      const adminRes = await querySystemData(mockDb, {
        module: "maintenance",
        requesterRole: "admin"
      });
      assert.equal(adminRes.success, true);
      assert.equal(adminRes.serviceOrders[0].token, "tok_secret_service_123");
      assert.equal(adminRes.serviceOrders[0].workerCpf, "11122233344");

      const guestRes = await querySystemData(mockDb, {
        module: "maintenance",
        requesterRole: "guest"
      });
      assert.equal(guestRes.success, true);
      assert.equal(guestRes.serviceOrders[0].token, undefined);
      assert.equal(guestRes.serviceOrders[0].workerCpf, undefined);
    });

    it("Módulo breakfast: hóspede não tem acesso a pedidos de outros apartamentos", async () => {
      const guestRes = await querySystemData(mockDb, {
        module: "breakfast",
        requesterRole: "guest",
        requesterPhone: "5522998881234"
      });

      assert.equal(guestRes.success, true);
      // Carlos só vê seu pedido, não vê o do quarto 212
      assert.equal(guestRes.orders.length, 1);
      assert.equal(guestRes.orders[0].roomNumber, "113");
    });

    it("Módulo garage: hóspede não tem acesso às placas de outros hóspedes", async () => {
      const guestRes = await querySystemData(mockDb, {
        module: "garage",
        requesterRole: "guest",
        requesterPhone: "5522998881234",
        query: "BRA2E19"
      });

      assert.equal(guestRes.success, true);
      assert.equal(guestRes.authorizations.length, 1);
      assert.equal(guestRes.authorizations[0].plate, "BRA2E19");

      // Consulta sem ser dono
      const intruderRes = await querySystemData(mockDb, {
        module: "garage",
        requesterRole: "guest",
        requesterPhone: "5599999999999",
        query: "XYZ9999" // Placa de outro hóspede
      });
      assert.equal(intruderRes.authorizations.length, 0);
    });

    it("Módulo lost_and_found: hóspede não visualiza contato do hóspede anterior", async () => {
      const guestRes = await querySystemData(mockDb, {
        module: "lost_and_found",
        requesterRole: "guest",
        query: "relógio"
      });

      assert.equal(guestRes.success, true);
      assert.equal(guestRes.items.length, 1);
      assert.equal(guestRes.items[0].lastGuestPhone, undefined);
      assert.equal(guestRes.items[0].lastGuestEmail, undefined);
    });

    it("Módulo faq: retorna FAQs ativas e resumo de políticas", async () => {
      const res = await querySystemData(mockDb, {
        module: "faq",
        query: "wifi",
        requesterRole: "guest"
      });

      assert.equal(res.success, true);
      assert.ok(res.faqs.length >= 1);
      assert.ok(res.knowledgeBaseSummary.checkinTime);
    });

    it("Módulo finance: bloqueia estritamente perfil guest (LGPD) e autoriza admin", async () => {
      const guestRes = await querySystemData(mockDb, {
        module: "finance",
        requesterRole: "guest"
      });
      assert.equal(guestRes.error, "ACCESS_DENIED");

      const adminRes = await querySystemData(mockDb, {
        module: "finance",
        requesterRole: "admin"
      });
      assert.equal(adminRes.success, true);
      assert.ok(adminRes.averageDailyRate > 0);
      assert.ok(adminRes.totalRevenueEstimated > 0);
      assert.equal(adminRes.revenueByChannel.direct, 950.0);
    });

    it("Módulo sentiment: retorna métricas de satisfação e avaliações", async () => {
      const res = await querySystemData(mockDb, {
        module: "sentiment",
        requesterRole: "admin"
      });

      assert.equal(res.success, true);
      assert.equal(res.totalReviews, 2);
      assert.equal(res.averageRating, 5);
      assert.equal(res.nps.promoters, 1);
    });
  });

  // ── 3. Registro de Ferramentas e Execução de Bot Action ─────────────────────
  describe("Gemini Tool Registration & Bot Action Routing", () => {
    it("inclui querySystemData nas ferramentas do Gemini por padrão", () => {
      const tools = buildGeminiTools({ apiActionsEnabled: true });
      assert.ok(Array.isArray(tools));
      const decls = tools[0].functionDeclarations;
      const qTool = decls.find(d => d.name === "querySystemData");
      assert.ok(qTool);
      assert.equal(qTool.parameters.required[0], "module");
    });

    it("habilita querySystemData nas configurações padrão de bot actions", () => {
      const settings = getBotActionsSettings({});
      assert.equal(settings.allowedActions.querySystemData, true);
    });

    it("executa querySystemData via executeBotAction", async () => {
      const mockDb = createMockDb();
      const res = await executeBotAction(mockDb, "querySystemData", {
        module: "flats",
        requesterRole: "admin"
      });
      assert.equal(res.success, true);
      assert.equal(res.module, "flats");
    });
  });

  // ── 4. Contingência Heurística da Sofia para Operações ──────────────────────
  describe("Sofia Heuristic Contingency for Operational Inquiries", () => {
    const mockDb = createMockDb();

    it("responde sobre itens e horários do cardápio do café da manhã", () => {
      const reply = generateHeuristicResponse(
        "qual o cardápio e horário do café da manhã?",
        {},
        undefined,
        mockDb
      );
      assert.match(reply, /05:00 às 09:30/);
      assert.match(reply, /Pão francês/i);
      assert.match(reply, /suco/i);
    });

    it("responde sobre garagem e confirmação de veículo cadastrado", () => {
      const reply = generateHeuristicResponse(
        "como funciona a garagem para o meu carro?",
        { flatNumber: "113", phone: "5522998881234" },
        undefined,
        mockDb
      );
      assert.match(reply, /BRA2E19/);
      assert.match(reply, /liberação ativa/i);
    });

    it("responde sobre achados e perdidos identificando item do flat", () => {
      const reply = generateHeuristicResponse(
        "esqueci um objeto no quarto 113",
        { flatNumber: "113" },
        undefined,
        mockDb
      );
      assert.match(reply, /Relógio de pulso prata/i);
      assert.match(reply, /guardado com total segurança/i);
    });

    it("responde sobre manutenção identificando ordem de serviço em andamento", () => {
      const reply = generateHeuristicResponse(
        "o ar-condicionado está com defeito no flat 212",
        { flatNumber: "212" },
        undefined,
        mockDb
      );
      assert.match(reply, /chamado de manutenção aberto/i);
      assert.match(reply, /Manutenção do Ar-Condicionado/i);
    });
  });

  // ── 5. Teste de Integração HTTP do Endpoint do Copiloto (/api/admin/copilot/chat) ──
  describe("Admin Copilot Chat HTTP Endpoint (/api/admin/copilot/chat)", () => {
    before(async () => {
      const initialDb = createMockDb();
      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
        cwd: rootDir,
        env: {
          ...process.env,
          PORT: String(TEST_PORT),
          DATA_FILE: isolatedDbPath,
          DATABASE_FILE: isolatedDbPath,
          NODE_ENV: "test"
        },
        stdio: "pipe"
      });

      // Aguarda o servidor subir
      let ready = false;
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/flats`);
          if (res.ok) {
            ready = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 400));
      }
      assert.ok(ready, "Servidor de teste não inicializou a tempo.");
    });

    after(() => {
      if (serverProcess && serverProcess.pid) {
        killProcessTree(serverProcess.pid);
      }
      try {
        if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
      } catch (_) {}
    });

    it("bloqueia requisição de chat sem autorização", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/copilot/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Status dos flats" })
      });

      assert.ok(res.status === 401 || res.status === 403);
    });

    it("processa pergunta gerencial e retorna resposta estruturada com dados", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-admin": "1"
        },
        body: JSON.stringify({
          message: "Qual o status dos flats hoje e ocupação?"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.reply);
      assert.match(data.reply, /Total de Flats|Panorama Geral|Flats/i);
    });

    it("processa pergunta sobre café da manhã pelo copiloto", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-admin": "1"
        },
        body: JSON.stringify({
          message: "Quais os pedidos de café da manhã para hoje?"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.match(data.reply, /Café da Manhã|05:00|Pedidos/i);
    });

    it("processa pergunta financeira pelo copiloto retornando diária média e faturamento", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/copilot/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-admin": "1"
        },
        body: JSON.stringify({
          message: "Qual o resumo financeiro das reservas deste mês?"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.match(data.reply, /Financeiro|Diária Média|Faturamento/i);
    });
  });
});
