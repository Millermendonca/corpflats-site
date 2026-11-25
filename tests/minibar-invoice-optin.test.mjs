/**
 * Teste Pontual Estrito — Captação Obrigatória de Necessidade de Nota Fiscal no Frigobar
 *
 * Execução: node --test tests/minibar-invoice-optin.test.mjs
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

const TEST_PORT = 4417;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const isolatedDbPath = path.join(
  os.tmpdir(),
  `test-minibar-invoice-optin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`
);

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

describe("Frigobar — Marcação Obrigatória de NF (Sim/Não), Solicitação Tardia 30d e Limpeza de Passivo", () => {
  const nowMs = Date.now();
  const fiveDaysAgoIso = new Date(nowMs - 5 * 86400000).toISOString();
  const fortyFiveDaysAgoIso = new Date(nowMs - 45 * 86400000).toISOString();

  before(async () => {
    const initialDb = {
      flats: [
        { id: 1, number: "301", floor: 3, status: "clean" },
        { id: 2, number: "302", floor: 3, status: "clean" }
      ],
      reservations: [
        {
          id: 701,
          code: "RES-301-OPT",
          flatId: 1,
          flatNumber: "301",
          guestId: 501,
          guestName: "Carlos Sem Documento",
          guestPhone: "",
          guestDocument: "",
          guestEmail: "carlos@teste.local",
          status: "checked_out",
          checkinDate: "2026-11-23",
          checkoutDate: "2026-11-25",
          checkoutDone: true,
          finalMinibarInspectionAt: new Date(nowMs - 3600000).toISOString()
        },
        {
          id: 702,
          code: "RES-302-OPT",
          flatId: 2,
          flatNumber: "302",
          guestId: 502,
          guestName: "Mariana Corporativa",
          guestPhone: "",
          guestDocument: "12345678909",
          guestEmail: "mariana@empresa.local",
          status: "checked_out",
          checkinDate: "2026-11-23",
          checkoutDate: "2026-11-25",
          checkoutDone: true,
          finalMinibarInspectionAt: new Date(nowMs - 3600000).toISOString()
        }
      ],
      guests: [],
      users: [{ id: 1, username: "admin_nf", role: "admin", name: "Admin Fiscal" }],
      minibarSettings: {
        sendPaymentConfirmationWhatsApp: false,
        dailyPaymentRemindersEnabled: false
      },
      minibarOrders: [
        // 1. Passivo legado recente (5 dias atrás, sem wantsInvoice) -> deve migrar p/ dispensada (visível em 30d)
        {
          id: "ORD-LEGACY-RECENT-5D",
          flatNumber: "301",
          reservationId: 701,
          reservationCode: "RES-301-OPT",
          guestName: "Carlos Sem Documento",
          totalAmount: 18,
          paymentMethod: "pix",
          paymentStatus: "pago",
          paidAt: fiveDaysAgoIso,
          createdAt: fiveDaysAgoIso,
          invoice: { status: "pendente" },
          items: [{ productId: "prod_refrigerante", productName: "Refrigerante", quantity: 2, unitPrice: 9, totalPrice: 18 }]
        },
        // 2. Passivo legado antigo (45 dias atrás) -> deve migrar p/ dispensada e ficar arquivado (+30d)
        {
          id: "ORD-LEGACY-OLD-45D",
          flatNumber: "301",
          reservationId: 701,
          reservationCode: "RES-301-OPT",
          guestName: "Carlos Sem Documento",
          totalAmount: 14,
          paymentMethod: "pix",
          paymentStatus: "pago",
          paidAt: fortyFiveDaysAgoIso,
          createdAt: fortyFiveDaysAgoIso,
          invoice: { status: "pendente" },
          items: [{ productId: "prod_agua_mineral_garrafa", productName: "Água Mineral", quantity: 2, unitPrice: 7, totalPrice: 14 }]
        },
        // 3. Nota já emitida/anexada -> deve permanecer intocada em issuedInvoices
        {
          id: "ORD-ALREADY-ATTACHED",
          flatNumber: "302",
          reservationId: 702,
          reservationCode: "RES-302-OPT",
          guestName: "Mariana Corporativa",
          totalAmount: 24,
          paymentMethod: "pix",
          paymentStatus: "pago",
          paidAt: fiveDaysAgoIso,
          createdAt: fiveDaysAgoIso,
          invoice: { status: "anexada", invoiceNumber: "NF-9001", invoiceFileUrl: "/api/storage/files/invoices/nf9001.pdf" },
          items: [{ productId: "prod_cerveja_long_neck", productName: "Cerveja", quantity: 2, unitPrice: 12, totalPrice: 24 }]
        },
        // 4. Lançamento pendente de pagamento no Flat 301
        {
          id: "ORD-MB-DIV-301",
          flatNumber: "301",
          reservationId: 701,
          reservationCode: "RES-301-OPT",
          guestName: "Carlos Sem Documento",
          totalAmount: 16,
          remainingAmount: 16,
          paymentMethod: "pendente",
          paymentStatus: "pendente",
          source: "restocker_launch",
          createdAt: new Date(nowMs - 3600000).toISOString(),
          items: [
            {
              productId: "prod_refrigerante",
              productName: "Refrigerante Lata",
              quantity: 2,
              paidQuantity: 0,
              remainingQuantity: 2,
              unitPrice: 8,
              totalPrice: 16
            }
          ]
        },
        // 5. Lançamento pendente de pagamento no Flat 302
        {
          id: "ORD-MB-DIV-302",
          flatNumber: "302",
          reservationId: 702,
          reservationCode: "RES-302-OPT",
          guestName: "Mariana Corporativa",
          totalAmount: 28,
          remainingAmount: 28,
          paymentMethod: "pendente",
          paymentStatus: "pendente",
          source: "restocker_launch",
          createdAt: new Date(nowMs - 3600000).toISOString(),
          items: [
            {
              productId: "prod_cerveja_long_neck",
              productName: "Cerveja Long Neck",
              quantity: 2,
              paidQuantity: 0,
              remainingQuantity: 2,
              unitPrice: 14,
              totalPrice: 28
            }
          ]
        }
      ],
      minibarInspections: [
        {
          id: "INSP-301-FINAL",
          flatNumber: "301",
          reservationId: 701,
          reservationCode: "RES-301-OPT",
          chargeOrderId: "ORD-MB-DIV-301",
          hasDiscrepancy: true,
          discrepancyTotalAmount: 16,
          status: "divergencia",
          inspectedAt: new Date(nowMs - 3500000).toISOString(),
          createdAt: new Date(nowMs - 3500000).toISOString()
        },
        {
          id: "INSP-302-FINAL",
          flatNumber: "302",
          reservationId: 702,
          reservationCode: "RES-302-OPT",
          chargeOrderId: "ORD-MB-DIV-302",
          hasDiscrepancy: true,
          discrepancyTotalAmount: 28,
          status: "divergencia",
          inspectedAt: new Date(nowMs - 3500000).toISOString(),
          createdAt: new Date(nowMs - 3500000).toISOString()
        }
      ],
      notifications: [],
      settings: {}
    };

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
        AUTH_SECRET: "test-secret-minibar-nf-optin",
        NODE_ENV: "test"
      },
      stdio: "pipe"
    });

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE_URL}/api/minibar/products`);
        if (res.ok) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
  });

  after(() => {
    if (serverProcess?.pid) killProcessTree(serverProcess.pid);
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}
  });

  it("1. Paridade SHA-256 exata entre artifacts/api-server/demo-server.mjs e scripts/demo-server.mjs", () => {
    const hashA = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(rootDir, "artifacts/api-server/demo-server.mjs")))
      .digest("hex");
    const hashB = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(rootDir, "scripts/demo-server.mjs")))
      .digest("hex");
    assert.equal(hashA, hashB, "Os arquivos gêmeos demo-server.mjs devem ter paridade SHA-256 exata");
  });

  it("2. Migração inicial limpa passivo legado de 'Pendentes', retém até 30d em 'Sem NF' e oculta >30d", async () => {
    const resHub = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
    assert.equal(resHub.status, 200);
    const hub = await resHub.json();
    assert.equal(hub.success, true);

    // Fila de pendentes deve iniciar limpa (0 pendentes!)
    assert.equal(hub.stats.pendingCount, 0);
    assert.equal(hub.pendingInvoices.length, 0);

    // NF anexada continua intacta
    assert.equal(hub.issuedInvoices.length, 1);
    assert.equal(hub.issuedInvoices[0].id, "ORD-ALREADY-ATTACHED");

    // Aba Sem NF Solicitada ativa mostra apenas os últimos 30 dias (ORD-LEGACY-RECENT-5D) e arquiva +30d (ORD-LEGACY-OLD-45D)
    assert.equal(hub.dispensedInvoices.length, 1);
    assert.equal(hub.dispensedInvoices[0].id, "ORD-LEGACY-RECENT-5D");
    assert.equal(hub.stats.archivedDispensedCount, 1);

    // Ao pedir includeArchivedDispensed=1, retorna também a de 45 dias
    const resArch = await fetch(`${BASE_URL}/api/minibar/invoices/hub?includeArchivedDispensed=1`);
    const hubArch = await resArch.json();
    assert.equal(hubArch.dispensedInvoices.length, 2);
  });

  let optedOutOrderId = "";

  it("3. Pagamento marcando 'Não preciso de NF' (wantsInvoice: false) dispensa CPF e não entra em Pendentes", async () => {
    const createRes = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-301-OPT",
        flatNumber: "301",
        requireCheckout: true,
        partialMode: "full",
        selectedLaunchItems: [
          {
            productId: "prod_refrigerante",
            productName: "Refrigerante Lata",
            quantity: 2,
            unitPrice: 8,
            launchOrderId: "ORD-MB-DIV-301"
          }
        ],
        paymentMethod: "pix",
        wantsInvoice: false,
        document: ""
      })
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.equal(created.success, true);
    optedOutOrderId = created.orderId;
    assert.equal(created.order.invoice.status, "dispensada");
    assert.equal(created.order.fiscalPreferences.wantsInvoice, false);

    // Simula baixa do pagamento para verificar o Hub
    const settleRes = await fetch(`${BASE_URL}/api/minibar/collections/manual-settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-301-OPT",
        orderId: optedOutOrderId,
        paymentMethod: "pix_avulso",
        amount: 16
      })
    });
    assert.equal(settleRes.status, 200);

    const hubRes = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
    const hub = await hubRes.json();
    assert.equal(hub.pendingInvoices.length, 0, "Não deve entrar na fila de Pendentes de Emissão");
    assert.ok(
      hub.dispensedInvoices.some(o => o.id === optedOutOrderId),
      "Deve aparecer na aba Sem NF Solicitada"
    );

    // Contexto público do hóspede deve expor canRequestInvoiceNow = true (dentro de 30d)
    const ctxRes = await fetch(`${BASE_URL}/api/minibar/reservation-context/RES-301-OPT`);
    const ctx = await ctxRes.json();
    const histEntry = ctx.paidOrdersHistory.find(h => h.id === optedOutOrderId);
    assert.ok(histEntry);
    assert.equal(histEntry.wantsInvoice, false);
    assert.equal(histEntry.canRequestInvoiceNow, true);
  });

  let optedInOrderId = "";

  it("4. Pagamento marcando 'Sim, preciso de NF' (wantsInvoice: true) exige CPF/CNPJ válido e entra em Pendentes com a descrição escolhida", async () => {
    // Sem CPF válido -> bloqueado com 400
    const badRes = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-302-OPT",
        flatNumber: "302",
        requireCheckout: true,
        partialMode: "full",
        selectedLaunchItems: [
          {
            productId: "prod_cerveja_long_neck",
            productName: "Cerveja Long Neck",
            quantity: 2,
            unitPrice: 14,
            launchOrderId: "ORD-MB-DIV-302"
          }
        ],
        paymentMethod: "pix",
        wantsInvoice: true,
        invoicePreference: "water",
        document: "123"
      })
    });
    assert.equal(badRes.status, 400);
    const badBody = await badRes.json();
    assert.equal(badBody.code, "INVALID_FISCAL_DOCUMENT");

    // Com CPF válido + opção "water" -> aceito e entra em Pendentes de Emissão após quitação
    const okRes = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-302-OPT",
        flatNumber: "302",
        requireCheckout: true,
        partialMode: "full",
        selectedLaunchItems: [
          {
            productId: "prod_cerveja_long_neck",
            productName: "Cerveja Long Neck",
            quantity: 2,
            unitPrice: 14,
            launchOrderId: "ORD-MB-DIV-302"
          }
        ],
        paymentMethod: "pix",
        wantsInvoice: true,
        invoicePreference: "water",
        document: "123.456.789-09"
      })
    });
    assert.equal(okRes.status, 200);
    const okData = await okRes.json();
    optedInOrderId = okData.orderId;
    assert.equal(okData.order.invoice.status, "pendente");
    assert.equal(okData.order.fiscalPreferences.wantsInvoice, true);
    assert.equal(okData.order.fiscalPreferences.invoiceDescriptionType, "water");

    await fetch(`${BASE_URL}/api/minibar/collections/manual-settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-302-OPT",
        orderId: optedInOrderId,
        paymentMethod: "pix_avulso",
        amount: 28
      })
    });

    const hubRes = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
    const hub = await hubRes.json();
    assert.equal(hub.pendingInvoices.length, 1);
    assert.equal(hub.pendingInvoices[0].id, optedInOrderId);
    assert.equal(hub.pendingInvoices[0].fiscalSummary.invoiceDescriptionType, "water");
    assert.match(hub.pendingInvoices[0].fiscalSummary.readyToPasteDescription, /Água Mineral/);
  });

  it("5. Solicitação tardia pelo link (até 30d) move p/ Pendentes, bloqueia >30d, e Dispensar NF move de volta", async () => {
    // Pedido com 45 dias bloqueado para solicitação pública do hóspede
    const expiredRes = await fetch(`${BASE_URL}/api/minibar/orders/ORD-LEGACY-OLD-45D/request-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-301-OPT",
        invoicePreference: "detailed",
        document: "12345678909"
      })
    });
    assert.equal(expiredRes.status, 400);
    const expiredData = await expiredRes.json();
    assert.equal(expiredData.code, "INVOICE_REQUEST_WINDOW_EXPIRED");

    // Hóspede solicita NF pós-pagamento dentro dos 30 dias com CNPJ e "minibar_consumption"
    const lateRes = await fetch(`${BASE_URL}/api/minibar/orders/${optedOutOrderId}/request-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-301-OPT",
        invoicePreference: "minibar_consumption",
        document: "47.964.813/0001-65",
        companyName: "Empresa Exemplo LTDA"
      })
    });
    assert.equal(lateRes.status, 200);
    const lateData = await lateRes.json();
    assert.equal(lateData.success, true);
    assert.equal(lateData.order.invoice.status, "pendente");
    assert.equal(lateData.order.fiscalSummary.documentType, "CNPJ");
    assert.equal(lateData.order.fiscalSummary.invoiceDescriptionType, "minibar_consumption");

    // Agora o Hub deve ter 2 pendentes (optedInOrderId + optedOutOrderId)
    let hub = await (await fetch(`${BASE_URL}/api/minibar/invoices/hub`)).json();
    assert.equal(hub.pendingInvoices.length, 2);

    // Equipe clica em "Dispensar NF" no pedido optedOutOrderId -> volta para Sem NF Solicitada
    const dispRes = await fetch(`${BASE_URL}/api/minibar/orders/${optedOutOrderId}/dispense-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "hospede_desistiu" })
    });
    assert.equal(dispRes.status, 200);

    hub = await (await fetch(`${BASE_URL}/api/minibar/invoices/hub`)).json();
    assert.equal(hub.pendingInvoices.length, 1);
    assert.equal(hub.pendingInvoices[0].id, optedInOrderId);
    assert.ok(hub.dispensedInvoices.some(o => o.id === optedOutOrderId));
  });
});
