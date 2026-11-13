/**
 * Isolated Test Suite — Minibar Hierarchical Staff Management & Insights 360°
 * File: tests/minibar-staff-and-insights.test.mjs
 * Execution: node --test tests/minibar-staff-and-insights.test.mjs
 *
 * Strict Isolation Rules (AGENTS.md):
 * - Dedicated isolated port 4398
 * - Temporary database in os.tmpdir() with DATABASE_URL removed
 * - Zero external notifications dispatched
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4398;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(os.tmpdir(), `test-minibar-staff-insights-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {}
}

describe("Minibar Staff Hierarchy (Admin + Gestor Anserve + Repositoras) & Insights 360°", () => {
  let adminCookie = "";
  let gestorCookie = "";
  let createdGestorId = null;
  let createdRepositoraByAdminId = null;
  let createdRepositoraByGestorId = null;

  it("1. Paridade SHA-256 entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs", () => {
    const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
    const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
    assert.strictEqual(hashA, hashB, "demo-server.mjs em artifacts/ e scripts/ deve possuir o mesmo hash SHA-256");
  });

  describe("2. Gestão Hierárquica de Equipe Anserve e Relatórios Exclusivos", () => {
    before(async () => {
      let initialDb = {};
      if (fs.existsSync(prodDbPath)) {
        try {
          initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
        } catch (_) {
          initialDb = {};
        }
      }

      if (!Array.isArray(initialDb.reservations)) initialDb.reservations = [];
      if (!Array.isArray(initialDb.guests)) initialDb.guests = [];
      if (!Array.isArray(initialDb.users)) initialDb.users = [];
      if (!Array.isArray(initialDb.minibarProducts)) initialDb.minibarProducts = [];
      if (!Array.isArray(initialDb.minibarOrders)) initialDb.minibarOrders = [];
      if (!Array.isArray(initialDb.minibarInspections)) initialDb.minibarInspections = [];

      const checkinDate = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
      const checkoutDate = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

      // Seed demographic and channel variety for Insights 360
      initialDb.guests.push(
        {
          id: 91001,
          fullName: "Marcelo Paulista",
          name: "Marcelo Paulista",
          phone: "5511988881111",
          documentNumber: "11122233344",
          email: "marcelo.sp@empresa.com.br",
          city: "São Paulo",
          state: "SP"
        },
        {
          id: 91002,
          fullName: "Renata Carioca",
          name: "Renata Carioca",
          phone: "5521988882222",
          documentNumber: "22233344455",
          email: "renata.rj@gmail.com",
          city: "Rio de Janeiro",
          state: "RJ"
        }
      );

      initialDb.reservations.push(
        {
          id: 881001,
          code: "RES-INS-301",
          flatId: 1,
          flatNumber: "301",
          guestId: 91001,
          guestName: "Marcelo Paulista",
          guestPhone: "5511988881111",
          guestDocument: "11122233344",
          guestEmail: "marcelo.sp@empresa.com.br",
          guestCity: "São Paulo",
          guestState: "SP",
          status: "confirmada",
          checkinDate,
          checkoutDate,
          guestCount: 1,
          totalAmount: 950.0,
          paidAmount: 950.0,
          isPaid: true,
          channel: "direct"
        },
        {
          id: 881002,
          code: "RES-INS-402",
          flatId: 2,
          flatNumber: "402",
          guestId: 91002,
          guestName: "Renata Carioca",
          guestPhone: "5521988882222",
          guestDocument: "22233344455",
          guestEmail: "renata.rj@gmail.com",
          guestCity: "Rio de Janeiro",
          guestState: "RJ",
          status: "confirmada",
          checkinDate,
          checkoutDate,
          guestCount: 2,
          totalAmount: 1100.0,
          paidAmount: 1100.0,
          isPaid: true,
          channel: "booking"
        }
      );

      initialDb.minibarOrders.push(
        {
          id: "ORD-TEST-SP-1",
          flatNumber: "301",
          reservationId: 881001,
          reservationCode: "RES-INS-301",
          guestName: "Marcelo Paulista",
          guestPhone: "5511988881111",
          guestDocument: "11122233344",
          guestEmail: "marcelo.sp@empresa.com.br",
          items: [
            { productId: "prod_heineken", productName: "Cerveja Heineken Long Neck 330ml", quantity: 3, unitPrice: 14, totalPrice: 42 },
            { productId: "prod_pringles", productName: "Batata Pringles Original 104g", quantity: 1, unitPrice: 18, totalPrice: 18 }
          ],
          totalAmount: 60,
          paymentMethod: "pix",
          paymentStatus: "pago",
          source: "guest_qr",
          fiscalPreferences: {
            invoiceDescriptionType: "water_only",
            documentType: "cnpj",
            documentNumber: "12345678000199",
            email: "marcelo.sp@empresa.com.br"
          },
          invoice: { status: "pendente" },
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString()
        },
        {
          id: "ORD-TEST-RJ-2",
          flatNumber: "402",
          reservationId: 881002,
          reservationCode: "RES-INS-402",
          guestName: "Renata Carioca",
          guestPhone: "5521988882222",
          guestDocument: "22233344455",
          guestEmail: "renata.rj@gmail.com",
          items: [
            { productId: "prod_agua_sem_gas", productName: "Água Mineral sem Gás 500ml", quantity: 2, unitPrice: 6, totalPrice: 12 },
            { productId: "prod_kitkat", productName: "Chocolate KitKat 41,5g", quantity: 2, unitPrice: 8, totalPrice: 16 }
          ],
          totalAmount: 28,
          paymentMethod: "credit_card",
          paymentStatus: "pago",
          source: "guest_portal",
          fiscalPreferences: {
            invoiceDescriptionType: "detailed",
            documentType: "cpf",
            documentNumber: "22233344455",
            email: "renata.rj@gmail.com"
          },
          invoice: { status: "anexada", attachedAt: new Date().toISOString() },
          createdAt: new Date().toISOString(),
          paidAt: new Date().toISOString()
        }
      );

      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      const env = { ...process.env };

      serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
        cwd: rootDir,
        env: {
          ...env,
          DATABASE_URL: "",
          PORT: String(TEST_PORT),
          DATA_FILE: isolatedDbPath,
          DATABASE_FILE: isolatedDbPath,
          NODE_ENV: "test"
        },
        stdio: "pipe"
      });

      let isReady = false;
      for (let i = 0; i < 50; i++) {
        try {
          const res = await fetch(`${BASE_URL}/api/system/version`);
          if (res.ok) {
            isReady = true;
            break;
          }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
      }

      if (!isReady) {
        throw new Error(`Servidor de teste não iniciou na porta ${TEST_PORT}`);
      }

      // Login as CorpFlats Admin
      const loginAdmin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" })
      });
      assert.strictEqual(loginAdmin.status, 200, "Admin deve autenticar com sucesso");
      const rawCookie = loginAdmin.headers.get("set-cookie");
      if (rawCookie) {
        adminCookie = rawCookie.split(";")[0];
      }
    });

    after(async () => {
      if (serverProcess?.pid) {
        killProcessTree(serverProcess.pid);
      }
      try {
        if (fs.existsSync(isolatedDbPath)) {
          fs.unlinkSync(isolatedDbPath);
        }
      } catch (_) {}
    });

    it("2.1 Admin CorpFlats cria Gestor Anserve (anserve_gestor) e Repositora (anserve_repositora)", async () => {
      const resGestor = await fetch(`${BASE_URL}/api/minibar/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          username: "carlos_gestor_anserve",
          name: "Carlos Gestor Anserve",
          password: "gestorPassword123",
          role: "anserve_gestor",
          phone: "22999112233",
          pin: "9988"
        })
      });
      assert.strictEqual(resGestor.status, 201);
      const dataGestor = await resGestor.json();
      assert.strictEqual(dataGestor.success, true);
      assert.strictEqual(dataGestor.member.role, "anserve_gestor");
      assert.strictEqual(dataGestor.member.pin, "9988");
      createdGestorId = dataGestor.member.id;

      const resRepo = await fetch(`${BASE_URL}/api/minibar/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          username: "fernanda_anserve",
          name: "Fernanda Repositora",
          password: "repoPassword123",
          role: "anserve_repositora",
          phone: "22999445566",
          pin: "4455"
        })
      });
      assert.strictEqual(resRepo.status, 201);
      const dataRepo = await resRepo.json();
      assert.strictEqual(dataRepo.success, true);
      assert.strictEqual(dataRepo.member.role, "anserve_repositora");
      assert.strictEqual(dataRepo.member.pin, "4455");
      createdRepositoraByAdminId = dataRepo.member.id;
    });

    it("2.2 Gestor Anserve faz login e gerencia funcionárias (anserve_repositora), mas é bloqueado ao tentar criar/editar/excluir outro Gestor", async () => {
      const loginGestor = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "carlos_gestor_anserve", password: "gestorPassword123" })
      });
      assert.strictEqual(loginGestor.status, 200, "Gestor Anserve deve conseguir logar");
      const rawCookie = loginGestor.headers.get("set-cookie");
      if (rawCookie) {
        gestorCookie = rawCookie.split(";")[0];
      }
      assert.ok(gestorCookie, "Cookie de sessão do gestor deve ser retornado");

      // Gestor lista equipe (deve ver apenas anserve_repositora)
      const listRes = await fetch(`${BASE_URL}/api/minibar/staff`, {
        headers: { Cookie: gestorCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(listRes.status, 200);
      const listData = await listRes.json();
      assert.strictEqual(listData.success, true);
      assert.ok(listData.staff.every(u => u.role === "anserve_repositora"), "Gestor Anserve só deve listar funcionárias anserve_repositora");

      // Gestor cria nova funcionária repositora
      const createRepoRes = await fetch(`${BASE_URL}/api/minibar/staff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: gestorCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          username: "juliana_anserve",
          name: "Juliana Repositora",
          password: "julianaPassword123",
          role: "anserve_repositora",
          phone: "22988776655",
          pin: "7788"
        })
      });
      assert.strictEqual(createRepoRes.status, 201);
      const createRepoData = await createRepoRes.json();
      assert.strictEqual(createRepoData.member.role, "anserve_repositora");
      assert.strictEqual(createRepoData.member.pin, "7788");
      createdRepositoraByGestorId = createRepoData.member.id;

      // Gestor edita dados e PIN da funcionária
      const editRepoRes = await fetch(`${BASE_URL}/api/minibar/staff/${createdRepositoraByGestorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: gestorCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          name: "Juliana Silva (Líder Turno)",
          pin: "7799"
        })
      });
      assert.strictEqual(editRepoRes.status, 200);
      const editRepoData = await editRepoRes.json();
      assert.strictEqual(editRepoData.member.name, "Juliana Silva (Líder Turno)");
      assert.strictEqual(editRepoData.member.pin, "7799");

      // Gestor reseta a senha e PIN da funcionária
      const resetRes = await fetch(`${BASE_URL}/api/minibar/staff/${createdRepositoraByGestorId}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: gestorCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          newPassword: "novaSenhaJuliana456",
          newPin: "8899"
        })
      });
      assert.strictEqual(resetRes.status, 200);
      const resetData = await resetRes.json();
      assert.strictEqual(resetData.success, true);

      // Gestor tenta editar ou excluir um Gestor Anserve -> deve receber 403
      const forbiddenEdit = await fetch(`${BASE_URL}/api/minibar/staff/${createdGestorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: gestorCookie,
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({ name: "Tentativa Indevida" })
      });
      assert.strictEqual(forbiddenEdit.status, 403);

      const forbiddenDelete = await fetch(`${BASE_URL}/api/minibar/staff/${createdGestorId}`, {
        method: "DELETE",
        headers: {
          Cookie: gestorCookie,
          "x-enforce-auth": "true"
        }
      });
      assert.strictEqual(forbiddenDelete.status, 403);
    });

    it("2.3 Login Mobile via PIN Individual da Repositora e Atribuição Automática de Produtividade nas Inspeções", async () => {
      // Juliana autentica via PIN individual "8899"
      const pinAuthRes = await fetch(`${BASE_URL}/api/minibar/auth-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "8899" })
      });
      assert.strictEqual(pinAuthRes.status, 200);
      const pinAuthData = await pinAuthRes.json();
      assert.strictEqual(pinAuthData.success, true);
      assert.strictEqual(pinAuthData.user.id, createdRepositoraByGestorId);
      assert.strictEqual(pinAuthData.user.name, "Juliana Silva (Líder Turno)");
      assert.strictEqual(pinAuthData.user.role, "anserve_repositora");

      // Juliana realiza uma conferência e reposição usando seu PIN individual
      const inspRes = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anserve-pin": "8899",
          "x-enforce-auth": "true"
        },
        body: JSON.stringify({
          flatNumber: "301",
          reservationCode: "RES-INS-301",
          status: "conforme",
          missingItems: [],
          restockedItems: [
            { productId: "prod_heineken", quantity: 3, isCourtesy: false },
            { productId: "prod_cortesia_kit", quantity: 1, isCourtesy: true }
          ],
          notes: "Frigobar conferido e abastecido por Juliana"
        })
      });
      assert.strictEqual(inspRes.status, 200);
      const inspData = await inspRes.json();
      assert.strictEqual(inspData.success, true);
      assert.strictEqual(inspData.inspection.inspectorId, createdRepositoraByGestorId);
      assert.strictEqual(inspData.inspection.inspectorUsername, "juliana_anserve");
      assert.strictEqual(inspData.inspection.inspectorName, "Juliana Silva (Líder Turno)");

      // Verifica se o relatório da Anserve contabilizou a produtividade de Juliana
      const repRes = await fetch(`${BASE_URL}/api/minibar/anserve-reports`, {
        headers: { Cookie: gestorCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(repRes.status, 200);
      const repData = await repRes.json();
      assert.strictEqual(repData.success, true);
      assert.ok(repData.salesSummary.totalPaidRevenue >= 88, "Receita paga das vendas deve constar no resumo");
      assert.ok(Array.isArray(repData.salesSummary.orders) && repData.salesSummary.orders.length >= 2);
      assert.ok(Array.isArray(repData.salesSummary.byProduct) && repData.salesSummary.byProduct.length >= 2);

      const julianaStats = repData.productivitySummary.byStaff.find(s => s.id === createdRepositoraByGestorId);
      assert.ok(julianaStats, "Produtividade da Juliana deve aparecer em productivitySummary.byStaff");
      assert.strictEqual(julianaStats.inspectionsCount, 1);
      assert.strictEqual(julianaStats.paidItemsRestockedQty, 3);
      assert.strictEqual(julianaStats.courtesyItemsRestockedQty, 1);
      assert.strictEqual(julianaStats.totalItemsRestockedQty, 4);
    });

    it("2.4 Exclusividade da Inteligência 360° CorpFlats: 403 para Gestor Anserve e 200 Completo para Admin CorpFlats", async () => {
      // Gestor Anserve tenta acessar /api/minibar/analytics/insights-360 -> 403 Forbidden
      const gestorInsightsRes = await fetch(`${BASE_URL}/api/minibar/analytics/insights-360`, {
        headers: { Cookie: gestorCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(gestorInsightsRes.status, 403, "Gestor Anserve NÃO deve ter acesso aos Insights 360° da CorpFlats");

      // Admin CorpFlats acessa /api/minibar/analytics/insights-360 -> 200 OK com todas as 10 dimensões
      const adminInsightsRes = await fetch(`${BASE_URL}/api/minibar/analytics/insights-360`, {
        headers: { Cookie: adminCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(adminInsightsRes.status, 200);
      const insights = await adminInsightsRes.json();
      assert.strictEqual(insights.success, true);

      // Verifica presença das 10 dimensões analíticas e feed de curiosidades
      assert.ok(Array.isArray(insights.curiosities) && insights.curiosities.length > 0, "Deve gerar curiosidades automáticas");
      assert.ok(Array.isArray(insights.byState) && insights.byState.some(s => s.state === "SP"), "Deve conter cruzamento por UF (SP)");
      assert.ok(Array.isArray(insights.byCity) && insights.byCity.some(c => c.city === "São Paulo"), "Deve conter cruzamento por Cidade");
      assert.ok(Array.isArray(insights.byChannel) && insights.byChannel.length >= 2, "Deve conter cruzamento por Canal de Reserva");
      assert.ok(insights.corporateVsLeisure && insights.corporateVsLeisure.documentTypes.cnpj.count >= 1, "Deve conter análise fiscal e corporativa (CNPJ/Água)");
      assert.ok(insights.corporateVsLeisure.fiscalPreferences.water.count >= 1, "Deve contabilizar NF emitida como Água");
      assert.ok(Array.isArray(insights.temporal?.byDayOfWeek) && insights.temporal.byDayOfWeek.length === 7, "Deve conter matriz dos 7 dias da semana");
      assert.ok(Array.isArray(insights.temporal?.byHourSlot) && insights.temporal.byHourSlot.length === 4, "Deve conter os 4 turnos do dia");
      assert.ok(insights.stayProfile && Array.isArray(insights.stayProfile.byStayLength), "Deve conter perfil por duração de estadia");
      assert.ok(Array.isArray(insights.productMatrix) && insights.productMatrix.length > 0, "Deve conter Curva ABC e margem de produtos");
      assert.ok(Array.isArray(insights.marketBasketPairs) && insights.marketBasketPairs.length >= 1, "Deve identificar cestas de produtos (Market Basket)");
      assert.ok(Array.isArray(insights.byFlat) && insights.byFlat.length >= 1, "Deve conter ranking por Flat");
      assert.ok(insights.lossAndRecovery && typeof insights.lossAndRecovery.honestyRatePct === "number", "Deve conter funil de honestidade e Sofia");
    });

    it("2.5 Gestor Anserve pode excluir funcionária repositora e Admin pode excluir Gestor Anserve", async () => {
      // Gestor exclui Fernanda (anserve_repositora)
      const delRepo = await fetch(`${BASE_URL}/api/minibar/staff/${createdRepositoraByAdminId}`, {
        method: "DELETE",
        headers: { Cookie: gestorCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(delRepo.status, 200);

      // Admin exclui o Gestor Anserve
      const delGestor = await fetch(`${BASE_URL}/api/minibar/staff/${createdGestorId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie, "x-enforce-auth": "true" }
      });
      assert.strictEqual(delGestor.status, 200);
    });
  });
});
