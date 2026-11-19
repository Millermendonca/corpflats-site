/**
 * Teste Pontual Estrito — Deduplicação Canônica de Pedidos de Frigobar
 * (Anserve Reports, Reserva/Portal, Pré-Boleto B2B, Hub de NFs e CRM)
 *
 * Execução: node --test tests/minibar-anserve-dedup.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const TEST_PORT = 59879;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
process.env.AUTH_SECRET = "test-secret-minibar-dedup-59879";
delete process.env.DATABASE_URL;

const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const initialRealDbHash = fs.existsSync(REAL_DB_PATH)
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "minibar-dedup-test-"));
const tmpDbPath = path.join(tmpDir, "isolated-db.json");
process.env.DATA_FILE = tmpDbPath;
process.env.DATABASE_FILE = tmpDbPath;

const initialSeedDb = {
  users: [{ id: 1, username: "admin", role: "admin", name: "Admin Teste" }],
  flats: [
    { id: 211, number: "211", floor: 2, status: "clean" },
    { id: 408, number: "408", floor: 4, status: "clean" },
    { id: 511, number: "511", floor: 5, status: "clean" },
    { id: 907, number: "907", floor: 9, status: "clean" },
    { id: 605, number: "605", floor: 6, status: "clean" },
    { id: 313, number: "313", floor: 3, status: "clean" }
  ],
  guests: [
    {
      id: 8001,
      name: "Junior Pelicioni",
      fullName: "Junior Pelicioni",
      document: "11111111111",
      documentNumber: "11111111111",
      phone: "5522999111111"
    },
    {
      id: 8002,
      name: "Bruno Auditoria",
      fullName: "Bruno Auditoria",
      document: "22222222222",
      documentNumber: "22222222222",
      phone: "5522999222222"
    }
  ],
  reservations: [
    {
      id: 964,
      code: "RES-211-0964",
      flatId: 211,
      flatNumber: "211",
      guestId: 8001,
      guestName: "Junior Pelicioni",
      guestDocument: "11111111111",
      guestPhone: "5522999111111",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19",
      totalAmount: 300,
      status: "completed"
    },
    {
      id: 903,
      code: "RES-408-0903",
      flatId: 511,
      flatNumber: "511",
      roomMoveGroupId: "RMG-ROSEMERE",
      guestName: "Rosemere",
      checkinDate: "2026-11-17",
      checkoutDate: "2026-11-19",
      totalAmount: 600,
      status: "completed"
    },
    {
      id: 938,
      code: "RES-907-0938",
      flatId: 907,
      flatNumber: "907",
      guestName: "Marcos Andre",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19",
      totalAmount: 350,
      status: "completed"
    },
    {
      id: 950,
      code: "RES-605-0950",
      flatId: 605,
      flatNumber: "605",
      guestName: "Casal Split",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-19",
      totalAmount: 500,
      status: "completed"
    },
    {
      id: 960,
      code: "RES-313-0960",
      flatId: 313,
      flatNumber: "313",
      guestName: "Hospede Em Estadia",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-22",
      totalAmount: 800,
      status: "checked_in"
    }
  ],
  minibarProducts: [
    { id: "prod_biscoito", name: "Biscoito Salgado", price: 12, cost: 5, category: "Snacks" },
    { id: "prod_agua_garrafa", name: "Água Mineral Garrafa", price: 7, cost: 2, category: "Águas" },
    { id: "prod_refri", name: "Refrigerante", price: 10, cost: 4, category: "Refrigerantes" },
    { id: "prod_cerveja", name: "Cerveja", price: 20, cost: 8, category: "Cervejas" }
  ],
  minibarOrders: [
    // Caso 1: Junior Pelicioni (Flat 211) — DIV + SPLIT pendentes + SPLIT cancelado + PIX abandonado
    {
      id: "ORD-MB-DIV-1795103185574",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestName: "Junior Pelicioni",
      guestDocument: "11111111111",
      totalAmount: 12,
      remainingAmount: 12,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }],
      createdAt: "2026-11-19T15:46:25.100Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-211-0964-G1",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestIndex: 1,
      guestName: "Junior Pelicioni",
      guestDocument: "11111111111",
      totalAmount: 12,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }],
      createdAt: "2026-11-19T15:46:25.250Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-211-0964-G2",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestIndex: 2,
      guestName: "Acompanhante Cancelado",
      totalAmount: 12,
      paymentMethod: "pendente",
      paymentStatus: "cancelado",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }],
      createdAt: "2026-11-19T15:40:00.000Z"
    },
    {
      id: "ORD-MB-ABANDON-211",
      flatNumber: "211",
      reservationId: 964,
      reservationCode: "RES-211-0964",
      guestName: "Junior Pelicioni",
      totalAmount: 12,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      source: "guest_mobile",
      settlesLaunchOrders: true,
      items: [{ productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1, unitPrice: 12, totalPrice: 12 }],
      createdAt: "2026-11-19T15:50:00.000Z"
    },

    // Caso 2: Rosemere (Flat 511) — 2 lançamentos DIV (dias diferentes) consolidados em 1 SPLIT
    {
      id: "ORD-MB-DIV-ROSEMERE-DAY1",
      flatNumber: "408",
      reservationId: 903,
      reservationCode: "RES-408-0903",
      roomMoveGroupId: "RMG-ROSEMERE",
      guestName: "Rosemere",
      totalAmount: 7,
      remainingAmount: 7,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "restocker_launch",
      items: [{ productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 1, unitPrice: 7, totalPrice: 7 }],
      createdAt: "2026-11-18T14:00:00.000Z"
    },
    {
      id: "ORD-MB-DIV-1795102657249",
      flatNumber: "511",
      reservationId: 903,
      reservationCode: "RES-408-0903",
      roomMoveGroupId: "RMG-ROSEMERE",
      guestName: "Rosemere",
      totalAmount: 21,
      remainingAmount: 21,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 3, unitPrice: 7, totalPrice: 21 }],
      createdAt: "2026-11-19T15:37:37.100Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-408-0903-G1",
      flatNumber: "511",
      reservationId: 903,
      reservationCode: "RES-408-0903",
      roomMoveGroupId: "RMG-ROSEMERE",
      guestIndex: 1,
      guestName: "Rosemere",
      totalAmount: 28,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [
        { productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 1, unitPrice: 7, totalPrice: 7 },
        { productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 3, unitPrice: 7, totalPrice: 21 }
      ],
      createdAt: "2026-11-19T15:37:37.250Z"
    },

    // Caso 3: Marcos Andre (Flat 907) — SPLIT pago + DIV original como lancamento_quitado
    {
      id: "ORD-MB-DIV-907-OLD",
      flatNumber: "907",
      reservationId: 938,
      reservationCode: "RES-907-0938",
      guestName: "Marcos Andre",
      totalAmount: 10,
      remainingAmount: 0,
      paymentMethod: "pendente",
      paymentStatus: "lancamento_quitado",
      settledByOrderId: "ORD-MB-SPLIT-RES-907-0938-G1",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_refri", productName: "Refrigerante", quantity: 1, unitPrice: 10, totalPrice: 10 }],
      createdAt: "2026-11-19T15:20:00.000Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-907-0938-G1",
      flatNumber: "907",
      reservationId: 938,
      reservationCode: "RES-907-0938",
      guestIndex: 1,
      guestName: "Marcos Andre",
      totalAmount: 10,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: "2026-11-19T15:29:33.000Z",
      pixEndToEndId: "E0041696820261119152933000000001",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_refri", productName: "Refrigerante", quantity: 1, unitPrice: 10, totalPrice: 10 }],
      createdAt: "2026-11-19T15:20:01.000Z"
    },

    // Caso 4: Split 2 hóspedes (Flat 605) — G1 já pagou R$ 20, G2 ainda deve R$ 20, DIV com total 40 e rem 20
    {
      id: "ORD-MB-DIV-605-PAIR",
      flatNumber: "605",
      reservationId: 950,
      reservationCode: "RES-605-0950",
      guestName: "Casal Split",
      totalAmount: 40,
      remainingAmount: 20,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "anserve_discrepancy",
      items: [{ productId: "prod_cerveja", productName: "Cerveja", quantity: 2, unitPrice: 20, totalPrice: 40 }],
      createdAt: "2026-11-19T12:00:00.000Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-605-0950-G1",
      flatNumber: "605",
      reservationId: 950,
      reservationCode: "RES-605-0950",
      guestIndex: 1,
      guestName: "Casal Split G1",
      totalAmount: 20,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: "2026-11-19T13:00:00.000Z",
      pixEndToEndId: "E0041696820261119130000000000002",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_cerveja", productName: "Cerveja", quantity: 1, unitPrice: 20, totalPrice: 20 }],
      createdAt: "2026-11-19T12:00:01.000Z"
    },
    {
      id: "ORD-MB-SPLIT-RES-605-0950-G2",
      flatNumber: "605",
      reservationId: 950,
      reservationCode: "RES-605-0950",
      guestIndex: 2,
      guestName: "Casal Split G2",
      totalAmount: 20,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "guest_split_checkout",
      settlesLaunchOrders: true,
      isAutoSplitCheckoutOrder: true,
      items: [{ productId: "prod_cerveja", productName: "Cerveja", quantity: 1, unitPrice: 20, totalPrice: 20 }],
      createdAt: "2026-11-19T12:00:01.000Z"
    },

    // Caso 5: Em estadia (Flat 313, sem SPLIT ainda) — pagamento parcial R$ 15 + saldo restante R$ 25 no DIV
    {
      id: "ORD-MB-DIV-313-INSTAY",
      flatNumber: "313",
      reservationId: 960,
      reservationCode: "RES-313-0960",
      guestName: "Hospede Em Estadia",
      totalAmount: 40,
      remainingAmount: 25,
      paymentMethod: "pendente",
      paymentStatus: "pendente",
      source: "restocker_launch",
      items: [{ productId: "prod_cerveja", productName: "Cerveja", quantity: 2, unitPrice: 20, totalPrice: 40 }],
      createdAt: "2026-11-19T11:00:00.000Z"
    },
    {
      id: "ORD-MB-313-PARTIAL-PAID",
      flatNumber: "313",
      reservationId: 960,
      reservationCode: "RES-313-0960",
      guestName: "Hospede Em Estadia",
      totalAmount: 15,
      paymentMethod: "credit_card",
      paymentStatus: "pago",
      paidAt: "2026-11-19T11:30:00.000Z",
      source: "guest_mobile",
      settlesLaunchOrders: true,
      items: [{ productId: "partial_payment", productName: "Pagamento Parcial", quantity: 1, unitPrice: 15, totalPrice: 15 }],
      createdAt: "2026-11-19T11:29:00.000Z"
    },

    // Caso 6: Bruno no CRM — cancelado explícito para auditoria deve ser preservado no CRM, mas ocultado do anserve-reports
    {
      id: "ORD-MB-BRUNO-CANC",
      flatNumber: "211",
      reservationCode: "RES-BRUNO-AUD",
      guestName: "Bruno Auditoria",
      guestDocument: "22222222222",
      totalAmount: 99,
      paymentMethod: "pix",
      paymentStatus: "cancelado",
      source: "guest_mobile",
      items: [{ productId: "prod_cerveja", productName: "Cerveja", quantity: 1, unitPrice: 99, totalPrice: 99 }],
      createdAt: "2026-11-19T10:00:00.000Z"
    }
  ],
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
  getVisibleReservationMinibarOrders,
  computeReservationAccommodationAndConsumption,
  formatAggregatedMinibarItemsSummary
} = serverMod;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

describe("Deduplicação Canônica de Pedidos de Frigobar", () => {
  before(async () => {
    if (!httpServer.listening) {
      await new Promise(resolve => httpServer.once("listening", resolve));
    }
  });

  after(async () => {
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

  it("1. GET /api/minibar/anserve-reports elimina DIV duplicado, lancamento_quitado, cancelado e PIX abandonado e calcula totais reais", async () => {
    const res = await fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-11-01&endDate=2026-11-30`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const orders = data.salesSummary.orders;
    const ids = orders.map(o => o.id);

    // Exibidos (7 registros reais: 3 pagos + 4 pendentes)
    assert.ok(ids.includes("ORD-MB-SPLIT-RES-211-0964-G1"), "Junior SPLIT pendente deve aparecer");
    assert.ok(ids.includes("ORD-MB-SPLIT-RES-408-0903-G1"), "Rosemere SPLIT pendente deve aparecer");
    assert.ok(ids.includes("ORD-MB-SPLIT-RES-907-0938-G1"), "Marcos Andre SPLIT pago deve aparecer");
    assert.ok(ids.includes("ORD-MB-SPLIT-RES-605-0950-G1"), "Casal G1 pago deve aparecer");
    assert.ok(ids.includes("ORD-MB-SPLIT-RES-605-0950-G2"), "Casal G2 pendente deve aparecer");
    assert.ok(ids.includes("ORD-MB-DIV-313-INSTAY"), "Lançamento em estadia (sem SPLIT) deve aparecer");
    assert.ok(ids.includes("ORD-MB-313-PARTIAL-PAID"), "Pagamento parcial em estadia deve aparecer");

    // Ocultados (duplicatas, quitados, cancelados, tentativas abandonadas)
    assert.ok(!ids.includes("ORD-MB-DIV-1795103185574"), "Junior DIV substituído por SPLIT não pode duplicar");
    assert.ok(!ids.includes("ORD-MB-SPLIT-RES-211-0964-G2"), "SPLIT cancelado não pode aparecer");
    assert.ok(!ids.includes("ORD-MB-ABANDON-211"), "Tentativa PIX abandonada (settlesLaunchOrders) não pode duplicar");
    assert.ok(!ids.includes("ORD-MB-DIV-ROSEMERE-DAY1"), "Rosemere DIV dia 1 substituído por SPLIT não pode duplicar");
    assert.ok(!ids.includes("ORD-MB-DIV-1795102657249"), "Rosemere DIV dia 2 substituído por SPLIT não pode duplicar");
    assert.ok(!ids.includes("ORD-MB-DIV-907-OLD"), "Marcos Andre lancamento_quitado não pode aparecer como pendente");
    assert.ok(!ids.includes("ORD-MB-DIV-605-PAIR"), "Casal DIV substituído por SPLIT G2 pendente não pode duplicar");
    assert.ok(!ids.includes("ORD-MB-BRUNO-CANC"), "Pedido cancelado não pode aparecer");

    assert.strictEqual(orders.length, 7);

    // Soma real paga: 10 (Marcos) + 20 (Casal G1) + 15 (Parcial 313) = 45.00
    assert.strictEqual(data.salesSummary.totalOrdersPaid, 3);
    assert.strictEqual(data.salesSummary.totalPaidRevenue, 45);

    // Soma real pendente: 12 (Junior) + 28 (Rosemere) + 20 (Casal G2) + 25 (remainingAmount 313) = 85.00
    assert.strictEqual(data.salesSummary.totalOrdersPending, 4);
    assert.strictEqual(data.salesSummary.totalPendingRevenue, 85);

    // Resumo agregado dos itens da Rosemere: 1x + 3x = 4x Água Mineral Garrafa
    const rosemereRow = orders.find(o => o.id === "ORD-MB-SPLIT-RES-408-0903-G1");
    assert.strictEqual(rosemereRow.itemsSummary, "4x Água Mineral Garrafa");
    assert.strictEqual(rosemereRow.totalAmount, 28);

    // Lançamento parcialmente pago usa remainingAmount (25) e não totalAmount bruto (40)
    const inStayRow = orders.find(o => o.id === "ORD-MB-DIV-313-INSTAY");
    assert.strictEqual(inStayRow.totalAmount, 25);
  });

  it("2. getVisibleReservationMinibarOrders deduplica pendentes na reserva do PMS/Portal", () => {
    const resJunior = db.reservations.find(r => r.code === "RES-211-0964");
    const visJunior = getVisibleReservationMinibarOrders(resJunior);
    assert.deepStrictEqual(visJunior.map(o => o.id), ["ORD-MB-SPLIT-RES-211-0964-G1"]);

    const resRosemere = db.reservations.find(r => r.code === "RES-408-0903");
    const visRosemere = getVisibleReservationMinibarOrders(resRosemere);
    assert.deepStrictEqual(visRosemere.map(o => o.id), ["ORD-MB-SPLIT-RES-408-0903-G1"]);

    const resCasal = db.reservations.find(r => r.code === "RES-605-0950");
    const visCasal = getVisibleReservationMinibarOrders(resCasal);
    assert.deepStrictEqual(
      visCasal.map(o => o.id).sort(),
      ["ORD-MB-SPLIT-RES-605-0950-G1", "ORD-MB-SPLIT-RES-605-0950-G2"]
    );
  });

  it("3. computeReservationAccommodationAndConsumption (pré-boleto B2B) não dobra DIV+SPLIT nem cobra lancamento_quitado/cancelado", () => {
    const resJunior = db.reservations.find(r => r.code === "RES-211-0964");
    const b2bJunior = computeReservationAccommodationAndConsumption(resJunior, db);
    assert.strictEqual(b2bJunior.consumptionAmount, 12);
    assert.ok(b2bJunior.consumptionItems[0].title.includes("Biscoito Salgado"), "Deve usar productName, nunca undefined");
    assert.ok(!b2bJunior.consumptionItems[0].title.includes("undefined"));

    const resRosemere = db.reservations.find(r => r.code === "RES-408-0903");
    const b2bRosemere = computeReservationAccommodationAndConsumption(resRosemere, db);
    assert.strictEqual(b2bRosemere.consumptionAmount, 28);

    const resMarcos = db.reservations.find(r => r.code === "RES-907-0938");
    const b2bMarcos = computeReservationAccommodationAndConsumption(resMarcos, db);
    assert.strictEqual(b2bMarcos.consumptionAmount, 0, "Reserva já quitada (lancamento_quitado + pago) deve ter consumo pendente R$ 0");

    const resCasal = db.reservations.find(r => r.code === "RES-605-0950");
    const b2bCasal = computeReservationAccommodationAndConsumption(resCasal, db);
    assert.strictEqual(b2bCasal.consumptionAmount, 20, "Somente cota pendente G2 (R$ 20), sem duplicar com DIV");

    const resInStay = db.reservations.find(r => r.code === "RES-313-0960");
    const b2bInStay = computeReservationAccommodationAndConsumption(resInStay, db);
    assert.strictEqual(b2bInStay.consumptionAmount, 25, "Usa remainingAmount (25) de lançamento parcialmente pago");
  });

  it("4. /api/minibar/invoices/hub e /pending não duplicam preConfiguredCheckoutSplits", async () => {
    const hubRes = await fetch(`${BASE_URL}/api/minibar/invoices/hub`);
    assert.strictEqual(hubRes.status, 200);
    const hub = await hubRes.json();
    const preIds = (hub.preConfiguredCheckoutSplits || []).map(o => o.id);
    assert.ok(preIds.includes("ORD-MB-SPLIT-RES-211-0964-G1"));
    assert.ok(preIds.includes("ORD-MB-SPLIT-RES-408-0903-G1"));
    assert.ok(preIds.includes("ORD-MB-SPLIT-RES-605-0950-G2"));
    assert.ok(!preIds.includes("ORD-MB-DIV-1795103185574"));
    assert.ok(!preIds.includes("ORD-MB-DIV-1795102657249"));
    assert.ok(!preIds.includes("ORD-MB-DIV-605-PAIR"));
  });

  it("5. CRM deduplica DIV+SPLIT em GET /api/pms/guests/:id mas preserva cancelado explícito para auditoria", async () => {
    const juniorRes = await fetch(`${BASE_URL}/api/pms/guests/8001`);
    assert.strictEqual(juniorRes.status, 200);
    const junior = await juniorRes.json();
    const juniorMbIds = (junior.minibarOrders || []).map(o => o.id);
    assert.ok(juniorMbIds.includes("ORD-MB-SPLIT-RES-211-0964-G1"));
    assert.ok(!juniorMbIds.includes("ORD-MB-DIV-1795103185574"), "DIV substituído não deve duplicar no CRM");
    assert.ok(!juniorMbIds.includes("ORD-MB-ABANDON-211"), "Tentativa abandonada não deve duplicar no CRM");

    const brunoRes = await fetch(`${BASE_URL}/api/pms/guests/8002`);
    assert.strictEqual(brunoRes.status, 200);
    const bruno = await brunoRes.json();
    assert.strictEqual(bruno.minibarSpent, 0);
    assert.ok((bruno.minibarOrders || []).some(o => o.id === "ORD-MB-BRUNO-CANC"), "Cancelado explícito mantido para auditoria no CRM");
  });

  it("6. formatAggregatedMinibarItemsSummary consolida quantidades de produtos repetidos", () => {
    const summary = formatAggregatedMinibarItemsSummary([
      { productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 1 },
      { productId: "prod_biscoito", productName: "Biscoito Salgado", quantity: 1 },
      { productId: "prod_agua_garrafa", productName: "Água Mineral Garrafa", quantity: 3 }
    ]);
    assert.strictEqual(summary, "4x Água Mineral Garrafa, 1x Biscoito Salgado");
  });
});
