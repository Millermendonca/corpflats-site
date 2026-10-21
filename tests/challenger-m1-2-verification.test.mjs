/**
 * Empirical Adversarial Challenger Verification Suite — Milestone M1_2
 * Scope: Desacoplamento Financeiro, Webhooks Inter & Mercado Pago, Extrato de Repasse Anserve
 * File: tests/challenger-m1-2-verification.test.mjs
 * Execution: node --test tests/challenger-m1-2-verification.test.mjs
 * STRICT ISOLATION: Dedicated test port 4197, temp db file, process cleanup.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4197;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(os.tmpdir(), `test-challenger-m1-2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

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

describe("Challenger M1_2 — Empirical Adversarial Verification Suite", () => {
  const testReservationCode = "RES-CHALLENGER-101";
  const testFlatNumber = "101";
  const initialReservationTotal = 880.00;
  const initialReservationPaid = 880.00;

  const testDate = "2026-10-18";
  const outsideDate = "2026-08-15";

  let createdPixOrderId = "";
  let createdPixTxId = "";
  let createdCardOrderId = "";
  let createdCourtesyOrderId = "";
  let createdDiscrepancyOrderId = "";

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
    if (!Array.isArray(initialDb.users)) initialDb.users = [];
    if (!Array.isArray(initialDb.minibarProducts)) initialDb.minibarProducts = [];
    if (!Array.isArray(initialDb.minibarOrders)) initialDb.minibarOrders = [];
    if (!Array.isArray(initialDb.minibarInspections)) initialDb.minibarInspections = [];

    // 1. Setup reservation for Flat 101 with fixed totalAmount
    initialDb.reservations = initialDb.reservations.filter(r => r.code !== testReservationCode);
    const testRes = {
      id: 997722,
      code: testReservationCode,
      flatId: 1,
      flatNumber: testFlatNumber,
      guestName: "Roberto Adversarial de Souza",
      guestPhone: "5522998811223",
      guestDocument: "98765432100",
      guestEmail: "roberto.challenger@hotelsoho.com",
      status: "confirmada",
      checkinDate: new Date(Date.now() - 86400000).toISOString().split("T")[0],
      checkoutDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
      totalAmount: initialReservationTotal,
      paidAmount: initialReservationPaid,
      isPaid: true
    };
    initialDb.reservations.push(testRes);

    // 2. Setup custom minibar settings for settlement testing
    initialDb.minibarSettings = {
      anservePin: "1234",
      anserveMobileTokenSecret: "corpflats-anserve-secret",
      creditCardFeePercent: 3.99,
      pixFeePercent: 0.99,
      pixFeeFixed: 0.0,
      corpFlatsCommissionPercent: 10.0,
      courtesyReimbursementEnabled: true,
      autoNotifySofiaOnDiscrepancy: false, // Don't trigger Sofia during tests
      notificationManagerWhatsApp: "5522997124021"
    };

    // 3. Pre-seed controlled dataset for settlement mathematical testing
    // Período testDate: 2026-10-21
    initialDb.minibarOrders.push(
      // Pedido A: Cartão R$ 100.00 pago na data do teste
      {
        id: "ORD-SETTLE-CARD-100",
        reservationCode: "RES-OTHER-001",
        flatNumber: "201",
        paymentStatus: "pago",
        paymentMethod: "credit_card",
        totalAmount: 100.00,
        paidAt: `${testDate}T10:00:00.000Z`,
        items: [{ productId: "prod_heineken", quantity: 5, unitPrice: 20.00 }]
      },
      // Pedido B: PIX R$ 200.00 pago na data do teste
      {
        id: "ORD-SETTLE-PIX-200",
        reservationCode: "RES-OTHER-002",
        flatNumber: "202",
        paymentStatus: "pago",
        paymentMethod: "pix",
        totalAmount: 200.00,
        paidAt: `${testDate}T11:00:00.000Z`,
        items: [{ productId: "prod_agua_sem_gas", quantity: 10, unitPrice: 20.00 }]
      },
      // Pedido C: Cortesia R$ 0.00 paga na data do teste
      {
        id: "ORD-SETTLE-COURTESY-0",
        reservationCode: "RES-OTHER-003",
        flatNumber: "203",
        paymentStatus: "pago",
        paymentMethod: "cortesia",
        totalAmount: 0.00,
        paidAt: `${testDate}T12:00:00.000Z`,
        items: [{ productId: "prod_cortesia_kit", quantity: 1, unitPrice: 0.00 }]
      },
      // Pedido D: PIX R$ 50.00 PENDENTE na data do teste -> NÃO PODE ENTRAR NO REPASSE!
      {
        id: "ORD-SETTLE-PIX-PENDING-50",
        reservationCode: "RES-OTHER-004",
        flatNumber: "204",
        paymentStatus: "pendente",
        paymentMethod: "pix",
        totalAmount: 50.00,
        createdAt: `${testDate}T13:00:00.000Z`,
        items: [{ productId: "prod_coca_cola", quantity: 5, unitPrice: 10.00 }]
      },
      // Pedido E: Cartão R$ 80.00 pago FORA DO PERÍODO DO TESTE (2026-08-15)
      {
        id: "ORD-SETTLE-CARD-OUTSIDE-80",
        reservationCode: "RES-OTHER-005",
        flatNumber: "205",
        paymentStatus: "pago",
        paymentMethod: "credit_card",
        totalAmount: 80.00,
        paidAt: `${outsideDate}T10:00:00.000Z`,
        items: [{ productId: "prod_heineken", quantity: 4, unitPrice: 20.00 }]
      }
    );

    // Inspeção na data do teste com reposição de cortesias
    initialDb.minibarInspections.push(
      {
        id: "INSP-SETTLE-001",
        flatNumber: "201",
        inspectedAt: `${testDate}T15:00:00.000Z`,
        status: "conforme",
        restockedCourtesyTotalCost: 20.00, // 4 kits x R$ 5.00
        restockedPaidItemsTotalCost: 34.00,
        restockedItems: [
          { productId: "prod_cortesia_kit", quantity: 4, isCourtesy: true, unitCost: 5.00, totalCost: 20.00 }
        ]
      },
      // Inspeção fora do período (2026-08-15)
      {
        id: "INSP-SETTLE-OUTSIDE",
        flatNumber: "202",
        inspectedAt: `${outsideDate}T15:00:00.000Z`,
        status: "conforme",
        restockedCourtesyTotalCost: 50.00
      }
    );

    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

    const env = { ...process.env };
    delete env.DATABASE_URL;

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: {
        ...env,
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
      throw new Error(`Falha ao iniciar servidor de testes na porta ${TEST_PORT}`);
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

  // Helper to read current reservation from isolated db
  function getDbReservation() {
    const raw = fs.readFileSync(isolatedDbPath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.reservations.find(r => r.code === testReservationCode);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DESACOPLAMENTO FINANCEIRO: r.totalAmount INALTERADO SOB QUALQUER FLUXO
  // ═══════════════════════════════════════════════════════════════════════════
  describe("1. Prova Empírica de Desacoplamento Financeiro", () => {
    it("1.1 Baseline: Reserva possui totalAmount e paidAmount intactos", async () => {
      const res = getDbReservation();
      assert.strictEqual(res.totalAmount, initialReservationTotal);
      assert.strictEqual(res.paidAmount, initialReservationPaid);

      const portalRes = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      assert.strictEqual(portalRes.status, 200);
      const portalData = await portalRes.json();
      assert.strictEqual(portalData.reservation.totalAmount, initialReservationTotal);
      assert.strictEqual(portalData.reservation.paidAmount, initialReservationPaid);
    });

    it("1.2 Criar pedido cortesia (R$ 0.00) NÃO altera totalAmount da reserva", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_cortesia_kit", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalAmount, 0);
      assert.strictEqual(data.paymentStatus, "pago");
      createdCourtesyOrderId = data.orderId;

      // Verificação de Desacoplamento no DB e no Portal
      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "r.totalAmount deve ser 880.00");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid, "r.paidAmount deve ser 880.00");

      const portalRes = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const portalData = await portalRes.json();
      assert.strictEqual(portalData.reservation.totalAmount, initialReservationTotal);
    });

    it("1.3 Criar pedido PIX (R$ 26.00) pendente NÃO altera totalAmount da reserva", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [
            { productId: "prod_agua_sem_gas", quantity: 2 }, // 2x 6.00 = 12.00
            { productId: "prod_heineken", quantity: 1 }      // 1x 14.00 = 14.00 -> 26.00
          ],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalAmount, 26.00);
      assert.strictEqual(data.paymentStatus, "pendente");
      createdPixOrderId = data.orderId;
      assert.ok(data.order.pixTxId);
      createdPixTxId = data.order.pixTxId;

      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "Criação de pedido PIX não pode alterar reserva");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid);
    });

    it("1.4 Liquidar pedido PIX NÃO altera totalAmount da reserva", async () => {
      // Dispara webhook Banco Inter para liquidar o pedido PIX de R$ 26.00
      const resWebhook = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid: createdPixTxId,
              valor: "26.00",
              horario: new Date().toISOString(),
              endToEndId: `E2E_CHALLENGER_${Date.now()}`
            }
          ]
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      // Confirma que pedido foi liquidado
      const resStatus = await fetch(`${BASE_URL}/api/minibar/orders/${createdPixOrderId}/status`);
      const dataStatus = await resStatus.json();
      assert.strictEqual(dataStatus.status, "pago");

      // Desacoplamento Mandatório: reserva intacta
      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "Liquidação de pedido PIX não pode alterar reserva");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid);

      const portalRes = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const portalData = await portalRes.json();
      assert.strictEqual(portalData.reservation.totalAmount, initialReservationTotal);
    });

    it("1.5 Criar pedido Cartão (R$ 16.00) pendente NÃO altera totalAmount da reserva", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_coca_cola", quantity: 2 }], // 2x 8.00 = 16.00
          paymentMethod: "credit_card",
          invoicePreference: "minibar_consumption",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalAmount, 16.00);
      createdCardOrderId = data.orderId;

      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "Criação de pedido Cartão não pode alterar reserva");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid);
    });

    it("1.6 Registro de vistoria com divergência (cobrança pendente) NÃO altera totalAmount da reserva", async () => {
      // Repositora constata falta de 2 Heineken não pagas (2x 14.00 = 28.00)
      const resInsp = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          reservationCode: testReservationCode,
          inspectedBy: "Repositora Anserve",
          status: "divergencia",
          missingItems: [
            { productId: "prod_heineken", quantity: 3 } // 1 já foi paga antes no teste 1.3, sobram 2 não pagas
          ],
          restockedItems: [
            { productId: "prod_heineken", quantity: 2, isCourtesy: false, unitCost: 8.50 },
            { productId: "prod_cortesia_kit", quantity: 1, isCourtesy: true, unitCost: 5.00 }
          ]
        })
      });
      assert.strictEqual(resInsp.status, 200);
      const dataInsp = await resInsp.json();
      assert.strictEqual(dataInsp.success, true);
      assert.strictEqual(dataInsp.hasDiscrepancy, true);
      assert.strictEqual(dataInsp.inspection.discrepancyTotalAmount, 28.00);
      assert.ok(dataInsp.chargeOrderId);
      createdDiscrepancyOrderId = dataInsp.chargeOrderId;

      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "Apontamento de divergência não pode alterar totalAmount da reserva");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid);
    });

    it("1.7 Cancelamento/mutação no pedido de frigobar NÃO altera totalAmount da reserva", async () => {
      // Aguarda flush do debounce save do servidor
      await new Promise(r => setTimeout(r, 1200));

      // Simula cancelamento do pedido pendente de divergência
      const raw = fs.readFileSync(isolatedDbPath, "utf-8");
      const dbObj = JSON.parse(raw);
      const targetOrder = dbObj.minibarOrders.find(o => o.id === createdDiscrepancyOrderId);
      assert.ok(targetOrder, "Pedido de divergência deve existir no banco");
      targetOrder.paymentStatus = "cancelado";
      targetOrder.updatedAt = new Date().toISOString();
      fs.writeFileSync(isolatedDbPath, JSON.stringify(dbObj, null, 2), "utf-8");

      const rDb = getDbReservation();
      assert.strictEqual(rDb.totalAmount, initialReservationTotal, "Cancelamento de pedido de frigobar não pode alterar reserva");
      assert.strictEqual(rDb.paidAmount, initialReservationPaid);

      // Portal do hóspede deve listar o pedido mantendo reservation intacta
      const portalRes = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const portalData = await portalRes.json();
      assert.strictEqual(portalData.reservation.totalAmount, initialReservationTotal);
      assert.strictEqual(portalData.reservation.paidAmount, initialReservationPaid);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CONCILIAÇÃO DE WEBHOOKS: INTER & MERCADO PAGO
  // ═══════════════════════════════════════════════════════════════════════════
  describe("2. Conciliação de Webhooks Inter e Mercado Pago", () => {
    let orderToLiquidateInter = "";
    let txidToLiquidateInter = "";
    let orderToLiquidateMp = "";

    before(async () => {
      // Cria pedido PIX novo
      const resPix = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_agua_sem_gas", quantity: 1 }], // 6.00
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      const dataPix = await resPix.json();
      orderToLiquidateInter = dataPix.orderId;
      txidToLiquidateInter = dataPix.order.pixTxId;

      // Cria pedido Cartão novo
      const resCard = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_heineken", quantity: 2 }], // 28.00
          paymentMethod: "credit_card",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      const dataCard = await resCard.json();
      orderToLiquidateMp = dataCard.orderId;
    });

    it("2.1 Webhook Banco Inter com txId correto liquida o pedido (status = 'pago')", async () => {
      const resBefore = await fetch(`${BASE_URL}/api/minibar/orders/${orderToLiquidateInter}/status`);
      const dataBefore = await resBefore.json();
      assert.strictEqual(dataBefore.status, "pendente");

      const resWebhook = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid: txidToLiquidateInter,
              valor: "6.00",
              horario: new Date().toISOString(),
              endToEndId: `E2E_INTER_TEST_${Date.now()}`
            }
          ]
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      const resAfter = await fetch(`${BASE_URL}/api/minibar/orders/${orderToLiquidateInter}/status`);
      const dataAfter = await resAfter.json();
      assert.strictEqual(dataAfter.status, "pago", "Pedido PIX com txId correto deve ter status 'pago'");
      assert.ok(dataAfter.paidAt);
      assert.ok(dataAfter.order.pixEndToEndId);
    });

    it("2.2 [Adversarial] Webhook Banco Inter com txId divergente NÃO liquida o pedido", async () => {
      // Cria outro pedido PIX
      const resPix = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_agua_sem_gas", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      const dataPix = await resPix.json();
      const pendingOrderId = dataPix.orderId;

      // Dispara webhook com txId errado
      const resWebhook = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid: "TXID_TOTALMENTE_INVALIDO_99999",
              valor: "6.00",
              horario: new Date().toISOString()
            }
          ]
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      const resStatus = await fetch(`${BASE_URL}/api/minibar/orders/${pendingOrderId}/status`);
      const dataStatus = await resStatus.json();
      assert.strictEqual(dataStatus.status, "pendente", "Pedido não pode ser liquidado com txId incorreto");
    });

    it("2.3 Webhook Mercado Pago com payment.id e external_reference aprovado liquida o pedido para 'pago'", async () => {
      const resBefore = await fetch(`${BASE_URL}/api/minibar/orders/${orderToLiquidateMp}/status`);
      const dataBefore = await resBefore.json();
      assert.strictEqual(dataBefore.status, "pendente");

      const externalRef = "MB-" + orderToLiquidateMp;
      const paymentId = "MP_PAY_" + Date.now();

      // Dispara webhook Mercado Pago simulando aprovação com external_reference
      const resWebhook = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          action: "payment.updated",
          data: {
            id: paymentId,
            external_reference: externalRef,
            status: "approved",
            transaction_amount: 28.00
          },
          external_reference: externalRef,
          status: "approved"
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      // Checa se o pedido foi liquidado
      const resAfter = await fetch(`${BASE_URL}/api/minibar/orders/${orderToLiquidateMp}/status`);
      const dataAfter = await resAfter.json();

      console.log(`[CHALLENGER OBSERVATION] Mercado Pago webhook status pós-disparo: order=${orderToLiquidateMp}, status=${dataAfter.status}`);
      assert.strictEqual(
        dataAfter.status,
        "pago",
        "Pedido de frigobar deve ser liquidado com status 'pago' após webhook do Mercado Pago com external_reference aprovado"
      );
      assert.ok(dataAfter.paidAt);
      assert.ok(dataAfter.order.mpPaymentId);
    });

    it("2.4 [Adversarial] Webhook Mercado Pago com status não aprovado (in_process) NÃO liquida o pedido", async () => {
      // Cria pedido Cartão adicional
      const resCard = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_coca_cola", quantity: 1 }],
          paymentMethod: "credit_card",
          invoicePreference: "detailed",
          document: "98765432100",
          email: "roberto.challenger@hotelsoho.com"
        })
      });
      const dataCard = await resCard.json();
      const pendingCardOrderId = dataCard.orderId;
      const externalRef = "MB-" + pendingCardOrderId;

      // Dispara webhook Mercado Pago com status em processamento
      const resWebhook = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          action: "payment.updated",
          data: {
            id: "MP_PAY_PENDING_" + Date.now(),
            external_reference: externalRef,
            status: "in_process"
          },
          external_reference: externalRef,
          status: "in_process"
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      const resAfter = await fetch(`${BASE_URL}/api/minibar/orders/${pendingCardOrderId}/status`);
      const dataAfter = await resAfter.json();
      assert.strictEqual(dataAfter.status, "pendente", "Pedido não pode ser liquidado se webhook MP não estiver aprovado");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. CÁLCULO MATEMÁTICO DO EXTRATO DE REPASSE ANSERVE (/api/minibar/settlement)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("3. Teste Matemático Rigoroso do Extrato de Repasse Anserve", () => {
    it("3.1 Validação exata da dedução de 0.99% sobre PIX e repasse líquido Anserve", async () => {
      // Período testDate: 2026-10-18
      // Contém os pedidos pré-carregados:
      // - ORD-SETTLE-CARD-100: R$ 100.00 (cartão)
      // - ORD-SETTLE-PIX-200: R$ 200.00 (pix)
      // - ORD-SETTLE-COURTESY-0: R$ 0.00 (cortesia)
      // Total Vendas Brutas Pagas = 300.00
      const res = await fetch(`${BASE_URL}/api/minibar/settlement?startDate=${testDate}&endDate=${testDate}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      // 1. Total de Vendas Brutas Pagas
      assert.strictEqual(data.totalOrdersAmount, 300.00, "Vendas brutas pagas no período devem ser 300.00");
      assert.strictEqual(data.ordersCount, 3, "Devem ser exatamente 3 pedidos pagos no período");
      assert.strictEqual(data.cardOrdersAmount, 100.00, "Vendas em cartão devem ser 100.00");
      assert.strictEqual(data.pixOrdersAmount, 200.00, "Vendas em pix devem ser 200.00");

      // 2. Taxas de Adquirência
      // Cartão: 100.00 * 3.99% = 3.99
      assert.strictEqual(data.cardFees, 3.99, "Taxa de cartão deve ser R$ 3.99");
      // PIX: 200.00 * 0.99% = 1.98 (dedução exata de 0.99% sobre vendas PIX)
      assert.strictEqual(data.pixFees, 1.98, "Taxa de PIX deve ser R$ 1.98 (exatos 0.99% sobre R$ 200.00)");

      // 3. Comissão CorpFlats
      // 300.00 * 10% = 30.00
      assert.strictEqual(data.commissionCorpFlats, 30.00, "Comissão CorpFlats deve ser R$ 30.00");

      // 4. Reembolso de Cortesias da CorpFlats para a Anserve
      // 1 inspeção com restockedCourtesyTotalCost = 20.00
      assert.strictEqual(data.courtesyRestockCost, 20.00, "Custo de cortesias deve ser R$ 20.00");
      assert.strictEqual(data.inspectionsCount, 1, "Deve considerar 1 inspeção no período");

      // 5. Repasse Líquido Exato para a Anserve
      // netPayableToAnserve = totalOrdersAmount - cardFees - pixFees - commissionCorpFlats + courtesyRestockCost
      // = 300.00 - 3.99 - 1.98 - 30.00 + 20.00 = 284.03
      const expectedNet = 300.00 - 3.99 - 1.98 - 30.00 + 20.00; // 284.03
      assert.strictEqual(data.netPayableToAnserve, Number(expectedNet.toFixed(2)), "Repasse líquido deve ser exatamente R$ 284.03");
    });

    it("3.2 Filtragem por data isola períodos sem vazamento", async () => {
      // Período correspondente a outsideDate (2026-08-15)
      const res = await fetch(`${BASE_URL}/api/minibar/settlement?startDate=${outsideDate}&endDate=${outsideDate}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      assert.strictEqual(data.totalOrdersAmount, 80.00, "Apenas pedido de 80.00 deve ser contabilizado");
      assert.strictEqual(data.ordersCount, 1);
      assert.strictEqual(data.cardOrdersAmount, 80.00);
      assert.strictEqual(data.pixOrdersAmount, 0.00);
      assert.strictEqual(data.courtesyRestockCost, 50.00, "Apenas inspeção de 50.00 deve ser contabilizada");
      assert.strictEqual(data.inspectionsCount, 1);

      // 80 - (80 * 3.99%) - 0 - (80 * 10%) + 50 = 80 - 3.19 - 8.00 + 50 = 118.81
      const expectedNet = 80.00 - (80 * 0.0399) - (80 * 0.10) + 50.00;
      assert.strictEqual(data.netPayableToAnserve, Number(expectedNet.toFixed(2)));
    });
  });
});
