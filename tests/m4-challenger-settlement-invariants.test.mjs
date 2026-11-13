/**
 * Empirical Challenge Suite: M4 Settlement Invariants, Concurrency Mutex & Test Isolation
 * Author: M4 Challenger 1
 * File: tests/m4-challenger-settlement-invariants.test.mjs
 * Execution: node --test tests/m4-challenger-settlement-invariants.test.mjs
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

const TEST_PORT = 3997;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(rootDir, `data/test-m4-challenger-db-${Date.now()}.json`);

let serverProcess = null;

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getDb() {
  for (let i = 0; i < 5; i++) {
    try {
      const raw = fs.readFileSync(isolatedDbPath, "utf-8");
      return JSON.parse(raw);
    } catch (e) {
      if (i === 4) throw e;
      execSync("powershell -Command \"Start-Sleep -Milliseconds 60\"");
    }
  }
}

describe("M4 Challenger Empirical Verification Suite", () => {
  before(async () => {
    // 0. Port hygiene
    try {
      const netstatOutput = execSync(`netstat -ano | findstr :${TEST_PORT}`, { encoding: "utf8" });
      for (const line of netstatOutput.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].endsWith(`:${TEST_PORT}`)) {
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0") killProcessTree(pid);
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (_) {}

    // 1. Prepare baseline DB
    const initialDb = fs.existsSync(prodDbPath)
      ? JSON.parse(fs.readFileSync(prodDbPath, "utf-8"))
      : {};

    initialDb.flats = [
      { id: 1, number: "113", isOccupied: false },
      { id: 2, number: "114", isOccupied: false },
      { id: 3, number: "116", isOccupied: false }
    ];

    initialDb.reservations = [
      // Target for Concurrency Stress Test
      {
        id: 4001,
        code: "RES-STRESS-CONC",
        guestName: "Stress Concurrency User",
        guestEmail: "stress.conc@example.com",
        guestPhone: "5521999994001",
        guestDocument: "11122233344",
        flatId: 2,
        flatNumber: "114",
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
            id: "pay_initial_4001",
            amount: 320,
            method: "pix",
            date: "2026-10-01T12:00:00Z"
          }
        ]
      },
      // Target for Expired Hold Settlement Test
      {
        id: 4002,
        code: "RES-EXPIRED-HOLD",
        guestName: "Expired Hold User",
        guestEmail: "expired.hold@example.com",
        guestPhone: "5521999994002",
        guestDocument: "22233344455",
        flatId: 3,
        flatNumber: "116",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-17",
        guestCount: 1,
        dailyRate: 150,
        totalAmount: 300,
        paidAmount: 300,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto",
        fnhrCompleted: true,
        needsReSignature: false,
        pendingModification: {
          pendingId: "mod_expired_test_999",
          newCheckinDate: "2026-11-15",
          newCheckoutDate: "2026-11-20",
          newFlatNumber: "116",
          newFlatId: 3,
          additionalAmountToPay: 450,
          status: "pending",
          expiresAt: new Date(Date.now() - 300000).toISOString(), // Expired 5 mins ago
          createdAt: new Date(Date.now() - 2100000).toISOString()
        },
        payments: [
          {
            id: "pay_initial_4002",
            amount: 300,
            method: "pix",
            date: "2026-10-01T12:00:00Z"
          }
        ]
      },
      // Target for Conflict Blocking Test (Hold Owner)
      {
        id: 4003,
        code: "RES-HOLD-OWNER",
        guestName: "Hold Owner User",
        guestEmail: "owner@example.com",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-01",
        checkoutDate: "2026-12-03",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "whatsapp"
      },
      // Third party attempting conflicting dates
      {
        id: 4004,
        code: "RES-THIRD-PARTY",
        guestName: "Third Party Guest",
        guestEmail: "thirdparty@example.com",
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-12-20",
        checkoutDate: "2026-12-22",
        dailyRate: 170,
        totalAmount: 340,
        paidAmount: 340,
        paymentStatus: "pago_total",
        status: "confirmada",
        channel: "site_direto"
      }
    ];

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    // 2. Spawn isolated server
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

    let isReady = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/system/version`);
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!isReady) {
      throw new Error(`Servidor de teste não inicializou na porta ${TEST_PORT}`);
    }
  });

  after(async () => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    await new Promise((r) => setTimeout(r, 400));
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenge 1: Stress Test Concurrent Polling & In-Flight Mutex Locking
  // ═══════════════════════════════════════════════════════════════════════════
  let stressPendingId = null;

  describe("Challenge 1: Concurrency Mutex & Double Settlement Stress Test", () => {
    it("1.1. Dispara 10 requisições simultâneas de liquidação (/modify-status?simulatePayment=true) e assegura que não há duplicação", async () => {
      // 1. Cria checkout com hold de prorrogação (+2 diárias = +R$ 320)
      const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-STRESS-CONC/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-14", // +2 noites
          paymentMethod: "pix"
        })
      });
      assert.strictEqual(checkoutRes.status, 200);
      const checkoutData = await checkoutRes.json();
      assert.strictEqual(checkoutData.success, true);
      assert.strictEqual(checkoutData.additionalAmountToPay, 320);
      stressPendingId = checkoutData.pendingId;
      assert.ok(stressPendingId);
      const pendingId = stressPendingId;

      // 2. Dispara 10 requisições simultâneas em paralelo com simulatePayment=true
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${BASE_URL}/api/pms/guest-portal/RES-STRESS-CONC/modify-status?pendingId=${pendingId}&simulatePayment=true`)
      );

      const responses = await Promise.all(requests);
      assert.strictEqual(responses.length, 10);

      // Todas devem responder 200 com paid: true
      for (const res of responses) {
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.paid, true);
        assert.strictEqual(data.status, "paid");
        assert.strictEqual(data.committed, true);
      }

      // 3. Inspeção rigorosa no banco de dados isolado
      const db = getDb();
      const r = db.reservations.find((x) => x.code === "RES-STRESS-CONC");

      // Invariante 1: Datas foram atualizadas para 2026-11-14
      assert.strictEqual(r.checkoutDate, "2026-11-14");

      // Invariante 2: totalAmount deve ser EXATAMENTE 320 + 320 = 640 (NÃO 3520)
      assert.strictEqual(r.totalAmount, 640, `totalAmount deve ser 640, encontrado: ${r.totalAmount}`);
      assert.strictEqual(r.paidAmount, 640, `paidAmount deve ser 640, encontrado: ${r.paidAmount}`);

      // Invariante 3: r.payments deve conter EXATAMENTE 2 pagamentos (o inicial de 320 e 1 acréscimo de 320)
      assert.strictEqual(r.payments.length, 2, `r.payments deve conter 2 registros, encontrado: ${r.payments.length}`);
      const addedPayments = r.payments.filter((p) => p.pendingId === pendingId);
      assert.strictEqual(addedPayments.length, 1, `Apenas 1 pagamento deve estar vinculado ao pendingId ${pendingId}`);
      assert.strictEqual(addedPayments[0].amount, 320);

      // Invariante 4: modificationHistory deve conter EXATAMENTE 1 registro para este pendingId
      const historyEntries = (r.modificationHistory || []).filter((m) => m.pendingId === pendingId);
      assert.strictEqual(historyEntries.length, 1, "modificationHistory deve ter exatamente 1 entrada");
      assert.strictEqual(historyEntries[0].additionalAmountToPay, 320);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenge 2: Expired Holds Invariant
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Challenge 2: Expired Holds Cannot Be Settled", () => {
    it("2.1. Hold expirado deve retornar status 'expired', recusar liquidação e preservar datas originais", async () => {
      // Tenta liquidar o hold vencido de RES-EXPIRED-HOLD
      const settleRes = await fetch(
        `${BASE_URL}/api/pms/guest-portal/RES-EXPIRED-HOLD/modify-status?pendingId=mod_expired_test_999&simulatePayment=true`
      );
      assert.strictEqual(settleRes.status, 200);
      const data = await settleRes.json();

      assert.strictEqual(data.success, true);
      assert.strictEqual(data.paid, false, "Hold expirado não pode ser considerado pago");
      assert.strictEqual(data.status, "expired", "Status retornado deve ser 'expired'");
      assert.strictEqual(data.committed, false, "committed deve ser false para hold expirado");
      assert.match(data.message, /expirou/i);

      // Verificação no banco: datas originais intactas
      const db = getDb();
      const r = db.reservations.find((x) => x.code === "RES-EXPIRED-HOLD");
      assert.strictEqual(r.checkoutDate, "2026-11-17", "checkoutDate original deve permanecer inalterado");
      assert.strictEqual(r.totalAmount, 300, "totalAmount não deve sofrer acréscimo");
      assert.strictEqual(r.paidAmount, 300, "paidAmount não deve sofrer acréscimo");
      assert.strictEqual(r.payments.length, 1, "Nenhum novo pagamento deve ter sido registrado");
      assert.strictEqual(r.pendingModification.status, "expired");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenge 3: Provisional Hold Blocks Conflicting Bookings & Frees on Cancel
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Challenge 3: Provisional Hold Calendar Guard & Release Lifecycle", () => {
    let holdPendingId = null;

    it("3.1. Cria hold provisório no Flat 113 de 2026-12-05 a 2026-12-10", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-HOLD-OWNER/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-05",
          newCheckoutDate: "2026-12-10",
          paymentMethod: "pix"
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      holdPendingId = data.pendingId;
      assert.ok(holdPendingId);
    });

    it("3.2. Terceiro tentando simulação (/modify-preview) no mesmo flat 113 em datas sobrepostas é bloqueado por conflito", async () => {
      const previewRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-THIRD-PARTY/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-07",
          newCheckoutDate: "2026-12-12"
        })
      });
      assert.strictEqual(previewRes.status, 409, "Simulação concorrente sobre período em hold deve retornar 409 Conflict");
      const previewData = await previewRes.json();

      assert.strictEqual(previewData.available, false, "Flat 113 deve estar indisponível devido ao hold provisório ativo");
      assert.match(previewData.conflictMessage, /disponibilidade|conflito/i);
    });

    it("3.3. Terceiro tentando checkout (/modify-checkout) nas mesmas datas é rejeitado com 409 Conflict", async () => {
      const checkoutRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-THIRD-PARTY/modify-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-07",
          newCheckoutDate: "2026-12-12",
          paymentMethod: "pix"
        })
      });
      assert.strictEqual(checkoutRes.status, 409, "Checkout concorrente sobre período em hold deve falhar com 409");
      const checkoutData = await checkoutRes.json();
      assert.strictEqual(checkoutData.error, "FLAT_UNAVAILABLE");
      assert.match(checkoutData.message, /disponibilidade|conflito/i);
    });

    it("3.4. Cancelamento do hold provisório (/modify-cancel-pending) libera o calendário imediatamente", async () => {
      const cancelRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-HOLD-OWNER/modify-cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId: holdPendingId })
      });
      assert.strictEqual(cancelRes.status, 200);
      const cancelData = await cancelRes.json();
      assert.strictEqual(cancelData.success, true);

      // Agora terceiro faz simulação nas mesmas datas e deve ser aceito
      const previewRes = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-THIRD-PARTY/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-12-07",
          newCheckoutDate: "2026-12-12"
        })
      });
      assert.strictEqual(previewRes.status, 200);
      const previewData = await previewRes.json();
      assert.strictEqual(previewData.available, true, "Flat 113 deve estar disponível após cancelamento do hold");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Challenge 4: Subsequent Polling Post-Settlement Invariant
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Challenge 4: Subsequent Polling & Idempotency Post-Settlement", () => {
    it("4.1. Consultas repetidas com pendingId após liquidação retornam committed: true sem adicionar novos pagamentos", async () => {
      // Usa RES-STRESS-CONC que já foi liquidada
      const dbBefore = getDb();
      const rBefore = dbBefore.reservations.find((x) => x.code === "RES-STRESS-CONC");
      const paymentsCountBefore = rBefore.payments.length;
      const totalAmountBefore = rBefore.totalAmount;

      // Dispara 5 consultas seguidas de status passando o pendingId liquidado
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-STRESS-CONC/modify-status?pendingId=${stressPendingId}`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.paid, true);
        assert.strictEqual(data.status, "paid");
        assert.strictEqual(data.committed, true);
      }

      const dbAfter = getDb();
      const rAfter = dbAfter.reservations.find((x) => x.code === "RES-STRESS-CONC");
      assert.strictEqual(rAfter.payments.length, paymentsCountBefore, "Nenhum pagamento adicional deve ter sido inserido");
      assert.strictEqual(rAfter.totalAmount, totalAmountBefore, "Valor total não pode sofrer alteração após liquidação prévia");
    });

    it("4.2. Consulta subsequente sem pendingId retorna status 'none' quando não há hold ativo", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-STRESS-CONC/modify-status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, "none");
      assert.strictEqual(data.committed, false);
      assert.strictEqual(data.paid, false);
    });
  });
});
