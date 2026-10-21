/**
 * Test Suite: Minibar Backend Core, Persistence & APIs (Features F01 to F10)
 * File: tests/minibar-backend-flow.test.mjs
 * Execution: node --test tests/minibar-backend-flow.test.mjs
 * Rule: STRICT ISOLATION. Never execute global scans (tests/*.test.mjs).
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

const TEST_PORT = 4199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const prodDbPath = path.join(rootDir, "data/database.json");
const isolatedDbPath = path.join(os.tmpdir(), `test-minibar-db-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);

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

describe("Milestone M1 — Minibar Backend Core & APIs Suite", () => {
  // ── 1. Paridade Twin-Server SHA-256 ───────────────────────────────────────
  it("F01 / Paridade SHA-256: demo-server.mjs em artifacts/ e scripts/ devem ter hashes idênticos byte-a-byte", () => {
    const fileA = fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs"));
    const fileB = fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs"));
    const hashA = crypto.createHash("sha256").update(fileA).digest("hex");
    const hashB = crypto.createHash("sha256").update(fileB).digest("hex");
    assert.strictEqual(hashA, hashB, "Arquivos gêmeos de demo-server.mjs devem possuir paridade exata SHA-256");
  });

  // ── 2. Ciclo de Vida do Servidor & Integração HTTP ────────────────────────
  describe("APIs de Frigobar — Ciclo Pontual de Execução", () => {
    let testReservationCode = "RES-212-MINIBAR";
    let testFlatNumber = "212";
    let createdProductId = "";
    let testPixOrderId = "";
    let testCardOrderId = "";
    let courtesyOrderId = "";
    let discrepancyOrderId = "";

    before(async () => {
      // Prepara banco isolado em os.tmpdir() com reserva de teste no flat 212
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

      // Adiciona reserva de teste ativa para o Flat 212
      initialDb.reservations = initialDb.reservations.filter(r => r.code !== testReservationCode);
      const testRes = {
        id: 998811,
        code: testReservationCode,
        flatId: 5,
        flatNumber: testFlatNumber,
        guestName: "Lucas Alvarenga da Silva",
        guestPhone: "5522998877665",
        guestDocument: "12345678909",
        guestEmail: "lucas.alvarenga@gmail.com",
        status: "confirmada",
        checkinDate: new Date(Date.now() - 86400000).toISOString().split("T")[0],
        checkoutDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
        totalAmount: 450.00,
        paidAmount: 450.00,
        isPaid: true
      };
      initialDb.reservations.push(testRes);

      fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDb, null, 2), "utf-8");

      // Inicia processo do servidor em porta isolada com DATABASE_URL removida
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

      // Aguarda o servidor inicializar
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

    // ── F01 & F02: Catálogo de Produtos e Gabarito ─────────────────────────
    it("F01/F02: GET /api/minibar/products deve retornar catálogo inicial com produtos padrão essenciais", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/products`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.products));
      assert.ok(data.products.length >= 6);

      const agua = data.products.find(p => p.id === "prod_agua_sem_gas");
      assert.ok(agua, "Deve conter água sem gás");
      assert.strictEqual(agua.price, 6.00);

      const heineken = data.products.find(p => p.id === "prod_heineken");
      assert.ok(heineken, "Deve conter cerveja heineken");
      assert.strictEqual(heineken.price, 14.00);

      const cortesia = data.products.find(p => p.id === "prod_cortesia_kit");
      assert.ok(cortesia, "Deve conter kit de cortesia gratuito");
      assert.strictEqual(cortesia.isCourtesy, true);
      assert.strictEqual(cortesia.price, 0.00);
    });

    it("F02: POST, PATCH e DELETE /api/minibar/products gerenciam ciclo de vida de itens", async () => {
      // POST
      const resCreate = await fetch(`${BASE_URL}/api/minibar/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Chocolate KitKat 41.5g",
          category: "snacks",
          price: 7.50,
          cost: 3.80,
          description: "Waffle coberto com chocolate ao leite"
        })
      });
      assert.strictEqual(resCreate.status, 200);
      const dataCreate = await resCreate.json();
      assert.strictEqual(dataCreate.success, true);
      assert.ok(dataCreate.product?.id);
      createdProductId = dataCreate.product.id;
      assert.strictEqual(dataCreate.product.price, 7.50);

      // PATCH
      const resPatch = await fetch(`${BASE_URL}/api/minibar/products/${createdProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: 8.00 })
      });
      assert.strictEqual(resPatch.status, 200);
      const dataPatch = await resPatch.json();
      assert.strictEqual(dataPatch.success, true);
      assert.strictEqual(dataPatch.product.price, 8.00);

      // DELETE
      const resDel = await fetch(`${BASE_URL}/api/minibar/products/${createdProductId}`, {
        method: "DELETE"
      });
      assert.strictEqual(resDel.status, 200);
      const dataDel = await resDel.json();
      assert.strictEqual(dataDel.success, true);
    });

    it("F02: GET & PUT /api/minibar/default-stock gerenciam gabarito padrão por flat", async () => {
      const resGet = await fetch(`${BASE_URL}/api/minibar/default-stock`);
      assert.strictEqual(resGet.status, 200);
      const dataGet = await resGet.json();
      assert.strictEqual(dataGet.success, true);
      assert.ok(Array.isArray(dataGet.defaultStock?.globalTemplate));

      // PUT override para flat 212
      const resPut = await fetch(`${BASE_URL}/api/minibar/default-stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatOverrides: {
            "212": [
              { productId: "prod_agua_sem_gas", defaultQuantity: 6 },
              { productId: "prod_heineken", defaultQuantity: 4 }
            ]
          }
        })
      });
      assert.strictEqual(resPut.status, 200);
      const dataPut = await resPut.json();
      assert.strictEqual(dataPut.success, true);
      assert.strictEqual(dataPut.defaultStock?.flatOverrides?.["212"]?.[0]?.defaultQuantity, 6);
    });

    // ── F03 & F04: Contexto Mobile via QR Code do Flat e Reserva ────────────
    it("F03: POST /api/minibar/flat-context valida 4 dígitos e retorna primeiro nome e catálogo", async () => {
      // 5522998877665 -> 4 últimos dígitos do telefone: "7665"
      const resOk = await fetch(`${BASE_URL}/api/minibar/flat-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          last4Digits: "7665"
        })
      });
      assert.strictEqual(resOk.status, 200);
      const dataOk = await resOk.json();
      assert.strictEqual(dataOk.success, true);
      assert.strictEqual(dataOk.guestName, "Lucas Alvarenga da Silva");
      assert.strictEqual(dataOk.firstName, "Lucas");
      assert.strictEqual(dataOk.reservationCode, testReservationCode);
      assert.strictEqual(dataOk.flatNumber, testFlatNumber);
      assert.ok(Array.isArray(dataOk.catalog));
      assert.ok(dataOk.defaultStock);

      // Validação com dígitos incorretos -> deve retornar 401 Unauthorized
      const resFail = await fetch(`${BASE_URL}/api/minibar/flat-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          last4Digits: "0000"
        })
      });
      assert.strictEqual(resFail.status, 401);
      const dataFail = await resFail.json();
      assert.strictEqual(dataFail.success, false);
      assert.match(dataFail.error, /Dígitos incorretos/);
    });

    it("F04: GET /api/minibar/reservation-context/:code identifica reserva sem exigir 4 dígitos", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/reservation-context/${testReservationCode}`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.guestName, "Lucas Alvarenga da Silva");
      assert.strictEqual(data.firstName, "Lucas");
      assert.strictEqual(data.reservationCode, testReservationCode);
      assert.ok(Array.isArray(data.catalog));
    });

    // ── F05, F06, F07: Checkout, PIX Inter e Cartão Mercado Pago ────────────
    it("F05: Pedido de cortesia de boas-vindas gratuita 1x por estadia (valor R$ 0.00)", async () => {
      const resCourtesy = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_cortesia_kit", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "12345678909",
          email: "lucas.alvarenga@gmail.com"
        })
      });
      assert.strictEqual(resCourtesy.status, 200);
      const dataCourtesy = await resCourtesy.json();
      assert.strictEqual(dataCourtesy.success, true);
      assert.strictEqual(dataCourtesy.totalAmount, 0);
      assert.strictEqual(dataCourtesy.paymentStatus, "pago");
      assert.strictEqual(dataCourtesy.isCourtesyOnly, true);
      courtesyOrderId = dataCourtesy.orderId;

      // Desacoplamento Mandatório: r.totalAmount deve permanecer estritamente inalterado (R$ 450.00)
      const resPortal = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const dataPortal = await resPortal.json();
      assert.strictEqual(dataPortal.reservation.totalAmount, 450.00, "Frigobar NUNCA pode alterar o total da hospedagem");
    });

    it("F05: Anti-Abuso de cortesia — segunda tentativa de cortesia gratuita é convertida ou bloqueada", async () => {
      const resCourtesy2 = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_cortesia_kit", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "12345678909",
          email: "lucas.alvarenga@gmail.com"
        })
      });
      assert.strictEqual(resCourtesy2.status, 200);
      const dataCourtesy2 = await resCourtesy2.json();
      // Deve ter convertido para cápsula avulsa paga (prod_nespresso_extra R$ 5.00)
      assert.strictEqual(dataCourtesy2.totalAmount, 5.00);
      assert.strictEqual(dataCourtesy2.paymentStatus, "pendente");
    });

    it("F05/F06: POST /api/minibar/orders com PIX gera Copia e Cola e não altera total da reserva", async () => {
      const resPix = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [
            { productId: "prod_agua_sem_gas", quantity: 2 }, // 2x 6 = 12
            { productId: "prod_heineken", quantity: 1 }      // 1x 14 = 14 -> Total = 26
          ],
          paymentMethod: "pix",
          invoicePreference: "detailed",
          document: "12345678909",
          email: "lucas.alvarenga@gmail.com"
        })
      });
      assert.strictEqual(resPix.status, 200);
      const dataPix = await resPix.json();
      assert.strictEqual(dataPix.success, true);
      assert.strictEqual(dataPix.totalAmount, 26.00);
      assert.strictEqual(dataPix.paymentMethod, "pix");
      assert.ok(dataPix.pixCopiaECola);
      assert.ok(dataPix.orderId);
      testPixOrderId = dataPix.orderId;

      // Verifica status pendente
      const resStatus = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/status`);
      const dataStatus = await resStatus.json();
      assert.strictEqual(dataStatus.status, "pendente");

      // Desacoplamento Mandatório
      const resPortal = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const dataPortal = await resPortal.json();
      assert.strictEqual(dataPortal.reservation.totalAmount, 450.00);
    });

    it("F05/F07: POST /api/minibar/orders com Cartão Mercado Pago gera Checkout Pro initPoint", async () => {
      const resCard = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [
            { productId: "prod_coca_cola", quantity: 2 } // 2x 8 = 16.00
          ],
          paymentMethod: "credit_card",
          invoicePreference: "minibar_consumption",
          document: "12345678909",
          email: "lucas.alvarenga@gmail.com"
        })
      });
      assert.strictEqual(resCard.status, 200);
      const dataCard = await resCard.json();
      assert.strictEqual(dataCard.success, true);
      assert.strictEqual(dataCard.totalAmount, 16.00);
      assert.strictEqual(dataCard.paymentMethod, "credit_card");
      assert.ok(dataCard.initPoint);
      assert.ok(dataCard.orderId);
      testCardOrderId = dataCard.orderId;

      // Desacoplamento Mandatório
      const resPortal = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const dataPortal = await resPortal.json();
      assert.strictEqual(dataPortal.reservation.totalAmount, 450.00);
    });

    it("F06: Simulação de Webhook Banco Inter liquida pedido PIX de frigobar", async () => {
      // Consulta pedido para obter txid
      const resStatusBefore = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/status`);
      const dataStatusBefore = await resStatusBefore.json();
      const txid = dataStatusBefore.order.pixTxId;
      assert.ok(txid, "Pedido PIX deve possuir pixTxId");

      // Dispara notificação no webhook oficial do Inter
      const resWebhook = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [
            {
              txid,
              valor: "26.00",
              horario: new Date().toISOString(),
              endToEndId: `E2E_INTER_TEST_${Date.now()}`
            }
          ]
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      // Consulta status novamente via polling
      const resStatusAfter = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/status`);
      const dataStatusAfter = await resStatusAfter.json();
      assert.strictEqual(dataStatusAfter.status, "pago");
      assert.ok(dataStatusAfter.paidAt);
    });

    it("F07: Simulação de Webhook Mercado Pago liquida pedido com Cartão de Crédito", async () => {
      // Dispara webhook simulando aprovação de pagamento Cartão com external_reference e status approved
      const resWebhook = await fetch(`${BASE_URL}/api/pms/mercadopago/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payment",
          data: {
            id: "MP_PAY_TEST_9988",
            external_reference: `MB-${testCardOrderId}`,
            status: "approved",
            transaction_amount: 16.00
          },
          external_reference: `MB-${testCardOrderId}`,
          status: "approved"
        })
      });
      assert.strictEqual(resWebhook.status, 200);

      // Consulta status novamente via polling para confirmar liquidação do pedido para 'pago'
      const resStatusAfter = await fetch(`${BASE_URL}/api/minibar/orders/${testCardOrderId}/status`);
      const dataStatusAfter = await resStatusAfter.json();
      assert.strictEqual(dataStatusAfter.status, "pago", "Pedido cartão deve ser liquidado com status 'pago' após webhook MP");
      assert.ok(dataStatusAfter.paidAt);
    });

    // ── F08: Upload de Nota Fiscal & Disparo Multicanal ──────────────────────
    it("F08: POST /api/minibar/orders/:id/invoice anexa NF e disponibiliza no Portal do Hóspede", async () => {
      const mockPdfBase64 = Buffer.from("%PDF-1.4 Mock NF Frigobar CorpFlats Anserve").toString("base64");
      const resInvoice = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: `data:application/pdf;base64,${mockPdfBase64}`,
          fileName: `NF_Frigobar_${testPixOrderId}.pdf`,
          invoiceNumber: "10982"
        })
      });
      assert.strictEqual(resInvoice.status, 200);
      const dataInvoice = await resInvoice.json();
      assert.strictEqual(dataInvoice.success, true);
      assert.strictEqual(dataInvoice.invoice.status, "anexada");
      assert.ok(dataInvoice.invoice.invoiceFileUrl);

      // Verifica se a NF está exposta no Portal do Hóspede (/api/pms/guest-portal/:code)
      const resPortal = await fetch(`${BASE_URL}/api/pms/guest-portal/${testReservationCode}`);
      const dataPortal = await resPortal.json();
      assert.ok(Array.isArray(dataPortal.minibarOrders));
      const attachedOrder = dataPortal.minibarOrders.find(o => o.id === testPixOrderId);
      assert.ok(attachedOrder, "Portal do hóspede deve expor o pedido pago de frigobar");
      assert.strictEqual(attachedOrder.invoice?.status, "anexada");
      assert.strictEqual(attachedOrder.invoice?.invoiceFileName, `NF_Frigobar_${testPixOrderId}.pdf`);
      assert.ok(dataPortal.minibarUrl);

      // F08 Edge Case: Preservação de URLs externas longas (> 200 caracteres) sem converter para Base64
      const longExternalUrl = "https://corpflats-storage.s3.sa-east-1.amazonaws.com/invoices/2026/10/21/nota-fiscal-servico-eletronica-hospedagem-frigobar-comprovante-autenticidade-verificacao-hash-longa-url-sem-truncamento-ou-corrupcao-base64-test.pdf?signature=abcdef1234567890&expires=1792614000";
      assert.ok(longExternalUrl.length > 200, "URL de teste deve possuir mais de 200 caracteres");
      const resLongUrl = await fetch(`${BASE_URL}/api/minibar/orders/${testPixOrderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: longExternalUrl,
          fileName: `NF_Url_${testPixOrderId}.pdf`,
          invoiceNumber: "10983"
        })
      });
      assert.strictEqual(resLongUrl.status, 200);
      const dataLongUrl = await resLongUrl.json();
      assert.strictEqual(dataLongUrl.invoice.invoiceFileUrl, longExternalUrl, "URL externa longa deve ser preservada intacta sem ser tratada como Base64");
    });

    // ── F09: Inspeção, Divergência e Alerta da Sofia ─────────────────────────
    it("F09: POST /api/minibar/inspections registra conformidade sem divergência", async () => {
      // Validação de RBAC quando autenticação é explicitamente forçada (x-enforce-auth: true)
      const resUnauth = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-enforce-auth": "true" },
        body: JSON.stringify({ flatNumber: testFlatNumber, status: "conforme" })
      });
      assert.strictEqual(resUnauth.status, 401, "Requisição sem autenticação deve retornar 401 quando auth forçado");

      const resInsp = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          reservationCode: testReservationCode,
          inspectedBy: "Maria Repositora",
          status: "conforme",
          restockedItems: [
            { productId: "prod_agua_sem_gas", quantity: 2, isCourtesy: false },
            { productId: "prod_cortesia_kit", quantity: 1, isCourtesy: true }
          ]
        })
      });
      assert.strictEqual(resInsp.status, 200);
      const dataInsp = await resInsp.json();
      assert.strictEqual(dataInsp.success, true);
      assert.strictEqual(dataInsp.hasDiscrepancy, false);
      assert.strictEqual(dataInsp.inspection.status, "conforme");
      assert.ok(dataInsp.inspection.restockedCourtesyTotalCost > 0);
    });

    it("F09: POST /api/minibar/inspections com divergência gera cobrança pendente e aciona Sofia", async () => {
      const resDiverg = await fetch(`${BASE_URL}/api/minibar/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flatNumber: testFlatNumber,
          reservationCode: testReservationCode,
          inspectedBy: "Maria Repositora",
          status: "divergencia",
          missingItems: [
            { productId: "prod_heineken", quantity: 3 } // Já havia pago 1 heineken, logo faltam 2 não declaradas (2x 14 = 28)
          ],
          photos: ["https://images.unsplash.com/photo-example-missing"],
          notes: "Faltavam 2 cervejas Heineken não pagas",
          restockedItems: [
            { productId: "prod_heineken", quantity: 2, isCourtesy: false }
          ]
        })
      });
      assert.strictEqual(resDiverg.status, 200);
      const dataDiverg = await resDiverg.json();
      assert.strictEqual(dataDiverg.success, true);
      assert.strictEqual(dataDiverg.hasDiscrepancy, true);
      assert.ok(dataDiverg.chargeOrderId, "Deve gerar ordem de cobrança pendente para a divergência");
      discrepancyOrderId = dataDiverg.chargeOrderId;

      // Confirma pedido pendente gerado
      const resStatus = await fetch(`${BASE_URL}/api/minibar/orders/${discrepancyOrderId}/status`);
      const dataStatus = await resStatus.json();
      assert.strictEqual(dataStatus.status, "pendente");
      assert.strictEqual(dataStatus.order.totalAmount, 28.00);
      assert.strictEqual(dataStatus.order.source, "anserve_discrepancy");
    });

    it("F09: GET /api/minibar/inspections/flats-status retorna visão dos 19 flats para a repositora", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/inspections/flats-status`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.flats));
      assert.ok(data.flats.length >= 19, "Deve listar todos os flats da propriedade");

      const flat212 = data.flats.find(f => f.flatNumber === "212");
      assert.ok(flat212);
      assert.strictEqual(flat212.currentReservation?.code, testReservationCode);
      assert.ok(flat212.declaredAmount >= 26.00);
      assert.ok(flat212.lastInspection);
    });

    it("F09: GET /api/minibar/invoices/pending lista pedidos pagos aguardando emissão fiscal", async () => {
      // Marca o pedido com cartão como pago para validar a fila de pendências
      const updateRes = await fetch(`${BASE_URL}/api/minibar/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationCode: testReservationCode,
          flatNumber: testFlatNumber,
          items: [{ productId: "prod_stella", quantity: 1 }],
          paymentMethod: "pix",
          invoicePreference: "water",
          document: "12345678909",
          email: "lucas.alvarenga@gmail.com"
        })
      });
      const updateData = await updateRes.json();
      const paidOrderTxid = updateData.order.pixTxId;

      await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix: [{ txid: paidOrderTxid, valor: "12.00", horario: new Date().toISOString() }]
        })
      });

      const res = await fetch(`${BASE_URL}/api/minibar/invoices/pending`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.pendingInvoices));
      assert.ok(data.pendingInvoices.length >= 1);
    });

    // ── F10: Extrato de Repasse Financeiro & Analytics ──────────────────────
    it("F10: GET /api/minibar/settlement consolida vendas, desconta taxas e credita cortesias", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/settlement`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.totalOrdersAmount, 54.00, "Deve calcular total vendido de R$ 54.00");
      assert.strictEqual(data.ordersCount, 4, "Devem ser 4 pedidos pagos");
      assert.strictEqual(data.pixOrdersAmount, 38.00, "Vendas PIX devem somar R$ 38.00 (26 + 12)");
      assert.strictEqual(data.cardOrdersAmount, 16.00, "Vendas Cartão devem somar R$ 16.00");
      assert.strictEqual(data.pixFees, 0.38, "Taxa PIX de 0.99% sobre R$ 38.00 deve ser R$ 0.38");
      assert.strictEqual(data.cardFees, 0.64, "Taxa Cartão de 3.99% sobre R$ 16.00 deve ser R$ 0.64");
      assert.strictEqual(data.courtesyRestockCost, 6.50, "Deve compensar custo de reposição de cortesias de R$ 6.50");
      assert.strictEqual(data.netPayableToAnserve, 59.49, "Líquido a repassar deve ser R$ 59.49 (54.00 - 0.64 - 0.38 + 6.50)");
      assert.strictEqual(data.inspectionsCount, 2);
    });

    it("F10: GET /api/minibar/analytics retorna ranking de consumo e cruzamento demográfico", async () => {
      const res = await fetch(`${BASE_URL}/api/minibar/analytics`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(Array.isArray(data.ranking));
      assert.ok(data.inspections);
      assert.ok(Array.isArray(data.demographicInsights));
    });

    // ── PIN Mobile Repositora ──────────────────────────────────────────────
    it("PIN Mobile: POST /api/minibar/auth-pin autentica repositora com PIN", async () => {
      // PIN correto
      const resOk = await fetch(`${BASE_URL}/api/minibar/auth-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" })
      });
      assert.strictEqual(resOk.status, 200);
      const dataOk = await resOk.json();
      assert.strictEqual(dataOk.success, true);
      assert.strictEqual(dataOk.user?.role, "anserve_repositora");
      assert.ok(dataOk.token);

      // PIN incorreto
      const resFail = await fetch(`${BASE_URL}/api/minibar/auth-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "9999" })
      });
      assert.strictEqual(resFail.status, 401);
    });
  });
});
