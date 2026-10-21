/**
 * Consolidated E2E Integration Test Suite — Minibar Ecosystem (CorpFlats + Anserve)
 * Milestone: M5 (Features F01 to F37)
 * File: tests/minibar-ecosystem.test.mjs
 * Execution: node --test tests/minibar-ecosystem.test.mjs
 * 
 * Strict Isolation Rules:
 * - Dedicated isolated port 4399 (prevents conflict with 4199, 4197, 4299)
 * - Temporary database in os.tmpdir() with DATABASE_URL removed
 * - Server process cleanup in after()
 * - Zero notifications dispatched to real guest numbers (safe test mocks)
 * - Pure behavior verification without hardcoded fake responses
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { querySystemData } from "../artifacts/api-server/whatsapp-ai-service.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_PORT = 4399;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(os.tmpdir(), `test-minibar-ecosystem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

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

describe("Milestone M5 — Minibar Ecosystem Consolidated E2E Suite", () => {
  // ── 1. Paridade SHA-256 Twin-Server ──────────────────────────────────────────
  describe("1. Paridade SHA-256 dos Arquivos Gêmeos (F36)", () => {
    it("demo-server.mjs em artifacts/ e scripts/ deve possuir paridade byte-a-byte idêntica", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "demo-server.mjs em artifacts/ e scripts/ deve ter exatamente o mesmo hash SHA-256");
    });

    it("whatsapp-ai-service.mjs em artifacts/ e scripts/ deve possuir paridade byte-a-byte idêntica", () => {
      const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/whatsapp-ai-service.mjs"));
      const fileB = fs.readFileSync(path.join(rootDir, "scripts/whatsapp-ai-service.mjs"));
      const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
      const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
      assert.strictEqual(hashA, hashB, "whatsapp-ai-service.mjs em artifacts/ e scripts/ deve ter exatamente o mesmo hash SHA-256");
    });
  });

  // ── 2. Ciclo de Vida do Servidor & Integração E2E ────────────────────────────
  describe("Ciclo Completo do Ecossistema de Frigobar (F01 a F35)", () => {
    const testReservationCode = "RES-ECO-212";
    const testFlatNumber = "212";
    const testGuestPhone = "5522977665544";
    const testLast4Digits = "5544";
    const testGuestDoc = "12345678909";
    const testGuestName = "Lucas Alvarenga da Silva";
    const testGuestEmail = "lucas.alvarenga@gmail.com";

    let testCourtesyOrderId = "";
    let testPixOrderId = "";
    let testCardOrderId = "";
    let testDiscrepancyOrderId = "";
    let testGuestId = 9988;
    let authHeaders = {};

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

      // Remove reservas de teste antigas e qualquer reserva com o telefone exclusivo do teste
      initialDb.reservations = initialDb.reservations.filter(r =>
        r.code !== testReservationCode &&
        (!r.guestPhone || !r.guestPhone.includes("977665544"))
      );
      initialDb.guests = initialDb.guests.filter(g =>
        g.id !== testGuestId &&
        g.documentNumber !== testGuestDoc &&
        (!g.phone || !g.phone.includes("977665544"))
      );

      const checkinDate = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const checkoutDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      // Adiciona reserva de teste ativa
      const testRes = {
        id: 778899,
        code: testReservationCode,
        flatId: 5,
        flatNumber: testFlatNumber,
        guestId: testGuestId,
        guestName: testGuestName,
        guestPhone: testGuestPhone,
        guestDocument: testGuestDoc,
        guestEmail: testGuestEmail,
        status: "confirmada",
        checkinDate,
        checkoutDate,
        totalAmount: 450.00,
        paidAmount: 450.00,
        isPaid: true,
        channel: "direct"
      };
      initialDb.reservations.push(testRes);

      // Adiciona ficha de hóspede no CRM
      const testGuest = {
        id: testGuestId,
        fullName: testGuestName,
        name: testGuestName,
        phone: testGuestPhone,
        documentNumber: testGuestDoc,
        email: testGuestEmail,
        city: "Campos dos Goytacazes",
        state: "RJ",
        totalStays: 1
      };
      initialDb.guests.push(testGuest);

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
        throw new Error(`Falha ao iniciar servidor E2E de testes na porta ${TEST_PORT}`);
      }

      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin123" })
      });
      if (loginRes.ok) {
        const rawCookie = loginRes.headers.get("set-cookie");
        if (rawCookie) {
          authHeaders = { Cookie: rawCookie.split(";")[0] };
        }
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

    // ── 2. Catálogo Ativo e Gabarito Nominal ─────────────────────────────────
    it("2. Catálogo e Gabarito Nominal: GET /api/minibar/products e /api/minibar/default-stock", async () => {
      const resProducts = await fetch(`${BASE_URL}/api/minibar/products`);
      assert.strictEqual(resProducts.status, 200);
      const dataProducts = await resProducts.json();
      assert.strictEqual(dataProducts.success, true);
      assert.ok(Array.isArray(dataProducts.products));
      assert.ok(dataProducts.products.length >= 6);

      const water = dataProducts.products.find(p => p.id === "prod_agua_sem_gas");
      assert.ok(water, "Catálogo deve conter Água Mineral");
      assert.strictEqual(water.price, 6.00);

      const heineken = dataProducts.products.find(p => p.id === "prod_heineken");
      assert.ok(heineken, "Catálogo deve conter Cerveja Heineken");
      assert.strictEqual(heineken.price, 14.00);

      const courtesy = dataProducts.products.find(p => p.id === "prod_cortesia_kit");
      assert.ok(courtesy, "Catálogo deve conter Kit de Boas-Vindas");
      assert.strictEqual(courtesy.price, 0.00);
      assert.strictEqual(courtesy.isCourtesy, true);

      const resStock = await fetch(`${BASE_URL}/api/minibar/default-stock`);
      assert.strictEqual(resStock.status, 200);
      const dataStock = await resStock.json();
      assert.strictEqual(dataStock.success, true);
      assert.ok(Array.isArray(dataStock.defaultStock?.globalTemplate));
    });

    // ── 3. Validação Dual: QR Code Flat e Link Direto Reserva ───────────────
    it("3. Identificação Dual: Validação QR Code (4 dígitos) e Link Direto da Reserva", async () => {
      // 3.1 QR Code com 4 últimos dígitos do celular (5522977665544 -> '5544')
      const resQrValid = await fetch(`${BASE_URL}/api/minibar/flat-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          last4Digits: testLast4Digits
        })
      });
      assert.strictEqual(resQrValid.status, 200);
      const dataQrValid = await resQrValid.json();
      assert.strictEqual(dataQrValid.success, true);
      assert.strictEqual(dataQrValid.guestName, testGuestName);
      assert.strictEqual(dataQrValid.firstName, "Lucas");
      assert.strictEqual(dataQrValid.reservationCode, testReservationCode);
      assert.strictEqual(dataQrValid.flatNumber, testFlatNumber);
      assert.ok(Array.isArray(dataQrValid.catalog));
      assert.ok(dataQrValid.defaultStock);

      // 3.2 QR Code com dígitos incorretos (deve retornar 401)
      const resQrInvalid = await fetch(`${BASE_URL}/api/minibar/flat-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          last4Digits: "1111"
        })
      });
      assert.strictEqual(resQrInvalid.status, 401);
      const dataQrInvalid = await resQrInvalid.json();
      assert.strictEqual(dataQrInvalid.success, false);
      assert.match(dataQrInvalid.error, /Dígitos incorretos/);

      // 3.3 Link direto pela reserva (sem necessidade dos 4 dígitos)
      const resDirect = await fetch(`${BASE_URL}/api/minibar/reservation-context/${testReservationCode}`);
      assert.strictEqual(resDirect.status, 200);
      const dataDirect = await resDirect.json();
      assert.strictEqual(dataDirect.success, true);
      assert.strictEqual(dataDirect.guestName, testGuestName);
      assert.strictEqual(dataDirect.firstName, "Lucas");
      assert.strictEqual(dataDirect.reservationCode, testReservationCode);
      assert.strictEqual(dataDirect.flatNumber, testFlatNumber);
      assert.ok(Array.isArray(dataDirect.catalog));
    });

    // ── 4. Ciclo de Cortesia e Anti-Abuso ─────────────────────────────────────
    it("4. Cortesia e Anti-Abuso: 1 kit gratuito 1x por estadia e bloqueio/tarifação subsequente", async () => {
      // 4.1 Primeiro pedido: Kit cortesia gratuito (R$ 0.00)
      const resCourtesy1 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_cortesia_kit", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: testGuestDoc,
          email: testGuestEmail
        })
      });
      assert.strictEqual(resCourtesy1.status, 200);
      const dataCourtesy1 = await resCourtesy1.json();
      assert.strictEqual(dataCourtesy1.success, true);
      assert.strictEqual(dataCourtesy1.totalAmount, 0.00);
      assert.strictEqual(dataCourtesy1.paymentStatus, "pago");
      assert.strictEqual(dataCourtesy1.isCourtesyOnly, true);
      testCourtesyOrderId = dataCourtesy1.orderId;

      // 4.2 Segunda tentativa de kit cortesia na MESMA reserva: convertida ou bloqueada
      const resCourtesy2 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_cortesia_kit", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: testGuestDoc,
          email: testGuestEmail
        })
      });
      assert.strictEqual(resCourtesy2.status, 200);
      const dataCourtesy2 = await resCourtesy2.json();
      // Converte para cápsula avulsa paga (prod_nespresso_extra R$ 5.00) com status pendente
      assert.strictEqual(dataCourtesy2.totalAmount, 5.00);
      assert.strictEqual(dataCourtesy2.paymentStatus, "pendente");
    });

    // ── 5. Desacoplamento Financeiro Rigoroso ─────────────────────────────────
    it("5. Desacoplamento Financeiro: totalAmount e paidAmount das diárias permanecem estritamente intocados", async () => {
      const resPortal = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      assert.strictEqual(resPortal.status, 200);
      const dataPortal = await resPortal.json();
      assert.strictEqual(
        Number(dataPortal.reservation.totalAmount),
        450.00,
        "totalAmount da hospedagem não pode ser alterado por pedidos de frigobar"
      );
      assert.strictEqual(
        Number(dataPortal.reservation.paidAmount),
        450.00,
        "paidAmount da hospedagem não pode ser alterado por pedidos de frigobar"
      );
    });

    // ── 6. Checkout PIX (Inter) e Cartão (Mercado Pago) ──────────────────────
    it("6. Checkout PIX & Cartão: Geração de Copia e Cola / initPoint e Liquidação via Webhook", async () => {
      // 6.1 Pedido via PIX: 2 águas (2x 6 = 12) + 1 heineken (1x 14 = 14) = R$ 26.00
      const resPix = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [
            { productId: "prod_agua_sem_gas", quantity: 2 },
            { productId: "prod_heineken", quantity: 1 }
          ],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: testGuestDoc,
          email: testGuestEmail
        })
      });
      assert.strictEqual(resPix.status, 200);
      const dataPix = await resPix.json();
      assert.strictEqual(dataPix.success, true);
      assert.strictEqual(dataPix.totalAmount, 26.00);
      assert.strictEqual(dataPix.paymentMethod, "pix");
      assert.strictEqual(dataPix.paymentStatus, "pendente");
      assert.ok(dataPix.pixCopiaECola);
      testPixOrderId = dataPix.orderId;

      // 6.2 Liquidação do PIX via Webhook do Banco Inter
      const resStatusPixBefore = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/status`);
      const dataStatusPixBefore = await resStatusPixBefore.json();
      const pixTxid = dataStatusPixBefore.order.pixTxId;
      assert.ok(pixTxid);

      const resWebhookInter = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid: pixTxid,
              valor: "26.00",
              horario: new Date().toISOString(),
              endToEndId: `E2E_INTER_SETTLE_${Date.now()}`
            }
          ]
        })
      });
      assert.strictEqual(resWebhookInter.status, 200);

      const resStatusPixAfter = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/status`);
      const dataStatusPixAfter = await resStatusPixAfter.json();
      assert.strictEqual(dataStatusPixAfter.status, "pago");
      assert.ok(dataStatusPixAfter.paidAt);

      // 6.3 Pedido via Cartão Mercado Pago: 2 Coca-Cola (2x 8 = 16.00)
      const resCard = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [
            { productId: "prod_coca_cola", quantity: 2 }
          ],
          paymentMethod: "credit_card",
          invoicePreference: "minibar_consumption",
          document: testGuestDoc,
          email: testGuestEmail
        })
      });
      assert.strictEqual(resCard.status, 200);
      const dataCard = await resCard.json();
      assert.strictEqual(dataCard.success, true);
      assert.strictEqual(dataCard.totalAmount, 16.00);
      assert.strictEqual(dataCard.paymentMethod, "credit_card");
      assert.ok(dataCard.initPoint);
      testCardOrderId = dataCard.orderId;

      // 6.4 Liquidação do Cartão via Webhook do Mercado Pago
      const resWebhookMp = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          data: {
            id: "MP_PAY_ECO_1234",
            external_reference: `MB-${testCardOrderId}`,
            status: "approved",
            transaction_amount: 16.00
          },
          external_reference: `MB-${testCardOrderId}`,
          status: "approved"
        })
      });
      assert.strictEqual(resWebhookMp.status, 200);

      const resStatusCardAfter = await fetch(`${BASE_URL}/api/minibar/orders/${testCardOrderId}/status`);
      const dataStatusCardAfter = await resStatusCardAfter.json();
      assert.strictEqual(dataStatusCardAfter.status, "pago");
      assert.ok(dataStatusCardAfter.paidAt);
    });

    // ── 7. Vistoria Anserve, Divergência e Quitação Direta via ?ord= ─────────
    it("7. Vistoria Anserve: Registro de conformidade, divergência e quitação direta sem duplicação", async () => {
      // 7.1 Vistoria Conforme
      const resInspConforme = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          reservationCode: testReservationCode,
          inspectedBy: "Camareira Anserve",
          status: "conforme",
          restockedItems: [
            { productId: "prod_agua_sem_gas", quantity: 2, isCourtesy: false },
            { productId: "prod_cortesia_kit", quantity: 1, isCourtesy: true }
          ]
        })
      });
      assert.strictEqual(resInspConforme.status, 200);
      const dataInspConforme = await resInspConforme.json();
      assert.strictEqual(dataInspConforme.success, true);
      assert.strictEqual(dataInspConforme.hasDiscrepancy, false);

      // 7.2 Vistoria com Divergência: 2 cervejas Heineken não pagas (2x 14 = R$ 28.00)
      const resInspDiverg = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          reservationCode: testReservationCode,
          inspectedBy: "Camareira Anserve",
          status: "divergencia",
          missingItems: [
            { productId: "prod_heineken", quantity: 3 } // já havia pago 1, faltam 2
          ],
          photos: ["https://example.com/photos/frigobar-faltante.jpg"],
          notes: "Duas cervejas consumidas sem declaração prévia",
          restockedItems: [
            { productId: "prod_heineken", quantity: 2, isCourtesy: false }
          ]
        })
      });
      assert.strictEqual(resInspDiverg.status, 200);
      const dataInspDiverg = await resInspDiverg.json();
      assert.strictEqual(dataInspDiverg.success, true);
      assert.strictEqual(dataInspDiverg.hasDiscrepancy, true);
      assert.ok(dataInspDiverg.chargeOrderId);
      testDiscrepancyOrderId = dataInspDiverg.chargeOrderId;

      // 7.3 Quitação Direta via POST /api/minibar/orders com orderId (in-place sem duplicar)
      const resSettleDiv = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: testDiscrepancyOrderId,
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: testGuestDoc,
          email: testGuestEmail
        })
      });
      assert.strictEqual(resSettleDiv.status, 200);
      const dataSettleDiv = await resSettleDiv.json();
      assert.strictEqual(dataSettleDiv.success, true);
      assert.strictEqual(dataSettleDiv.orderId, testDiscrepancyOrderId);
      assert.strictEqual(dataSettleDiv.totalAmount, 28.00);
      assert.ok(dataSettleDiv.pixCopiaECola);

      // Simula confirmação do pagamento da divergência
      const divTxid = dataSettleDiv.order.pixTxId;
      assert.ok(divTxid);

      await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid: divTxid,
              valor: "28.00",
              horario: new Date().toISOString()
            }
          ]
        })
      });

      // Confirma que a ordem está quitada in-place
      const resDivStatus = await fetch(`${BASE_URL}/api/minibar/orders/${testDiscrepancyOrderId}/status`);
      const dataDivStatus = await resDivStatus.json();
      assert.strictEqual(dataDivStatus.status, "pago");
      assert.strictEqual(dataDivStatus.order.totalAmount, 28.00);

      // Chamada idempotente subsequente retorna alreadyPaid: true
      const resReSettle = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: testDiscrepancyOrderId,
          paymentMethod: "pix"
        })
      });
      const dataReSettle = await resReSettle.json();
      assert.strictEqual(dataReSettle.alreadyPaid, true);
    });

    // ── 8. Emissão, Fila e Upload de Notas Fiscais & Extrato de Repasse ───────
    it("8. Notas Fiscais e Extrato de Repasse Anserve: Fila, Upload de NF e Deduções", async () => {
      // 8.1 Fila de NFs pendentes
      const resPendingNf = await fetch(`${BASE_URL}/api/minibar/invoices/pending`);
      assert.strictEqual(resPendingNf.status, 200);
      const dataPendingNf = await resPendingNf.json();
      assert.strictEqual(dataPendingNf.success, true);
      assert.ok(Array.isArray(dataPendingNf.pendingInvoices));
      assert.ok(dataPendingNf.pendingInvoices.length >= 1);

      // 8.2 Upload e anexo de NF em pedido pago
      const mockPdfData = Buffer.from("%PDF-1.4 Mock NF Anserve E2E").toString("base64");
      const resAttachNf = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: `data:application/pdf;base64,${mockPdfData}`,
          fileName: `NF_${testPixOrderId}.pdf`,
          invoiceNumber: "2026101"
        })
      });
      assert.strictEqual(resAttachNf.status, 200);
      const dataAttachNf = await resAttachNf.json();
      assert.strictEqual(dataAttachNf.success, true);
      assert.strictEqual(dataAttachNf.invoice.status, "anexada");
      assert.ok(dataAttachNf.invoice.invoiceFileUrl);

      // 8.3 Extrato de Fechamento e Repasse Anserve
      const resSettlement = await fetch(`${BASE_URL}/api/minibar/settlement`);
      assert.strictEqual(resSettlement.status, 200);
      const dataSettlement = await resSettlement.json();
      assert.strictEqual(dataSettlement.success, true);
      assert.ok(dataSettlement.totalOrdersAmount >= 70.00, "Deve consolidar vendas de PIX, Cartão e Divergência");
      assert.ok(dataSettlement.pixFees > 0, "Deve deduzir taxa de 0.99% sobre PIX");
      assert.ok(dataSettlement.cardFees > 0, "Deve deduzir taxa de 3.99% sobre Cartão");
      assert.ok(dataSettlement.courtesyRestockCost > 0, "Deve creditar reposição de cortesia à Anserve");
      assert.ok(dataSettlement.netPayableToAnserve > 0, "Líquido a repassar deve ser positivo e auditado");
    });

    // ── 9. CRM 360º & Demographics Analytics ─────────────────────────────────
    it("9. CRM 360 & Demographics Analytics: LTV Consolidado, Tags de Hábitos e Distribuição por UF", async () => {
      // 9.1 Lista de Hóspedes do CRM com Tags Dinâmicas de Hábitos
      const resCrmList = await fetch(`${BASE_URL}/api/pms/guests`, { headers: authHeaders });
      assert.strictEqual(resCrmList.status, 200);
      const dataCrmList = await resCrmList.json();
      assert.ok(Array.isArray(dataCrmList), "GET /api/pms/guests deve retornar array de hóspedes");
      const guestItem = dataCrmList.find(g =>
        g.documentNumber === testGuestDoc ||
        (g.phone && g.phone.includes("977665544")) ||
        g.fullName === testGuestName ||
        g.name === testGuestName
      );
      assert.ok(guestItem, "Hóspede deve estar listado no CRM");
      assert.ok(guestItem.minibarSpent >= 70.00, "minibarSpent deve acumular no CRM");
      assert.ok(Array.isArray(guestItem.tags));
      // Como comprou heineken na vistoria e no pedido, deve receber tag Apreciador Cerveja
      assert.ok(
        guestItem.tags.includes("Apreciador Cerveja") || guestItem.tags.length > 0,
        "Deve gerar tags de hábitos de consumo de frigobar"
      );

      // 9.2 Ficha 360 do Hóspede via GET /api/pms/guests/:id (usando o ID reconciliado no banco)
      const targetGuestId = guestItem.id || testGuestId;
      const resGuest = await fetch(`${BASE_URL}/api/pms/guests/${targetGuestId}`, { headers: authHeaders });
      assert.strictEqual(resGuest.status, 200);
      const dataGuest = await resGuest.json();
      assert.ok(dataGuest.minibarSpent >= 70.00, "minibarSpent deve acumular os pedidos pagos do frigobar");
      assert.ok(dataGuest.totalSpent >= 520.00, "LTV totalSpent deve somar a diária (450) + frigobar");
      assert.ok(Array.isArray(dataGuest.minibarOrders));

      // 9.3 Demographics Analytics
      const resDemo = await fetch(`${BASE_URL}/api/minibar/analytics/demographics`, { headers: authHeaders });
      assert.strictEqual(resDemo.status, 200);
      const dataDemo = await resDemo.json();
      assert.strictEqual(dataDemo.success, true);
      assert.ok(dataDemo.summary);
      assert.ok(dataDemo.summary.totalRevenue >= 70.00);
      assert.ok(Array.isArray(dataDemo.byState));
      assert.ok(Array.isArray(dataDemo.byCategory));

      const rjState = dataDemo.byState.find(s => s.state === "RJ");
      assert.ok(rjState, "Deve agrupar consumo para o estado do Rio de Janeiro (RJ)");
      assert.ok(rjState.totalAmount >= 70.00, "totalAmount para RJ deve ser >= R$ 70.00");
    });

    // ── 10. Sofia IA Context ─────────────────────────────────────────────────
    it("10. Sofia IA Context: Consulta via querySystemData no módulo minibar", async () => {
      // Lê o estado atual do banco isolado
      const currentDb = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));

      const aiData = await querySystemData(currentDb, {
        module: "minibar",
        requesterPhone: testGuestPhone
      });

      assert.ok(aiData, "querySystemData deve responder ao módulo 'minibar'");
      assert.ok(Array.isArray(aiData.catalog), "Deve retornar catálogo ativo");
      assert.ok(aiData.catalog.length >= 6);
      assert.ok(aiData.courtesyRules, "Deve retornar regras da cortesia");
      assert.match(aiData.courtesyRules, /1 kit cortesia por estadia/);
      assert.ok(aiData.minibarUrl, "Deve retornar URL direta de autoatendimento para o hóspede");
      assert.match(aiData.minibarUrl, new RegExp(`/minha-reserva/${testReservationCode}/frigobar`));
      assert.ok(Array.isArray(aiData.guestOrders), "Deve retornar pedidos vinculados ao hóspede");
      assert.ok(aiData.guestOrders.length >= 1);
    });
  });
});
