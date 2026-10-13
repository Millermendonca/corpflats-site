/**
 * Test Suite: Bot Unmet Demands Mapping & Automation Opportunities Backlog
 * File: tests/bot-unmet-demands.test.mjs
 * Execution: node --test tests/bot-unmet-demands.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  classifyUnmetDemand,
  detectAndRecordUnmetDemand,
  findExistingUnmetDemand,
  formatCheckoutCommunicationResponse,
  validateAndRefineResponse,
  analyzeGuestIntentSemantic,
  UNMET_DEMAND_CATEGORIES
} from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3995;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-unmet-demands-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

describe("Bot Unmet Demands & Automation Opportunities Suite", () => {
  before(async () => {
    // 1. Prepare isolated test database
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    initialDb.unmetDemands = [];
    initialDb.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: false, // Disabled for testing action_disabled
        generatePayment: true,
        createPreReservation: true,
        commitReservation: false // Disabled for testing action_disabled
      },
      preReservationHoldMinutes: 30,
      handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano.",
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server process
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

    let serverReady = false;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) {
          serverReady = true;
          break;
        }
      } catch (_) {}
    }

    if (!serverReady) {
      throw new Error(`Test server failed to start on port ${TEST_PORT}`);
    }
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  describe("Unit Tests: Classification & Aggregation Logic", () => {
    it("should classify disabled system action targets accurately", () => {
      const c1 = classifyUnmetDemand("", "commitReservation");
      assert.strictEqual(c1.category, "efetivacao_reserva");
      assert.strictEqual(c1.reason, "action_disabled");
      assert.strictEqual(c1.actionTarget, "commitReservation");

      const c2 = classifyUnmetDemand("", "calculateQuote");
      assert.strictEqual(c2.category, "cotacao_diarias");
      assert.strictEqual(c2.reason, "action_disabled");

      const c3 = classifyUnmetDemand("", null, "master_switch_disabled");
      assert.strictEqual(c3.category, "operacoes_sistema_pausadas");
      assert.strictEqual(c3.reason, "action_disabled");
    });

    it("should classify semantic guest requests for missing capabilities", () => {
      // Cancellation
      const cancelRes = classifyUnmetDemand("Quero cancelar minha reserva por motivos pessoais");
      assert.strictEqual(cancelRes.category, "cancelamento_reserva");
      assert.strictEqual(cancelRes.reason, "capability_missing");

      // Dates change
      const datesRes = classifyUnmetDemand("Preciso alterar as datas do meu check-in");
      assert.strictEqual(datesRes.category, "alteracao_datas");
      assert.strictEqual(datesRes.reason, "capability_missing");

      // Maintenance
      const maintRes = classifyUnmetDemand("O ar condicionado não gela e o chuveiro queimou");
      assert.strictEqual(maintRes.category, "chamado_manutencao");
      assert.strictEqual(maintRes.reason, "capability_missing");

      // Linen / Towels
      const linenRes = classifyUnmetDemand("Poderia me mandar duas toalhas de banho e um lençol extra?");
      assert.strictEqual(linenRes.category, "enxoval_toalhas");
      assert.strictEqual(linenRes.reason, "capability_missing");

      // Extra cleaning
      const cleanRes = classifyUnmetDemand("Gostaria de solicitar uma limpeza avulsa no quarto hoje");
      assert.strictEqual(cleanRes.category, "limpeza_avulsa");
      assert.strictEqual(cleanRes.reason, "capability_missing");

      // Late checkout
      const lateRes = classifyUnmetDemand("É possível fazer late check-out e sair às 16h?");
      assert.strictEqual(lateRes.category, "late_checkout");
      assert.strictEqual(lateRes.reason, "capability_missing");

      // Garage / vehicle
      const garageRes = classifyUnmetDemand("A placa do meu veículo é ABC-1234");
      assert.strictEqual(garageRes.category, "garagem_veiculo");
      assert.strictEqual(garageRes.reason, "capability_missing");

      // Invoices
      const nfRes = classifyUnmetDemand("Preciso da emissão da nota fiscal da hospedagem com meu CNPJ");
      assert.strictEqual(nfRes.category, "emissao_nota_fiscal");
      assert.strictEqual(nfRes.reason, "capability_missing");
    });

    it("should ignore trivial greetings without operational demand", () => {
      const mockDb = { unmetDemands: [] };
      const res = detectAndRecordUnmetDemand({
        db: mockDb,
        text: "Bom dia!",
        senderPhone: "5521999990001",
        senderName: "Carlos"
      });
      assert.strictEqual(res, null);
      assert.strictEqual(mockDb.unmetDemands.length, 0);
    });

    it("should aggregate repeated demands into single record with frequency count", () => {
      const mockDb = { unmetDemands: [] };

      // First occurrence from Guest A
      const d1 = detectAndRecordUnmetDemand({
        db: mockDb,
        text: "Preciso de mais 2 toalhas de banho",
        senderPhone: "5521999990001",
        senderName: "Hóspede A"
      });
      assert.ok(d1);
      assert.strictEqual(mockDb.unmetDemands.length, 1);
      assert.strictEqual(d1.occurrencesCount, 1);
      assert.strictEqual(d1.category, "enxoval_toalhas");

      // Second occurrence from Guest B (same category)
      const d2 = detectAndRecordUnmetDemand({
        db: mockDb,
        text: "Vocês tem toalha extra para o flat?",
        senderPhone: "5521999990002",
        senderName: "Hóspede B"
      });
      assert.strictEqual(mockDb.unmetDemands.length, 1);
      assert.strictEqual(d2.id, d1.id);
      assert.strictEqual(d2.occurrencesCount, 2);
      assert.ok(d2.clientPhones.includes("5521999990001"));
      assert.ok(d2.clientPhones.includes("5521999990002"));
      assert.strictEqual(d2.variations.length, 2);
    });

    it("should classify checkout communication demands accurately and reject informational time queries", () => {
      const phrases = [
        "gostaria de informar meu Check-out",
        "estou fazendo checkout",
        "já saí do flat",
        "estou entregando a chave na recepção",
        "acabei de desocupar o apartamento",
        "estamos saindo do flat agora",
        "aviso de check-out",
        "chaves entregues na portaria"
      ];

      for (const phrase of phrases) {
        const res = classifyUnmetDemand(phrase);
        assert.strictEqual(res.category, "checkout_comunicacao", `Failed for phrase: "${phrase}"`);
        assert.strictEqual(res.reason, "capability_missing");
        assert.strictEqual(res.demandTitle, UNMET_DEMAND_CATEGORIES.checkout_comunicacao.title);
      }

      // Disabled actionTarget test
      const actionRes = classifyUnmetDemand("", "informCheckout");
      assert.strictEqual(actionRes.category, "checkout_comunicacao");
      assert.strictEqual(actionRes.reason, "action_disabled");

      // FAQ / informational queries should NOT trigger checkout_comunicacao
      const negativeCases = [
        "qual o horário de check-out?",
        "que horas tenho que sair do quarto?",
        "qual a hora do check-out?",
        "qual o valor da diária para check-out tardio?",
        "qual a política de check-out?"
      ];

      for (const neg of negativeCases) {
        const res = classifyUnmetDemand(neg);
        assert.notStrictEqual(res.category, "checkout_comunicacao", `False positive for: "${neg}"`);
      }
    });

    it("should record checkout communication with status 'pendente' and accurate title", () => {
      const mockDb = { unmetDemands: [] };
      const d = detectAndRecordUnmetDemand({
        db: mockDb,
        text: "estou saindo do flat e entregando a chave",
        senderPhone: "5521998877665",
        senderName: "Marcos Paulo"
      });

      assert.ok(d);
      assert.strictEqual(d.status, "pendente");
      assert.strictEqual(d.category, "checkout_comunicacao");
      assert.strictEqual(d.demandTitle, "Comunicação / Notificação de Check-out pelo Hóspede via WhatsApp");
      assert.strictEqual(mockDb.unmetDemands.length, 1);
    });

    it("should format cordial checkout communication response with flat and gratitude", () => {
      const responseWithFlat = formatCheckoutCommunicationResponse(" Carlos", { flatNumber: "204" });
      assert.ok(responseWithFlat.includes("Olá Carlos!"));
      assert.ok(responseWithFlat.includes("Flat 204"));
      assert.ok(responseWithFlat.includes("Muito obrigado por nos avisar!"));
      assert.ok(responseWithFlat.includes("governança e recepção"));
      assert.ok(responseWithFlat.includes("CorpFlats"));

      const responseNoFlat = formatCheckoutCommunicationResponse("", null);
      assert.ok(responseNoFlat.includes("Olá!"));
      assert.ok(!responseNoFlat.includes("Flat null"));
    });

    it("should record unmet demand for developer simulation phone 5522998505276 without suppression", () => {
      const mockDb = {
        unmetDemands: [],
        settings: { developerPhone: "5522998505276" }
      };

      const result = validateAndRefineResponse({
        queryText: "gostaria de informar meu Check-out",
        candidateText: "Sou a Sofia, concierge virtual da CorpFlats...",
        guestContext: {
          phone: "5522998505276",
          guestName: "Desenvolvedor Simulado",
          flatNumber: "101"
        },
        db: mockDb
      });

      assert.ok(result.replyText.includes("Muito obrigado por nos avisar!"));
      assert.ok(result.replyText.includes("Flat 101"));
      assert.strictEqual(mockDb.unmetDemands.length, 1);
      assert.strictEqual(mockDb.unmetDemands[0].category, "checkout_comunicacao");
      assert.strictEqual(mockDb.unmetDemands[0].status, "pendente");
    });
  });

  describe("REST API Endpoints: /api/bot-demands/*", () => {
    let createdDemandId = null;

    it("POST /api/bot-demands should register an unmet demand", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Gostaria de saber se posso estender a estadia e fazer late check-out",
          senderPhone: "5521988887777",
          senderName: "Fernanda Alencar",
          guestContext: { flatNumber: "215", stayStatus: "checkout_hoje" }
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.demand);
      assert.strictEqual(data.demand.category, "late_checkout");
      assert.strictEqual(data.demand.reason, "capability_missing");
      assert.strictEqual(data.demand.senderPhone, "5521988887777");
      assert.strictEqual(data.demand.senderName, "Fernanda Alencar");
      assert.strictEqual(data.demand.guestContext.flatNumber, "215");

      createdDemandId = data.demand.id;
    });

    it("POST /api/bot-demands should record an action_disabled demand for quote", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Quanto custa o flat 408 de 15 a 18 de novembro?",
          actionTarget: "calculateQuote",
          reason: "action_disabled",
          senderPhone: "5521977776666",
          senderName: "Rodrigo Matos"
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.demand.category, "cotacao_diarias");
      assert.strictEqual(data.demand.reason, "action_disabled");
      assert.strictEqual(data.demand.actionTarget, "calculateQuote");
    });

    it("GET /api/bot-demands should return mapped demands list with filters", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.demands));
      assert.strictEqual(data.demands.length, 2);

      // Filter by category
      const filterRes = await fetch(`${BASE_URL}/api/bot-demands?category=late_checkout`);
      const filterData = await filterRes.json();
      assert.strictEqual(filterData.demands.length, 1);
      assert.strictEqual(filterData.demands[0].category, "late_checkout");

      // Filter by reason
      const reasonRes = await fetch(`${BASE_URL}/api/bot-demands?reason=action_disabled`);
      const reasonData = await reasonRes.json();
      assert.strictEqual(reasonData.demands.length, 1);
      assert.strictEqual(reasonData.demands[0].category, "cotacao_diarias");

      // Search
      const searchRes = await fetch(`${BASE_URL}/api/bot-demands?search=Fernanda`);
      const searchData = await searchRes.json();
      assert.strictEqual(searchData.demands.length, 1);
      assert.strictEqual(searchData.demands[0].senderName, "Fernanda Alencar");
    });

    it("GET /api/bot-demands/stats should compute accurate KPI metrics", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands/stats`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.stats);

      const s = data.stats;
      assert.strictEqual(s.totalDemands, 2);
      assert.strictEqual(s.openDemands, 2);
      assert.strictEqual(s.actionDisabledCount, 1);
      assert.strictEqual(s.capabilityMissingCount, 1);
      assert.strictEqual(s.totalOccurrences, 2);
      assert.strictEqual(s.totalUniquePhones, 2);
      assert.ok(s.byCategory.late_checkout);
      assert.ok(s.byCategory.cotacao_diarias);
      assert.ok(s.categoriesCatalog);
      assert.ok(Array.isArray(s.topRequested));
    });

    it("PATCH /api/bot-demands/:id should update status, priority, and admin notes", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands/${createdDemandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "planejada",
          priority: "alta",
          adminNotes: "Priorizar desenvolvimento na próxima sprint junto com taxa extra."
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.demand.status, "planejada");
      assert.strictEqual(data.demand.priority, "alta");
      assert.strictEqual(data.demand.adminNotes, "Priorizar desenvolvimento na próxima sprint junto com taxa extra.");
      assert.ok(data.demand.statusUpdatedAt);
    });

    it("POST /api/bot-demands/:id/action-link should auto-activate action and mark implemented", async () => {
      // Find the demand with category cotacao_diarias
      const listRes = await fetch(`${BASE_URL}/api/bot-demands?category=cotacao_diarias`);
      const listData = await listRes.json();
      const quoteDemand = listData.demands[0];
      assert.ok(quoteDemand);

      // Verify that calculateQuote was initially disabled
      const actionsPre = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      const actionsPreData = await actionsPre.json();
      assert.strictEqual(actionsPreData.settings.allowedActions.calculateQuote, false);

      // Trigger action-link
      const linkRes = await fetch(`${BASE_URL}/api/bot-demands/${quoteDemand.id}/action-link`, {
        method: "POST"
      });
      assert.strictEqual(linkRes.status, 200);
      const linkData = await linkRes.json();
      assert.strictEqual(linkData.success, true);
      assert.strictEqual(linkData.activatedAction, "calculateQuote");
      assert.strictEqual(linkData.demand.status, "implementada");
      assert.ok(linkData.demand.adminNotes.includes("calculateQuote"));

      // Verify that calculateQuote is now enabled in botActionsSettings
      const actionsPost = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      const actionsPostData = await actionsPost.json();
      assert.strictEqual(actionsPostData.settings.allowedActions.calculateQuote, true);
    });

    it("DELETE /api/bot-demands/:id should remove the demand from database", async () => {
      const res = await fetch(`${BASE_URL}/api/bot-demands/${createdDemandId}`, {
        method: "DELETE"
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.demand.id, createdDemandId);

      // Verify list has only 1 demand left
      const listRes = await fetch(`${BASE_URL}/api/bot-demands`);
      const listData = await listRes.json();
      assert.strictEqual(listData.demands.length, 1);
    });

    it("REST API: should support checkout_comunicacao workflow with pendente status and action-link", async () => {
      // 1. Register checkout communication demand
      const createRes = await fetch(`${BASE_URL}/api/bot-demands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "gostaria de informar meu Check-out e entrega da chave",
          senderPhone: "5522998505276",
          senderName: "Hóspede Saindo",
          guestContext: { flatNumber: "302", stayStatus: "checkout_hoje" }
        })
      });

      assert.strictEqual(createRes.status, 200);
      const createData = await createRes.json();
      assert.strictEqual(createData.success, true);
      assert.ok(createData.demand);
      assert.strictEqual(createData.demand.category, "checkout_comunicacao");
      assert.strictEqual(createData.demand.status, "pendente");
      assert.strictEqual(createData.demand.guestContext.flatNumber, "302");

      const checkoutDemandId = createData.demand.id;

      // 2. Query filter with status=pendente
      const pendenteRes = await fetch(`${BASE_URL}/api/bot-demands?status=pendente`);
      const pendenteData = await pendenteRes.json();
      assert.ok(pendenteData.demands.some(d => d.id === checkoutDemandId));

      // 3. Query filter with status=aberta (should also include pendente)
      const abertaRes = await fetch(`${BASE_URL}/api/bot-demands?status=aberta`);
      const abertaData = await abertaRes.json();
      assert.ok(abertaData.demands.some(d => d.id === checkoutDemandId));

      // 4. Verify stats count includes this pending demand in openDemands
      const statsRes = await fetch(`${BASE_URL}/api/bot-demands/stats`);
      const statsData = await statsRes.json();
      assert.ok(statsData.stats.openDemands >= 1);
      assert.ok(statsData.stats.byCategory.checkout_comunicacao);

      // 5. Trigger action-link to activate informCheckout action
      const linkRes = await fetch(`${BASE_URL}/api/bot-demands/${checkoutDemandId}/action-link`, {
        method: "POST"
      });
      assert.strictEqual(linkRes.status, 200);
      const linkData = await linkRes.json();
      assert.strictEqual(linkData.success, true);
      assert.strictEqual(linkData.activatedAction, "informCheckout");
      assert.strictEqual(linkData.demand.status, "implementada");

      // Verify action is enabled in settings
      const actionsRes = await fetch(`${BASE_URL}/api/bot-actions/settings`);
      const actionsData = await actionsRes.json();
      assert.strictEqual(actionsData.settings.allowedActions.informCheckout, true);

      // 6. Clean up created demand
      const delRes = await fetch(`${BASE_URL}/api/bot-demands/${checkoutDemandId}`, {
        method: "DELETE"
      });
      assert.strictEqual(delRes.status, 200);
    });
  });
});
