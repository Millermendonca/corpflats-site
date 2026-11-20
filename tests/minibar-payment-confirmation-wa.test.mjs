/**
 * Teste Pontual Estrito — Mensagem Curta de Confirmação de Quitação de Frigobar no WhatsApp
 *
 * Execução: node --test tests/minibar-payment-confirmation-wa.test.mjs
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const TEST_PORT = 59881;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
process.env.AUTH_SECRET = "test-secret-minibar-confirm-wa-59881";
delete process.env.DATABASE_URL;

const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const initialRealDbHash = fs.existsSync(REAL_DB_PATH)
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "minibar-confirm-wa-test-"));
const tmpDbPath = path.join(tmpDir, "isolated-db.json");
process.env.DATA_FILE = tmpDbPath;
process.env.DATABASE_FILE = tmpDbPath;

const initialSeedDb = {
  users: [{ id: 1, username: "admin", role: "admin", name: "Admin Teste" }],
  flats: [
    { id: 211, number: "211", floor: 2, status: "clean" },
    { id: 511, number: "511", floor: 5, status: "clean" },
    { id: 605, number: "605", floor: 6, status: "clean" }
  ],
  guests: [],
  reservations: [],
  minibarProducts: [
    { id: "prod_biscoito", name: "Biscoito Salgado", price: 12, cost: 5, category: "Snacks" },
    { id: "prod_agua", name: "Água Mineral", price: 7, cost: 2, category: "Águas" }
  ],
  minibarOrders: [],
  minibarInspections: [],
  notifications: [],
  auditLogs: [],
  settings: { baseUrl: "https://corpflats.com.br" }
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialSeedDb, null, 2));

const serverMod = await import("../artifacts/api-server/demo-server.mjs");
const {
  httpServer,
  db,
  settleMinibarOrder,
  reopenMinibarOrderToPending,
  setMinibarTestHooks,
  buildMinibarPaymentConfirmationMessage,
  DEFAULT_MINIBAR_PAYMENT_CONFIRMATION_WA_TEMPLATE
} = serverMod;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 60));

describe("Confirmação Curta de Quitação de Frigobar no WhatsApp", () => {
  const waSent = [];
  const convLogged = [];

  before(async () => {
    if (!httpServer.listening) {
      await new Promise(resolve => httpServer.once("listening", resolve));
    }
  });

  beforeEach(() => {
    waSent.length = 0;
    convLogged.length = 0;
    db.reservations = [];
    db.minibarOrders = [];
    db.minibarInspections = [];
    db.minibarSettings = {
      ...(db.minibarSettings || {}),
      sendPaymentConfirmationWhatsApp: true,
      paymentConfirmationWhatsAppTemplate: DEFAULT_MINIBAR_PAYMENT_CONFIRMATION_WA_TEMPLATE
    };
    setMinibarTestHooks({
      sendZapiMessage: async (_cfg, payload) => {
        waSent.push(payload);
        return { success: true };
      },
      appendMessageToConversation: (_db, payload) => {
        convLogged.push(payload);
      }
    });
  });

  after(async () => {
    setMinibarTestHooks(null);
    try {
      if (typeof httpServer.closeAllConnections === "function") httpServer.closeAllConnections();
      await new Promise(resolve => httpServer.close(() => resolve()));
    } catch (_) {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    if (initialRealDbHash && fs.existsSync(REAL_DB_PATH)) {
      const finalHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
      assert.strictEqual(finalHash, initialRealDbHash, "data/database.json real jamais pode ser alterado pelo teste");
    }
    setTimeout(() => process.exit(0), 50).unref?.();
    setTimeout(() => process.exit(0), 250);
  });

  it("1. Quitação integral via PIX envia mensagem curta uma única vez (idempotente) e registra no chat", async () => {
    db.reservations.push({
      id: 964,
      code: "RES-211-0964",
      flatId: 211,
      flatNumber: "211",
      guestName: "Junior Pelicioni",
      guestPhone: "5522999112233",
      status: "completed"
    });
    const launch = {
      id: "ORD-MB-DIV-964",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestName: "Junior Pelicioni",
      guestPhone: "5522999112233",
      totalAmount: 12,
      remainingAmount: 12,
      paymentStatus: "pendente",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }]
    };
    const splitOrd = {
      id: "ORD-MB-SPLIT-RES-211-0964-G1",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestIndex: 1,
      guestName: "Junior Pelicioni",
      guestPhone: "5522999112233",
      totalAmount: 12,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }]
    };
    db.minibarOrders.push(launch, splitOrd);

    const res1 = settleMinibarOrder(splitOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E0041696820261119220000000000001",
      amount: 12,
      source: "inter_webhook"
    });
    assert.ok(res1);
    await flushAsync();

    assert.strictEqual(waSent.length, 1, "Deve disparar exatamente 1 mensagem curta no WhatsApp");
    assert.strictEqual(waSent[0].phone, "5522999112233");
    assert.strictEqual(waSent[0].triggerEvent, "minibar_payment_confirmed");
    assert.strictEqual(
      waSent[0].message,
      "Olá, Junior! ✅ Confirmamos a quitação do seu consumo de frigobar no *Flat 211* — *R$ 12,00* (PIX). Obrigado!"
    );
    assert.strictEqual(convLogged.length, 1, "Deve registrar mensagem enviada no histórico do chat");
    assert.ok(splitOrd.paymentConfirmationWhatsappSentAt, "Deve gravar timestamp de idempotência");

    // Replay duplicado do webhook NÃO pode reenviar mensagem
    settleMinibarOrder(splitOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E0041696820261119220000000000001",
      amount: 12,
      source: "inter_webhook_replay"
    });
    await flushAsync();
    assert.strictEqual(waSent.length, 1, "Replay não pode reenviar confirmação");

    // Reabertura limpa a flag e permite novo envio quando quitado novamente
    reopenMinibarOrderToPending(splitOrd, { reason: "Teste de reabertura" });
    assert.strictEqual(splitOrd.paymentConfirmationWhatsappSentAt, null);
    settleMinibarOrder(splitOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E0041696820261119220500000000002",
      amount: 12,
      source: "inter_webhook"
    });
    await flushAsync();
    assert.strictEqual(waSent.length, 2, "Após reabrir e quitar de verdade, deve enviar novamente");
  });

  it("2. Pagamento parcial informa valor pago e saldo restante (nunca quitação total indevida)", async () => {
    db.reservations.push({
      id: 511,
      code: "RES-511-0511",
      flatId: 511,
      flatNumber: "511",
      guestName: "Rosemere Santos",
      guestPhone: "5522999445566",
      status: "checked_in"
    });
    db.minibarOrders.push(
      {
        id: "ORD-MB-DIV-511",
        flatNumber: "511",
        reservationId: 511,
        reservationCode: "RES-511-0511",
        guestName: "Rosemere Santos",
        guestPhone: "5522999445566",
        totalAmount: 40,
        remainingAmount: 40,
        paymentStatus: "pendente",
        source: "restocker_launch",
        items: [{ productId: "prod_agua", productName: "Água Mineral", quantity: 4, unitPrice: 10, totalPrice: 40 }]
      },
      {
        id: "ORD-MB-PARTIAL-511",
        flatNumber: "511",
        reservationId: 511,
        reservationCode: "RES-511-0511",
        guestIndex: 1,
        guestName: "Rosemere Santos",
        guestPhone: "5522999445566",
        totalAmount: 15,
        paymentMethod: "credit_card",
        paymentStatus: "pendente",
        partialMode: "custom_amount",
        settlesLaunchOrders: true,
        items: [{ productId: "partial_payment", productName: "Parcial", quantity: 1, unitPrice: 15, totalPrice: 15 }]
      }
    );

    const partialOrd = db.minibarOrders[1];
    settleMinibarOrder(partialOrd, {
      paymentMethod: "credit_card",
      mpPaymentId: "MP-999111",
      amount: 15,
      source: "mercadopago"
    });
    await flushAsync();

    assert.strictEqual(waSent.length, 1);
    assert.match(waSent[0].message, /pagamento parcial/i);
    assert.match(waSent[0].message, /R\$ 15,00/);
    assert.match(waSent[0].message, /Cartão/);
    assert.match(waSent[0].message, /Saldo restante: \*R\$ 25,00\*/);
  });

  it("3. Divisão entre 2 hóspedes envia confirmação especificamente para o WhatsApp do pagador (G2)", async () => {
    db.reservations.push({
      id: 605,
      code: "RES-605-0605",
      flatId: 605,
      flatNumber: "605",
      guestName: "Titular Um",
      guestPhone: "5522999000001",
      status: "completed",
      guests: [
        { index: 1, name: "Titular Um", phone: "5522999000001" },
        { index: 2, name: "Helena Acompanhante", phone: "5522999000002" }
      ],
      minibarSplitConfig: { mode: "half_and_half" }
    });
    db.minibarOrders.push(
      {
        id: "ORD-MB-DIV-605",
        flatNumber: "605",
        reservationId: 605,
        reservationCode: "RES-605-0605",
        totalAmount: 24,
        remainingAmount: 24,
        paymentStatus: "pendente",
        source: "anserve_discrepancy",
        items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 2, unitPrice: 12, totalPrice: 24 }]
      },
      {
        id: "ORD-MB-SPLIT-RES-605-0605-G2",
        flatNumber: "605",
        reservationId: 605,
        reservationCode: "RES-605-0605",
        guestIndex: 2,
        guestName: "Helena Acompanhante",
        guestPhone: "",
        totalAmount: 12,
        paymentMethod: "pix",
        paymentStatus: "pendente",
        partialMode: "equal_split",
        settlesLaunchOrders: true,
        isAutoSplitCheckoutOrder: true,
        items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }]
      }
    );

    settleMinibarOrder(db.minibarOrders[1], {
      paymentMethod: "pix",
      pixEndToEndId: "E0041696820261119221000000000003",
      amount: 12,
      source: "inter_webhook"
    });
    await flushAsync();

    assert.strictEqual(waSent.length, 1);
    assert.strictEqual(waSent[0].phone, "5522999000002", "Deve buscar o telefone do slot G2 (nunca do titular G1)");
    assert.match(waSent[0].message, /Olá, Helena!/);
    assert.match(waSent[0].message, /quitação/i);
  });

  it("4. PUT /api/minibar/settings permite personalizar o texto curto e ativar/desativar o disparo + baixa manual dispara", async () => {
    const customTpl = "Oi {primeiro_nome}, recebemos R$ {valor} ({metodo}) do frigobar Flat {flat}. Tudo quitado!";
    const putRes = await fetch(`${BASE_URL}/api/minibar/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sendPaymentConfirmationWhatsApp: true,
        paymentConfirmationWhatsAppTemplate: customTpl
      })
    });
    assert.strictEqual(putRes.status, 200);
    const putData = await putRes.json();
    assert.strictEqual(putData.settings.sendPaymentConfirmationWhatsApp, true);
    assert.strictEqual(putData.settings.paymentConfirmationWhatsAppTemplate, customTpl);

    // Overview também devolve os campos novos
    const ovRes = await fetch(`${BASE_URL}/api/minibar/collections/overview`);
    const ovData = await ovRes.json();
    assert.strictEqual(ovData.settings.sendPaymentConfirmationWhatsApp, true);
    assert.strictEqual(ovData.settings.paymentConfirmationWhatsAppTemplate, customTpl);

    // Baixa manual dispara com o template customizado
    db.reservations.push({
      id: 700,
      code: "RES-211-0700",
      flatId: 211,
      flatNumber: "211",
      guestName: "Carlos Manual",
      guestPhone: "5522999778899",
      status: "completed"
    });
    db.minibarOrders.push({
      id: "ORD-MB-DIV-700",
      flatNumber: "211",
      reservationId: 700,
      reservationCode: "RES-211-0700",
      guestName: "Carlos Manual",
      guestPhone: "5522999778899",
      totalAmount: 19,
      remainingAmount: 19,
      paymentStatus: "pendente",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 19, totalPrice: 19 }]
    });

    const manualRes = await fetch(`${BASE_URL}/api/minibar/collections/manual-settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-211-0700",
        guestIndex: 1,
        paymentMethod: "pix_avulso",
        amount: 19,
        notes: "Comprovante enviado no WhatsApp"
      })
    });
    assert.strictEqual(manualRes.status, 200);
    await flushAsync();

    assert.strictEqual(waSent.length, 1);
    assert.strictEqual(waSent[0].phone, "5522999778899");
    assert.strictEqual(waSent[0].message, "Oi Carlos, recebemos R$ 19,00 (PIX) do frigobar Flat 211. Tudo quitado!");

    // Desativando via settings -> não envia
    await fetch(`${BASE_URL}/api/minibar/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendPaymentConfirmationWhatsApp: false })
    });

    const silentOrd = {
      id: "ORD-MB-SILENT-701",
      flatNumber: "211",
      guestName: "Sem Envio",
      guestPhone: "5522999778899",
      totalAmount: 10,
      paymentMethod: "pix",
      paymentStatus: "pendente"
    };
    db.minibarOrders.push(silentOrd);
    settleMinibarOrder(silentOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E0041696820261119222000000000004",
      amount: 10,
      source: "inter_webhook"
    });
    await flushAsync();
    assert.strictEqual(waSent.length, 1, "Com toggle desativado não deve disparar confirmação");

    // Cortesia R$ 0,00 nunca dispara mesmo com toggle ativo
    db.minibarSettings.sendPaymentConfirmationWhatsApp = true;
    const courtesyOrd = {
      id: "ORD-MB-CORTESIA-702",
      flatNumber: "211",
      guestName: "Cortesia",
      guestPhone: "5522999778899",
      totalAmount: 0,
      paymentMethod: "cortesia",
      paymentStatus: "pendente"
    };
    db.minibarOrders.push(courtesyOrd);
    settleMinibarOrder(courtesyOrd, { paymentMethod: "cortesia", amount: 0, source: "courtesy" });
    await flushAsync();
    assert.strictEqual(waSent.length, 1, "Pedido cortesia R$ 0,00 não deve disparar confirmação de pagamento");
  });

  it("5. buildMinibarPaymentConfirmationMessage formata placeholders e limpa parênteses vazios", () => {
    const msg = buildMinibarPaymentConfirmationMessage({
      guestName: "Maria Fernanda",
      flatNumber: "907",
      totalAmount: 28.5,
      paymentMethod: ""
    });
    assert.strictEqual(
      msg,
      "Olá, Maria! ✅ Confirmamos a quitação do seu consumo de frigobar no *Flat 907* — *R$ 28,50*. Obrigado!"
    );
  });
});
