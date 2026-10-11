/**
 * Test Suite: Milestone 1 - Reservation Modification Settlement Engine
 * File: tests/m1-reservation-modification-settlement.test.mjs
 * Execution: node --test tests/m1-reservation-modification-settlement.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 3991;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m1-settlement-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Milestone 1: Reservation Modification Settlement Engine Suite", () => {
  before(async () => {
    // 0. Ensure test port is clean
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") {
            killProcessTree(pid);
          }
        }
      }
      await new Promise(r => setTimeout(r, 400));
    } catch (_) {}

    // 1. Prepare isolated test database with sample reservations
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    if (!Array.isArray(initialDb.flats)) {
      initialDb.flats = [
        { id: 1, number: "113", colName: "113 solteiro", isOccupied: false },
        { id: 2, number: "114", colName: "114 Solteiro", isOccupied: false },
        { id: 3, number: "116", colName: "116", isOccupied: false }
      ];
    }

    if (!Array.isArray(initialDb.reservations)) {
      initialDb.reservations = [];
    }

    // Insert controlled baseline reservations
    // Res 1: Main direct reservation to test modification on Flat 113
    const resDirect = {
      id: 9001,
      code: "RES-M1-001",
      guestName: "Carlos Alberto",
      guestEmail: "carlos.alberto@example.com",
      guestPhone: "5521999990001",
      flatId: 1,
      flatNumber: "113",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-12",
      guestCount: 2,
      dailyRate: 160,
      totalAmount: 320,
      paidAmount: 320,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      payments: [
        {
          id: "pay_init_1",
          amount: 320,
          method: "pix",
          date: "2026-10-01T12:00:00.000Z",
          notes: "Pagamento inicial da reserva"
        }
      ],
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z"
    };

    // Res 2: Another confirmed reservation on Flat 113 for overlapping dates (Nov 14 to Nov 16)
    const resConflict = {
      id: 9002,
      code: "RES-M1-002",
      guestName: "Beatriz Souza",
      guestEmail: "beatriz@example.com",
      guestPhone: "5521999990002",
      flatId: 1,
      flatNumber: "113",
      checkinDate: "2026-11-14",
      checkoutDate: "2026-11-16",
      guestCount: 1,
      dailyRate: 160,
      totalAmount: 320,
      paidAmount: 320,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "site_direto",
      fnhrCompleted: true,
      needsReSignature: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z"
    };

    // Res 3: External OTA reservation (booking) to test channel guard
    const resOta = {
      id: 9003,
      code: "RES-M1-OTA",
      guestName: "John Doe",
      guestEmail: "john@booking.com",
      guestPhone: "5521999990003",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-12",
      guestCount: 1,
      dailyRate: 200,
      totalAmount: 400,
      paidAmount: 400,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "booking",
      fnhrCompleted: true,
      needsReSignature: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z"
    };

    // Res 4: Second direct reservation on Flat 114 to test cross-reservation pending hold blocks
    const resDirect2 = {
      id: 9004,
      code: "RES-M1-004",
      guestName: "Marcos Vinicius",
      guestEmail: "marcos@example.com",
      guestPhone: "5521999990004",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-11-20",
      checkoutDate: "2026-11-22",
      guestCount: 1,
      dailyRate: 160,
      totalAmount: 320,
      paidAmount: 320,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z"
    };

    // Res 5: Dedicated reservation with an expired pending hold (expiresAt in the past)
    const resExpired = {
      id: 9005,
      code: "RES-M1-EXP",
      guestName: "Eduardo Silva",
      guestEmail: "eduardo@example.com",
      guestPhone: "5521999990005",
      flatId: 3,
      flatNumber: "116",
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-12",
      guestCount: 1,
      dailyRate: 160,
      totalAmount: 320,
      paidAmount: 320,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      pendingModification: {
        pendingId: "mod_exp_9005",
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14",
        newFlatNumber: "116",
        newFlatId: 3,
        additionalAmountToPay: 320,
        status: "pending",
        expiresAt: new Date(Date.now() - 60000).toISOString(),
        createdAt: new Date(Date.now() - 1860000).toISOString()
      },
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z"
    };

    initialDb.reservations = [resDirect, resConflict, resOta, resDirect2, resExpired];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server process using artifacts/api-server/demo-server.mjs
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

    // Wait for server ready
    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }

    if (!isReady) {
      throw new Error(`Server failed to start on port ${TEST_PORT}`);
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

  // ── Tier 0: Twin-Server Parity Check ──────────────────────────────────────
  it("0. Paridade byte-a-byte estrita entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs", () => {
    const scriptsBuf = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    const artifactsBuf = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const hashScripts = crypto.createHash("sha256").update(scriptsBuf).digest("hex");
    const hashArtifacts = crypto.createHash("sha256").update(artifactsBuf).digest("hex");

    assert.strictEqual(hashScripts, hashArtifacts, "Os arquivos demo-server.mjs devem ter o mesmo hash SHA-256");
    assert.strictEqual(scriptsBuf.equals(artifactsBuf), true, "Os buffers devem ser 100% idênticos byte-a-byte");
  });

  // ── Tier 1: /modify-preview Simulation & Read-Only Invariants ─────────────
  it("1. POST /modify-preview: Simula prorrogação com sucesso (read-only, sem mutação no banco)", async () => {
    // Original: 2026-11-10 to 2026-11-12 (2 noites, Flat 113)
    // Pretendido: 2026-11-10 to 2026-11-14 (4 noites, Flat 113 -> +2 diárias = +R$ 320,00)
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14",
        newGuestCount: 2
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.available, true);
    assert.strictEqual(data.duration, 4);
    assert.strictEqual(data.extraNights, 2);
    assert.strictEqual(data.dailyRate, 160);
    assert.strictEqual(data.additionalAmountToPay, 320);
    assert.strictEqual(data.requiresPayment, true);
    assert.strictEqual(data.requiresReSignature, true);
    assert.strictEqual(data.newDates.checkinDate, "2026-11-10");
    assert.strictEqual(data.newDates.checkoutDate, "2026-11-14");

    // Invariante Read-Only: Banco de dados permanece 100% inalterado
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.checkinDate, "2026-11-10");
    assert.strictEqual(r.checkoutDate, "2026-11-12");
    assert.strictEqual(r.totalAmount, 320);
    assert.strictEqual(r.pendingModification, undefined);
  });

  it("2. POST /modify-preview: Detecta colisão de calendário com outra reserva confirmada (409 Conflict)", async () => {
    // Res 2 já ocupa Flat 113 de 2026-11-14 a 2026-11-16
    // Tentativa de estender Res 1 até 2026-11-15 deve colidir!
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-15"
      })
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.available, false);
    assert.strictEqual(data.error, "CONFLICT");
    assert.match(data.message, /Flat 113 não possui disponibilidade/);
  });

  it("3. POST /modify-preview: Bloqueia canais externos (403 Forbidden)", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-OTA/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14"
      })
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error, "EXTERNAL_CHANNEL");
  });

  it("4. POST /modify-preview: Valida datas inválidas (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-15",
        newCheckoutDate: "2026-11-10" // checkout anterior a checkin
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error, "INVALID_DATES");
  });

  // ── Tier 2: /modify-checkout & 30-Minute Hold Engine ───────────────────────
  it("5. POST /modify-checkout: Gera hold provisório de 30 minutos com PIX e mantém datas originais intactas", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14",
        paymentMethod: "pix"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.pendingId.startsWith("mod_"));
    assert.strictEqual(data.additionalAmountToPay, 320);
    assert.strictEqual(data.holdMinutes, 30);
    assert.ok(data.expiresAt);
    assert.ok(data.pixCopiaECola);
    assert.ok(data.pixTxId);
    assert.ok(data.pixQrCodeUrl);

    // INVARIANTE CRÍTICO: No banco, checkinDate e checkoutDate continuam os originais!
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.checkinDate, "2026-11-10");
    assert.strictEqual(r.checkoutDate, "2026-11-12"); // NÃO foi alterado para 14!
    assert.strictEqual(r.totalAmount, 320); // NÃO foi acrescido ainda!

    // pendingModification deve estar populado
    assert.ok(r.pendingModification);
    assert.strictEqual(r.pendingModification.status, "pending");
    assert.strictEqual(r.pendingModification.newCheckinDate, "2026-11-10");
    assert.strictEqual(r.pendingModification.newCheckoutDate, "2026-11-14");
    assert.strictEqual(r.pendingModification.additionalAmountToPay, 320);
  });

  it("6. Conflito por Hold Ativo: Outra reserva é bloqueada de reservar período sob hold provisório", async () => {
    // Flat 113 possui hold ativo cobrindo até 2026-11-14.
    // Tentativa de outra simulação que colida com o período do hold deve receber 409 CONFLICT!
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-004/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-12",
        newCheckoutDate: "2026-11-14",
        newFlatNumber: "113"
      })
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "CONFLICT");
  });

  it("7. GET /api/reservations/availability: Flat sob hold ativo aparece como ocupado", async () => {
    const res = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-11-12&checkout=2026-11-14`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const flat113 = (data.availableFlats || []).find(f => String(f.number) === "113");
    assert.strictEqual(flat113, undefined, "Flat 113 sob hold provisório não deve constar como disponível");
  });

  // ── Tier 3: /modify-cancel-pending (Liberação do Hold) ────────────────────
  it("8. POST /modify-cancel-pending: Libera o hold provisório e preserva as datas originais", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.originalDates.checkinDate, "2026-11-10");
    assert.strictEqual(data.originalDates.checkoutDate, "2026-11-12");

    // No banco: pendingModification foi removido, datas originais 100% preservadas
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.pendingModification, undefined);
    assert.strictEqual(r.checkinDate, "2026-11-10");
    assert.strictEqual(r.checkoutDate, "2026-11-12");

    // Auditoria registrou o cancelamento do hold
    const auditLogs = r.auditLogs || [];
    const cancelLog = auditLogs.find(a => a.action === "portal_modify_hold_canceled");
    assert.ok(cancelLog, "Log de cancelamento de hold deve constar na auditoria");
  });

  it("9. Liberação confirmada: Período anteriormente bloqueado pelo hold volta a ficar disponível", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-004/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-12",
        newCheckoutDate: "2026-11-14",
        newFlatNumber: "113"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.available, true);
  });

  // ── Tier 4: Hold Expiration & Direct Modify Guard ─────────────────────────
  it("10. Hold Expirado (30 Minutos): Polling em /modify-status detecta expiração e não altera datas", async () => {
    // Polling em /modify-status para reserva com hold cujo expiresAt está no passado (expirado)
    const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-EXP/modify-status?pendingId=mod_exp_9005`);
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.status, "expired");
    assert.strictEqual(statusData.committed, false);
    assert.match(statusData.message, /expirou/i);

    // Banco de dados: datas continuam as originais
    const updatedDb = getDb();
    const updatedR = updatedDb.reservations.find(x => x.code === "RES-M1-EXP");
    assert.strictEqual(updatedR.checkinDate, "2026-11-10");
    assert.strictEqual(updatedR.checkoutDate, "2026-11-12");

    // E uma nova simulação em /modify-preview para as mesmas datas agora é permitida (sem colisão com o hold expirado)
    const previewRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-EXP/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14"
      })
    });
    assert.strictEqual(previewRes.status, 200);
    const previewData = await previewRes.json();
    assert.strictEqual(previewData.success, true);
    assert.strictEqual(previewData.available, true);
  });

  it("11. Direct POST /modify: Rejeita com 402 PAYMENT_REQUIRED quando há valor a pagar", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-10",
        newCheckoutDate: "2026-11-14" // +2 diárias não pagas
      })
    });

    assert.strictEqual(res.status, 402);
    const data = await res.json();
    assert.strictEqual(data.error, "PAYMENT_REQUIRED");
    assert.strictEqual(data.requiresPayment, true);
    assert.strictEqual(data.additionalAmountToPay, 320);

    // Assegura que nenhuma data foi mutada no banco
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.checkinDate, "2026-11-10");
    assert.strictEqual(r.checkoutDate, "2026-11-12");
  });

  it("12. Direct POST /modify: Permite alteração de custo zero e invalida assinatura (needsReSignature = true)", async () => {
    // Deslocamento de datas com a mesma quantidade de diárias (2 noites: 11-10 a 11-12 -> 11-11 a 11-13)
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-11",
        newCheckoutDate: "2026-11-13"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.needsReSignature, true);

    // Banco de dados atualizado com invalidação da assinatura
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.checkinDate, "2026-11-11");
    assert.strictEqual(r.checkoutDate, "2026-11-13");
    assert.strictEqual(r.needsReSignature, true);
    assert.strictEqual(r.fnhrCompleted, false);
  });

  // ── Tier 5: Payment Settlement & Atomic Commit ───────────────────────────
  it("13. Payment Settlement & Atomic Commit: Confirmação de pagamento atualiza datas, adiciona payment e invalida assinatura", async () => {
    // 1. Inicia novo checkout para estender estadia de 11-13 para 11-14 (+1 diária = +R$ 160)
    const checkRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-11-11",
        newCheckoutDate: "2026-11-14",
        paymentMethod: "pix"
      })
    });
    assert.strictEqual(checkRes.status, 200);
    const checkData = await checkRes.json();
    const pendingId = checkData.pendingId;
    assert.strictEqual(checkData.additionalAmountToPay, 160);

    // 2. Antes do pagamento: datas no banco permanecem 11-11 a 11-13
    let db = getDb();
    let r = db.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(r.checkinDate, "2026-11-11");
    assert.strictEqual(r.checkoutDate, "2026-11-13");

    // 3. Simula liquidação financeira e consulta /modify-status
    const statusRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-status?pendingId=${pendingId}&simulatePayment=true`);
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();

    assert.strictEqual(statusData.success, true);
    assert.strictEqual(statusData.paid, true);
    assert.strictEqual(statusData.status, "paid");
    assert.strictEqual(statusData.committed, true);
    assert.strictEqual(statusData.newCheckinDate, "2026-11-11");
    assert.strictEqual(statusData.newCheckoutDate, "2026-11-14");
    assert.strictEqual(statusData.needsReSignature, true);
    assert.ok(statusData.reSignatureUrl);

    // 4. Verificação Atômica no Banco de Dados
    db = getDb();
    r = db.reservations.find(x => x.code === "RES-M1-001");

    // Datas atualizadas definitivamente
    assert.strictEqual(r.checkinDate, "2026-11-11");
    assert.strictEqual(r.checkoutDate, "2026-11-14");

    // Financeiro reconciliado
    assert.strictEqual(r.totalAmount, 480); // 320 + 160
    assert.strictEqual(r.paidAmount, 480);
    assert.strictEqual(r.paymentStatus, "pago_total");

    // Array de pagamentos contém a nova entrada
    assert.ok(Array.isArray(r.payments));
    const modPayment = r.payments.find(p => p.pendingId === pendingId || (p.notes && p.notes.includes("modificação")));
    assert.ok(modPayment, "Registro de pagamento da modificação deve estar em r.payments");
    assert.strictEqual(modPayment.amount, 160);

    // Histórico de modificações contém registro
    assert.ok(Array.isArray(r.modificationHistory));
    const modHistory = r.modificationHistory.find(m => m.pendingId === pendingId);
    assert.ok(modHistory, "Histórico deve conter a modificação");
    assert.strictEqual(modHistory.additionalAmountToPay, 160);

    // Invalidação obrigatória de assinatura
    assert.strictEqual(r.needsReSignature, true);
    assert.strictEqual(r.fnhrCompleted, false);

    // Hold temporário foi removido
    assert.strictEqual(r.pendingModification, undefined);

    // Auditoria gravada
    const settleLog = (r.auditLogs || []).find(a => a.action === "portal_modify_settled");
    assert.ok(settleLog, "Log de liquidação deve estar gravado na auditoria");
  });

  it("14. Idempotência de /modify-status: Consultas subsequentes confirmam status sem efeitos colaterais", async () => {
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-M1-001");
    const lastMod = r.modificationHistory[r.modificationHistory.length - 1];
    const pendingId = lastMod.pendingId;

    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-M1-001/modify-status?pendingId=${pendingId}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.paid, true);
    assert.strictEqual(data.status, "paid");
    assert.strictEqual(data.committed, true);
    assert.strictEqual(data.newCheckinDate, "2026-11-11");
    assert.strictEqual(data.newCheckoutDate, "2026-11-14");

    // Garante que pagamentos não foram duplicados
    const dbAfter = getDb();
    const rAfter = dbAfter.reservations.find(x => x.code === "RES-M1-001");
    assert.strictEqual(rAfter.totalAmount, 480);
    assert.strictEqual(rAfter.paidAmount, 480);
    assert.strictEqual(rAfter.payments.length, 2);
  });
});
