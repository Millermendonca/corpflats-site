/**
 * Empirical Challenge Suite: Provisional Hold & Calendar Locking Logic
 * Author: M1 Challenger 2
 * File: tests/challenger2-provisional-hold-locking.test.mjs
 * Execution: node --test tests/challenger2-provisional-hold-locking.test.mjs
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

const TEST_PORT = 3996;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-challenger2-db-${Date.now()}.json`);

let serverProcess = null;
let baselineAvailableFlatsCount = 0;

function killPortAndProcess(pid) {
  if (pid) {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch (_) {}
    try {
      execSync(`powershell -Command "Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue"`, { stdio: "ignore" });
    } catch (_) {}
  }
  try {
    execSync(`powershell -Command "Get-NetTCPConnection -LocalPort ${TEST_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  return JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
}

describe("Empirical Challenge Suite - Provisional Hold & Calendar Locking", () => {
  before(async () => {
    // 0. Clean port if occupied
    killPortAndProcess();
    await new Promise(r => setTimeout(r, 600));

    // 1. Prepare isolated test database starting from baseline database.json
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    // Ensure bot actions are enabled
    if (!initialDb.settings) initialDb.settings = {};
    initialDb.settings.apiActionsEnabled = true;

    if (!initialDb.botApiPermissions) initialDb.botApiPermissions = {};
    initialDb.botApiPermissions.checkAvailability = true;
    initialDb.botApiPermissions.createPreReservation = true;
    initialDb.botApiPermissions.commitReservation = true;

    // Use actual hotel flats: Flat 114 (id: 2) and Flat 116 (id: 3)
    if (!Array.isArray(initialDb.reservations)) initialDb.reservations = [];

    // R1: Direct WhatsApp booking on Flat 114 from 2026-12-01 to 2026-12-05
    const res114 = {
      id: 7001,
      code: "RES-CHALLENGE-114",
      guestName: "Alice Walker",
      guestEmail: "alice.walker@example.com",
      guestPhone: "5511999991111",
      flatId: 2,
      flatNumber: "114",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      guestCount: 2,
      dailyRate: 200,
      totalAmount: 800,
      paidAmount: 800,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      payments: [
        {
          id: "pay_init_chal",
          amount: 800,
          method: "pix",
          date: "2026-10-01T10:00:00.000Z"
        }
      ],
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z"
    };

    // R2: Confirmed reservation on Flat 116 from 2026-12-01 to 2026-12-05
    const res116 = {
      id: 7002,
      code: "RES-CHALLENGE-116",
      guestName: "Bob Singer",
      guestEmail: "bob.singer@example.com",
      guestPhone: "5511999992222",
      flatId: 3,
      flatNumber: "116",
      checkinDate: "2026-12-01",
      checkoutDate: "2026-12-05",
      guestCount: 2,
      dailyRate: 200,
      totalAmount: 800,
      paidAmount: 800,
      paymentStatus: "pago_total",
      status: "confirmada",
      channel: "whatsapp",
      fnhrCompleted: true,
      needsReSignature: false,
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z"
    };

    initialDb.reservations = initialDb.reservations.filter(r => !["RES-CHALLENGE-114", "RES-CHALLENGE-116"].includes(r.code));
    initialDb.reservations.push(res114, res116);

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server instance
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

    let stderrLogs = "";
    serverProcess.stderr.on("data", d => {
      stderrLogs += d.toString();
    });

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
      throw new Error(`Challenge server failed to start on port ${TEST_PORT}. Stderr: ${stderrLogs}`);
    }

    // Capture initial baseline availability for 2026-12-05 to 2026-12-08 BEFORE hold
    const baseAvailRes = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-12-05&checkout=2026-12-08`);
    const baseData = await baseAvailRes.json();
    baselineAvailableFlatsCount = baseData.totalAvailableFlats;
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killPortAndProcess(serverProcess.pid);
    } else {
      killPortAndProcess();
    }
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SHA-256 Parity between scripts/ and artifacts/
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 1: Paridade binária e SHA-256 estrita entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs", () => {
    const p1 = path.join(rootDir, "scripts/demo-server.mjs");
    const p2 = path.join(rootDir, "artifacts/api-server/demo-server.mjs");
    const b1 = fs.readFileSync(p1);
    const b2 = fs.readFileSync(p2);
    const h1 = crypto.createHash("sha256").update(b1).digest("hex");
    const h2 = crypto.createHash("sha256").update(b2).digest("hex");

    assert.strictEqual(h1, h2, "Os hashes SHA-256 de ambos os servidores devem ser idênticos.");
    assert.strictEqual(b1.equals(b2), true, "Os arquivos devem ser 100% idênticos byte-a-byte.");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Create Hold on Flat 114 for dates 2026-12-01 to 2026-12-08 (+3 days)
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 2: Criação de hold provisório no Flat 114 para prorrogação 2026-12-01..2026-12-08", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-114/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-01",
        newCheckoutDate: "2026-12-08",
        paymentMethod: "pix"
      })
    });

    assert.strictEqual(res.status, 200, "modify-checkout deve retornar 200 OK");
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.additionalAmountToPay, 600); // 3 diárias x 200 = 600
    assert.ok(data.pendingId);
    assert.strictEqual(data.holdMinutes, 30);
    assert.ok(data.expiresAt);

    // Invariante de Segurança: No banco de dados, datas continuam as ORIGINAIS (12-01 a 12-05)
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-CHALLENGE-114");
    assert.strictEqual(r.checkinDate, "2026-12-01");
    assert.strictEqual(r.checkoutDate, "2026-12-05");
    assert.strictEqual(r.totalAmount, 800);
    assert.ok(r.pendingModification, "pendingModification deve existir");
    assert.strictEqual(r.pendingModification.status, "pending");
    assert.strictEqual(r.pendingModification.newCheckoutDate, "2026-12-08");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Verification across ALL availability endpoints for overlapping periods
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 3A: GET /api/reservations/availability deduz Flat 114 do totalAvailableFlats no período do hold", async () => {
    // 1. Período cobrindo a extensão (12-05 a 12-08)
    const resExt = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-12-05&checkout=2026-12-08`);
    assert.strictEqual(resExt.status, 200);
    const dataExt = await resExt.json();
    // O totalAvailableFlats deve ter caído exatamente em 1 unidade (Flat 114 sob hold provisório)
    assert.strictEqual(
      dataExt.totalAvailableFlats,
      baselineAvailableFlatsCount - 1,
      `totalAvailableFlats deve subtrair Flat 114 sob hold (${dataExt.totalAvailableFlats} vs esperado ${baselineAvailableFlatsCount - 1})`
    );

    // 2. Período interno à extensão (12-06 a 12-07)
    const resMid = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-12-06&checkout=2026-12-07`);
    assert.strictEqual(resMid.status, 200);
    const dataMid = await resMid.json();
    assert.strictEqual(
      dataMid.totalAvailableFlats,
      baselineAvailableFlatsCount - 1,
      "Período interno ao hold também deve deduzir Flat 114 de totalAvailableFlats"
    );

    // 3. Período fora do hold (12-08 a 12-12) -> Flat 114 volta a estar disponível
    const resPost = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-12-08&checkout=2026-12-12`);
    assert.strictEqual(resPost.status, 200);
    const dataPost = await resPost.json();
    assert.strictEqual(
      dataPost.totalAvailableFlats,
      baselineAvailableFlatsCount,
      "A partir do término do hold (2026-12-08), totalAvailableFlats volta ao valor inicial"
    );
  });

  it("CHALLENGE 3B: GET /api/bot-actions/availability reporta Flat 114 como INDISPONÍVEL no período do hold", async () => {
    // Parâmetros snake_case / camelCase
    const resBot = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-05&checkOut=2026-12-08`);
    assert.strictEqual(resBot.status, 200);
    const dataBot = await resBot.json();
    const flat114Bot = (dataBot.flats || []).find(f => String(f.number) === "114");
    assert.strictEqual(flat114Bot, undefined, "Bot actions availability não deve listar Flat 114 sob hold ativo");
    // Outros flats livres (como 211) devem constar como disponíveis
    const flat211Bot = (dataBot.flats || []).find(f => String(f.number) === "211");
    assert.ok(flat211Bot, "Flat 211 deve estar disponível no bot actions");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Verification that attempting to create another reservation/hold fails with 409
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 4A: Tentativa de segundo hold no Flat 114 via /modify-preview falha com 409 CONFLICT", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-116/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-05",
        newCheckoutDate: "2026-12-08",
        newFlatNumber: "114"
      })
    });

    assert.strictEqual(res.status, 409, "Deve rejeitar com 409 CONFLICT");
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "CONFLICT");
    assert.match(data.message, /Flat 114 não possui disponibilidade/);
  });

  it("CHALLENGE 4B: Tentativa de segundo hold no Flat 114 via /modify-checkout falha com 409 CONFLICT", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-116/modify-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-05",
        newCheckoutDate: "2026-12-08",
        newFlatNumber: "114",
        paymentMethod: "pix"
      })
    });

    assert.strictEqual(res.status, 409, "Deve rejeitar /modify-checkout com 409 CONFLICT");
    const data = await res.json();
    assert.strictEqual(data.error, "FLAT_UNAVAILABLE");
    assert.match(data.message, /Flat 114 não possui disponibilidade/);
  });

  it("CHALLENGE 4C: Tentativa de pré-reserva no Flat 114 via /api/bot-actions/pre-reserve falha com 409 FLAT_UNAVAILABLE", async () => {
    const res = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: "114",
        checkIn: "2026-12-05",
        checkOut: "2026-12-08",
        guestName: "Charlie Brown",
        guestPhone: "5511988887777"
      })
    });

    assert.strictEqual(res.status, 409, "Bot pre-reserve deve retornar 409 FLAT_UNAVAILABLE quando flat está sob hold");
    const data = await res.json();
    assert.strictEqual(data.error, "FLAT_UNAVAILABLE");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Cancel the hold via /modify-cancel-pending and verify immediate availability
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 5: Cancelamento do hold via /modify-cancel-pending libera Flat 114 imediatamente", async () => {
    const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-114/modify-cancel-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    assert.strictEqual(cancelRes.status, 200, "Cancelamento do hold deve retornar 200 OK");
    const cancelData = await cancelRes.json();
    assert.strictEqual(cancelData.success, true);
    assert.strictEqual(cancelData.originalDates.checkinDate, "2026-12-01");
    assert.strictEqual(cancelData.originalDates.checkoutDate, "2026-12-05");

    // Banco de dados: hold removido, datas originais intactas
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-CHALLENGE-114");
    assert.strictEqual(r.pendingModification, undefined, "pendingModification deve ser deletado");
    assert.strictEqual(r.checkinDate, "2026-12-01");
    assert.strictEqual(r.checkoutDate, "2026-12-05");

    // Verificação IMEDIATA de disponibilidade:
    // 1. /api/reservations/availability: totalAvailableFlats volta imediatamente para baseline
    const availRes = await fetch(`${BASE_URL}/api/reservations/availability?checkin=2026-12-05&checkout=2026-12-08`);
    assert.strictEqual(availRes.status, 200);
    const availData = await availRes.json();
    assert.strictEqual(
      availData.totalAvailableFlats,
      baselineAvailableFlatsCount,
      "totalAvailableFlats deve retornar ao valor baseline após liberação do hold"
    );

    // 2. /api/bot-actions/availability agora deve conter Flat 114
    const botRes = await fetch(`${BASE_URL}/api/bot-actions/availability?checkIn=2026-12-05&checkOut=2026-12-08`);
    assert.strictEqual(botRes.status, 200);
    const botData = await botRes.json();
    const flat114Bot = (botData.flats || []).find(f => String(f.number) === "114");
    assert.ok(flat114Bot, "Flat 114 deve estar disponível no bot actions após cancelamento");

    // 3. /modify-preview para Flat 114 agora é aprovado com sucesso
    const previewRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-116/modify-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-05",
        newCheckoutDate: "2026-12-08",
        newFlatNumber: "114"
      })
    });
    assert.strictEqual(previewRes.status, 200);
    const previewData = await previewRes.json();
    assert.strictEqual(previewData.available, true, "modify-preview deve indicar disponibilidade imediata");

    // 4. Pré-reserva no bot actions em datas posteriores (12-10 a 12-12) tem sucesso
    const botPreRes = await fetch(`${BASE_URL}/api/bot-actions/pre-reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: "114",
        checkIn: "2026-12-10",
        checkOut: "2026-12-12",
        guestName: "Charlie Brown",
        guestPhone: "5511988887777"
      })
    });
    assert.strictEqual(botPreRes.status, 200, "pre-reserve deve suceder agora que o hold foi liberado");
    const botPreData = await botPreRes.json();
    assert.strictEqual(botPreData.success, true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Direct POST /modify strictly rejects unpaid stay extensions with 402 PAYMENT_REQUIRED
  // ──────────────────────────────────────────────────────────────────────────
  it("CHALLENGE 6A: Direct POST /modify rejeita estritamente prorrogação de estadia com 402 PAYMENT_REQUIRED", async () => {
    // RES-CHALLENGE-114: checkout original é 2026-12-05. Flat 114 está livre até 2026-12-10.
    // Tentativa de estender para 2026-12-07 (+2 diárias não pagas).
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-114/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-01",
        newCheckoutDate: "2026-12-07"
      })
    });

    assert.strictEqual(res.status, 402, "Direct POST /modify DEVE retornar 402 PAYMENT_REQUIRED para prorrogação não paga");
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, "PAYMENT_REQUIRED");
    assert.strictEqual(data.requiresPayment, true);
    assert.strictEqual(data.additionalAmountToPay, 400); // 2 x 200
    assert.match(data.message, /requer acréscimo de R\$ 400\.00/i);

    // Invariante de Segurança: Nenhuma alteração foi realizada nas datas da reserva no banco
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-CHALLENGE-114");
    assert.strictEqual(r.checkinDate, "2026-12-01");
    assert.strictEqual(r.checkoutDate, "2026-12-05");
    assert.strictEqual(r.totalAmount, 800);
  });

  it("CHALLENGE 6B: Direct POST /modify rejeita qualquer aumento de diárias mesmo com valores parciais", async () => {
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-114/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-01",
        newCheckoutDate: "2026-12-06" // +1 diária
      })
    });

    assert.strictEqual(res.status, 402, "Mesmo acréscimo de 1 diária deve retornar 402");
    const data = await res.json();
    assert.strictEqual(data.error, "PAYMENT_REQUIRED");
    assert.strictEqual(data.additionalAmountToPay, 200);
  });

  it("CHALLENGE 6C: Direct POST /modify aceita alteração de custo zero e invalida assinatura (needsReSignature = true)", async () => {
    // Deslocamento de datas mantendo 4 noites (2026-12-01..2026-12-05 -> 2026-12-02..2026-12-06)
    // Custo adicional = 0
    const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-CHALLENGE-114/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newCheckinDate: "2026-12-02",
        newCheckoutDate: "2026-12-06"
      })
    });

    assert.strictEqual(res.status, 200, "Custo zero deve ser aceito com 200 OK");
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.needsReSignature, true);

    // Banco de dados foi atualizado e assinatura invalidada
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-CHALLENGE-114");
    assert.strictEqual(r.checkinDate, "2026-12-02");
    assert.strictEqual(r.checkoutDate, "2026-12-06");
    assert.strictEqual(r.needsReSignature, true);
    assert.strictEqual(r.fnhrCompleted, false);
  });
});
