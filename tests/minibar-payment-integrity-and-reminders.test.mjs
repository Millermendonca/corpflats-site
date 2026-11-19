/**
 * Teste Pontual Estrito — Blindagem de Pagamentos PIX do Frigobar, Auditoria/Reabertura
 * e Motor de Avisos Diários Pós-Check-out (D+1 a D+7)
 *
 * Execução: node --test tests/minibar-payment-integrity-and-reminders.test.mjs
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

const TEST_PORT = 59877;
process.env.NODE_ENV = "test";
process.env.PORT = String(TEST_PORT);
process.env.AUTH_SECRET = "test-secret-minibar-integrity-59877";
delete process.env.DATABASE_URL;

const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const initialRealDbHash = fs.existsSync(REAL_DB_PATH)
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;
const initialRealDbMtime = fs.existsSync(REAL_DB_PATH)
  ? fs.statSync(REAL_DB_PATH).mtimeMs
  : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "minibar-integrity-test-"));
const tmpDbPath = path.join(tmpDir, "isolated-db.json");
process.env.DATA_FILE = tmpDbPath;
process.env.DATABASE_FILE = tmpDbPath;

const initialSeedDb = {
  users: [{ id: 1, username: "admin", role: "admin", name: "Admin Teste" }],
  flats: [
    { id: 101, number: "101", floor: 1, status: "clean" },
    { id: 102, number: "102", floor: 1, status: "clean" },
    { id: 103, number: "103", floor: 1, status: "clean" },
    { id: 104, number: "104", floor: 1, status: "clean" },
    { id: 201, number: "201", floor: 2, status: "clean" },
    { id: 202, number: "202", floor: 2, status: "clean" },
    { id: 203, number: "203", floor: 2, status: "clean" },
    { id: 204, number: "204", floor: 2, status: "clean" },
    { id: 205, number: "205", floor: 2, status: "clean" },
    { id: 301, number: "301", floor: 3, status: "clean" },
    { id: 302, number: "302", floor: 3, status: "clean" },
    { id: 303, number: "303", floor: 3, status: "clean" },
    { id: 304, number: "304", floor: 3, status: "clean" }
  ],
  guests: [],
  reservations: [],
  boletos: [],
  minibarOrders: [],
  minibarInspections: [],
  notifications: [],
  auditLogs: [],
  settings: {
    baseUrl: "https://corpflats.com.br",
    adminPhone: "5522999000001"
  },
  zapiConfig: {
    instanceId: "TEST_INST",
    token: "TEST_TOK",
    enabled: true
  },
  minibarSettings: {
    notificationManagerWhatsApp: "5522999000001",
    dailyPaymentRemindersEnabled: true,
    dailyPaymentReminderHour: 10,
    dailyPaymentReminderLookbackDays: 15,
    dailyPaymentReminderMaxDays: 7,
    dailyPaymentReminderNotifyManagerOnDay7: true
  }
};

fs.writeFileSync(tmpDbPath, JSON.stringify(initialSeedDb, null, 2), "utf-8");

const serverModule = await import("../artifacts/api-server/demo-server.mjs");
const {
  httpServer,
  db,
  isValidRealPixEndToEndId,
  isPixEndToEndIdAlreadyClaimed,
  getMinibarOrderVerificationStatus,
  verifyMinibarOrderPixPayment,
  settleMinibarOrder,
  reopenMinibarOrderToPending,
  auditAndReopenFalsePaidMinibarOrders,
  collectPendingMinibarCollectionTargets,
  processDailyMinibarPaymentReminders,
  setMinibarTestHooks,
  buildReservationMinibarStatement,
  reconcileUniversalIntegrity,
  getDefaultMinibarSettings
} = serverModule;

const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function ymdDaysAgo(daysAgo, refDate = new Date()) {
  const d = new Date(refDate.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
  return parts;
}

function isoDaysAgo(daysAgo, refDate = new Date()) {
  return new Date(refDate.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function brasiliaDateAtHour(ymd, hour = 10, minute = 30) {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${ymd}T${hh}:${mm}:00-03:00`);
}

function addDaysYmd(ymd, deltaDays) {
  const base = new Date(`${ymd}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function resetDbState() {
  db.reservations = [];
  db.guests = [];
  db.boletos = [];
  db.minibarOrders = [];
  db.minibarInspections = [];
  db.notifications = [];
  db.auditLogs = [];
  db.minibarLastAuditReport = null;
  db.minibarSettings = {
    ...getDefaultMinibarSettings(),
    notificationManagerWhatsApp: "5522999000001",
    dailyPaymentRemindersEnabled: true,
    dailyPaymentReminderHour: 10,
    dailyPaymentReminderLookbackDays: 15,
    dailyPaymentReminderMaxDays: 7,
    dailyPaymentReminderNotifyManagerOnDay7: true
  };
  setMinibarTestHooks(null);
}

function seedCheckedOutReservationWithLaunch({
  resId,
  code,
  flatNumber,
  guestId,
  guestName,
  guestPhone,
  guestEmail,
  guestDocument,
  daysAgoCheckout = 2,
  launchOrderId,
  inspectionId,
  items = [
    {
      productId: "prod_cerveja_long_neck",
      productName: "Cerveja Long Neck",
      quantity: 1,
      unitPrice: 20,
      totalPrice: 20,
      remainingQuantity: 1,
      paidQuantity: 0
    }
  ],
  extraGuests = null,
  splitConfig = null
}) {
  const checkoutYmd = ymdDaysAgo(daysAgoCheckout);
  const checkinYmd = ymdDaysAgo(daysAgoCheckout + 2);
  const finalInspIso = `${checkoutYmd}T14:00:00.000Z`;
  const totalAmount = Number(items.reduce((s, it) => s + Number(it.totalPrice || 0), 0).toFixed(2));

  const crmGuest = {
    id: guestId,
    name: guestName,
    fullName: guestName,
    phone: guestPhone,
    email: guestEmail,
    document: guestDocument,
    documentNumber: guestDocument,
    tags: [],
    createdAt: isoDaysAgo(daysAgoCheckout + 3)
  };
  db.guests.push(crmGuest);

  const reservation = {
    id: resId,
    code,
    flatId: Number(flatNumber),
    flatNumber: String(flatNumber),
    guestId,
    guestName,
    guestPhone,
    guestEmail,
    guestDocument,
    status: "checked_out",
    checkinDate: checkinYmd,
    checkoutDate: checkoutYmd,
    checkoutDone: true,
    actualCheckoutAt: `${checkoutYmd}T11:00:00.000Z`,
    finalMinibarInspectionAt: finalInspIso,
    minibarPayments: [],
    timeline: [],
    numGuests: extraGuests ? extraGuests.length : 1
  };
  if (extraGuests) reservation.guests = extraGuests;
  if (splitConfig) reservation.minibarSplitConfig = splitConfig;
  db.reservations.push(reservation);

  const launchOrder = {
    id: launchOrderId,
    flatNumber: String(flatNumber),
    reservationId: resId,
    reservationCode: code,
    guestId,
    guestName,
    guestPhone,
    guestEmail,
    guestDocument,
    items: items.map(it => ({ ...it })),
    totalAmount,
    remainingAmount: totalAmount,
    paymentMethod: "pendente",
    paymentStatus: "pendente",
    source: "restocker_launch",
    launchDate: checkoutYmd,
    createdAt: finalInspIso,
    updatedAt: finalInspIso
  };
  db.minibarOrders.push(launchOrder);

  const inspection = {
    id: inspectionId,
    flatNumber: String(flatNumber),
    reservationId: resId,
    reservationCode: code,
    chargeOrderId: launchOrderId,
    hasDiscrepancy: true,
    discrepancyTotalAmount: totalAmount,
    discrepancyPaid: false,
    discrepancyResolved: false,
    isFinalCheckoutInspection: true,
    status: "divergencia",
    inspectedAt: finalInspIso,
    launchDate: checkoutYmd,
    createdAt: finalInspIso,
    updatedAt: finalInspIso
  };
  db.minibarInspections.push(inspection);

  return { reservation, crmGuest, launchOrder, inspection, checkoutYmd, finalInspIso, totalAmount };
}

describe("Frigobar — Blindagem de Pagamentos PIX, Auditoria/Reabertura e Avisos Diários (D+1..D+7)", () => {
  before(async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE_URL}/api/minibar/products`);
        if (res.ok) break;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 150));
    }
  });

  beforeEach(() => {
    resetDbState();
  });

  after(() => {
    setMinibarTestHooks(null);
    if (httpServer && typeof httpServer.close === "function") {
      httpServer.close();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    if (initialRealDbHash && fs.existsSync(REAL_DB_PATH)) {
      const finalHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
      const finalMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
      assert.strictEqual(finalHash, initialRealDbHash, "CRITICAL: data/database.json hash was modified during test!");
      assert.strictEqual(finalMtime, initialRealDbMtime, "CRITICAL: data/database.json mtime was modified during test!");
    }
    setTimeout(() => process.exit(0), 50);
  });

  it("0. Paridade SHA-256 Twin-Server, eventos Z-API e salvaguardas de frontend", () => {
    const serverA = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/demo-server.mjs"));
    const serverB = fs.readFileSync(path.join(ROOT_DIR, "scripts/demo-server.mjs"));
    assert.strictEqual(
      crypto.createHash("sha256").update(serverA).digest("hex"),
      crypto.createHash("sha256").update(serverB).digest("hex"),
      "demo-server.mjs deve manter paridade SHA-256 exata entre artifacts/api-server e scripts/"
    );

    const zapiA = fs.readFileSync(path.join(ROOT_DIR, "artifacts/api-server/zapi-service.mjs"));
    const zapiB = fs.readFileSync(path.join(ROOT_DIR, "scripts/zapi-service.mjs"));
    assert.strictEqual(
      crypto.createHash("sha256").update(zapiA).digest("hex"),
      crypto.createHash("sha256").update(zapiB).digest("hex"),
      "zapi-service.mjs deve manter paridade SHA-256 exata entre artifacts/api-server e scripts/"
    );

    const zapiText = zapiA.toString("utf-8");
    assert.match(zapiText, /"minibar_payment_reminder"/);
    assert.match(zapiText, /"minibar_payment_formal_notice"/);

    const guestUi = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/guest-minibar.tsx"), "utf-8");
    assert.match(guestUi, /INTER_PIX_UNAVAILABLE/);
    assert.match(guestUi, /Pagar com Cartão agora/);
    assert.match(guestUi, /isOrdAlreadyPaidWithPendingBalance/);

    const collectionsPanel = fs.readFileSync(
      path.join(ROOT_DIR, "artifacts/limpeza/src/components/minibar-collections-panel.tsx"),
      "utf-8"
    );
    assert.match(collectionsPanel, /\/api\/minibar\/collections\/overview/);
    assert.match(collectionsPanel, /\/api\/minibar\/collections\/audit-false-paid/);
    assert.match(collectionsPanel, /\/api\/minibar\/collections\/send-now/);
    assert.match(collectionsPanel, /\/api\/minibar\/collections\/pause/);
    assert.match(collectionsPanel, /\/api\/minibar\/collections\/manual-settle/);
    assert.match(collectionsPanel, /\/reopen/);

    const anserveUi = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/anserve-dashboard.tsx"), "utf-8");
    assert.match(anserveUi, /MinibarCollectionsPanel/);
    assert.match(anserveUi, /unverified_synthetic_e2e/);

    const adminUi = fs.readFileSync(path.join(ROOT_DIR, "artifacts/limpeza/src/pages/minibar-admin.tsx"), "utf-8");
    assert.match(adminUi, /MinibarCollectionsPanel/);
  });

  it("1. Bloqueio absoluto de falso-pago por valor idêntico no extrato do Inter (zero match amount-only)", async () => {
    const { launchOrder } = seedCheckedOutReservationWithLaunch({
      resId: 1001,
      code: "RES-INT-101",
      flatNumber: "101",
      guestId: 5001,
      guestName: "João da Silva",
      guestPhone: "5522991110001",
      guestEmail: "joao@teste.com",
      guestDocument: "11122233344",
      launchOrderId: "ORD-MB-DIV-101",
      inspectionId: "INSP-MB-101"
    });

    const nowIso = new Date().toISOString();
    const pendingDynamicOrder = {
      id: "ORD-MB-PIX-DYN-101",
      flatNumber: "101",
      reservationId: 1001,
      reservationCode: "RES-INT-101",
      guestId: 5001,
      guestName: "João da Silva",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: "INTERDYN101000000000000000000001",
      pixTxIdHistory: ["INTERDYN101000000000000000000001"],
      pixIsDynamic: true,
      pixCreatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    const pendingStaticOrder = {
      id: "ORD-MB-PIX-STAT-101",
      flatNumber: "101",
      reservationId: 1001,
      reservationCode: "RES-INT-101",
      guestId: 5001,
      guestName: "João da Silva",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: "TXMB1234567890ABCDEF1234",
      pixIsDynamic: false,
      pixCreatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    db.minibarOrders.push(pendingDynamicOrder, pendingStaticOrder);

    // Extrato contém PIX de OUTRO hóspede com EXATAMENTE R$ 20,00 (com txId diferente e também sem txId)
    setMinibarTestHooks({
      checkInterPixCobStatus: async () => ({ _httpStatus: 200, status: "ATIVA", pix: [] }),
      getCachedInterExtratoCompleto: async () => ({
        transacoes: [
          {
            tipoTransacao: "PIX",
            tipoOperacao: "C",
            valor: "20.00",
            dataHora: nowIso,
            detalhes: {
              txId: "INTERDYN999OTHERGUEST00000000999",
              endToEndId: "E00416968202611191200OTHER000001"
            }
          },
          {
            tipoTransacao: "PIX",
            tipoOperacao: "C",
            valor: "20.00",
            dataHora: nowIso,
            detalhes: {
              endToEndId: "E00416968202611191201NOTXID00002"
            }
          }
        ]
      })
    });

    // Polling do pedido dinâmico NÃO pode liquidar
    const resDyn = await fetch(`${BASE_URL}/api/minibar/orders/${pendingDynamicOrder.id}/status`);
    assert.strictEqual(resDyn.status, 200);
    const dataDyn = await resDyn.json();
    assert.strictEqual(dataDyn.status, "pendente", "Pedido dinâmico NÃO pode ser liquidado por PIX de outro hóspede de mesmo valor");
    assert.strictEqual(pendingDynamicOrder.paymentStatus, "pendente");
    assert.strictEqual(pendingDynamicOrder.pixEndToEndId || null, null);

    // Polling do pedido estático NÃO pode liquidar sem txId exato
    const resStat = await fetch(`${BASE_URL}/api/minibar/orders/${pendingStaticOrder.id}/status`);
    assert.strictEqual(resStat.status, 200);
    const dataStat = await resStat.json();
    assert.strictEqual(dataStat.status, "pendente", "Fallback de extrato JAMAIS pode liquidar apenas por valor sem txId exato");
    assert.strictEqual(launchOrder.paymentStatus, "pendente");
    assert.strictEqual(launchOrder.remainingAmount, 20);

    // Trava central settleMinibarOrder bloqueia E2E sintético
    const blockedResult = settleMinibarOrder(pendingDynamicOrder, {
      paymentMethod: "pix",
      pixEndToEndId: "E2E_1793656763136",
      amount: 20,
      source: "malicious_synthetic_test"
    });
    assert.strictEqual(blockedResult, null, "settleMinibarOrder deve recusar E2E sintético para PIX não manual");
    assert.strictEqual(pendingDynamicOrder.paymentStatus, "pendente");
    assert.ok(
      db.auditLogs.some(l => l.action === "MINIBAR_FALSE_SETTLEMENT_BLOCKED"),
      "Deve registrar evento de auditoria MINIBAR_FALSE_SETTLEMENT_BLOCKED"
    );
  });

  it("2. Cobrança dinâmica CONCLUIDA com E2E real do BC liquida o pedido e impede reuso do mesmo E2E", async () => {
    // Validações de helper isValidRealPixEndToEndId
    const realE2e1 = "E00416968202611191230REALBC00001";
    assert.strictEqual(isValidRealPixEndToEndId(realE2e1), true);
    assert.strictEqual(isValidRealPixEndToEndId("E2E_1793656763136"), false);
    assert.strictEqual(isValidRealPixEndToEndId("E2E_1793656763136000000000000"), false);
    assert.strictEqual(isValidRealPixEndToEndId("SIM_1234567890123456789012345"), false);
    assert.strictEqual(isValidRealPixEndToEndId("MOCK_123456789012345678901234"), false);
    assert.strictEqual(isValidRealPixEndToEndId("MANUAL_1234567890123456789012"), false);
    assert.strictEqual(isValidRealPixEndToEndId("short"), false);
    assert.strictEqual(isValidRealPixEndToEndId(""), false);

    const { launchOrder, inspection } = seedCheckedOutReservationWithLaunch({
      resId: 1002,
      code: "RES-INT-102",
      flatNumber: "102",
      guestId: 5002,
      guestName: "Maria Oliveira",
      guestPhone: "5522991110002",
      guestEmail: "maria@teste.com",
      guestDocument: "22233344455",
      launchOrderId: "ORD-MB-DIV-102",
      inspectionId: "INSP-MB-102"
    });

    const nowIso = new Date().toISOString();
    const order1 = {
      id: "ORD-MB-PIX-102-A",
      flatNumber: "102",
      reservationId: 1002,
      reservationCode: "RES-INT-102",
      guestId: 5002,
      guestName: "Maria Oliveira",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: "INTERDYN102A00000000000000000001",
      pixTxIdHistory: ["INTERDYN102A00000000000000000001"],
      pixIsDynamic: true,
      pixCreatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    db.minibarOrders.push(order1);

    setMinibarTestHooks({
      checkInterPixCobStatus: async txid => {
        if (txid === order1.pixTxId) {
          return {
            _httpStatus: 200,
            status: "CONCLUIDA",
            pix: [{ endToEndId: realE2e1, valor: "20.00", horario: nowIso }]
          };
        }
        return { _httpStatus: 200, status: "ATIVA", pix: [] };
      }
    });

    const res1 = await fetch(`${BASE_URL}/api/minibar/orders/${order1.id}/status`);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.status, "pago");
    assert.strictEqual(order1.pixEndToEndId, realE2e1);
    assert.strictEqual(getMinibarOrderVerificationStatus(order1), "verified_e2e");
    assert.strictEqual(launchOrder.paymentStatus, "lancamento_quitado");
    assert.strictEqual(launchOrder.remainingAmount, 0);
    assert.strictEqual(inspection.discrepancyPaid, true);

    // Segundo pedido tenta usar o MESMO endToEndId -> BLOQUEADO!
    const order2 = {
      id: "ORD-MB-PIX-102-B",
      flatNumber: "102",
      reservationId: 1002,
      reservationCode: "RES-INT-102",
      guestId: 5002,
      guestName: "Maria Oliveira",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      pixTxId: "INTERDYN102B00000000000000000002",
      pixTxIdHistory: ["INTERDYN102B00000000000000000002"],
      pixIsDynamic: true,
      pixCreatedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    db.minibarOrders.push(order2);

    setMinibarTestHooks({
      checkInterPixCobStatus: async txid => {
        if (txid === order2.pixTxId) {
          return {
            _httpStatus: 200,
            status: "CONCLUIDA",
            pix: [{ endToEndId: realE2e1, valor: "20.00", horario: nowIso }]
          };
        }
        return { _httpStatus: 200, status: "ATIVA", pix: [] };
      }
    });

    const res2 = await fetch(`${BASE_URL}/api/minibar/orders/${order2.id}/status`);
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.status, "pendente", "Segundo pedido NÃO pode reusar o mesmo endToEndId já reivindicado");
    assert.strictEqual(order2.paymentStatus, "pendente");

    // Verifica unicidade global em db.reservations e db.boletos
    const resE2e = "E00416968202611191235RESE2E00001";
    const bolE2e = "E00416968202611191236BOLE2E00001";
    db.reservations[0].payments = [{ endToEndId: resE2e, amount: 500 }];
    db.boletos.push({ id: "BOL-1", pixEndToEndId: bolE2e });
    assert.strictEqual(isPixEndToEndIdAlreadyClaimed(realE2e1, order2.id), true);
    assert.strictEqual(isPixEndToEndIdAlreadyClaimed(realE2e1, order1.id), false);
    assert.strictEqual(isPixEndToEndIdAlreadyClaimed(resE2e, order2.id), true);
    assert.strictEqual(isPixEndToEndIdAlreadyClaimed(bolE2e, order2.id), true);
  });

  it("3. Stale ?ord= apontando para pedido já pago NÃO retorna alreadyPaid quando há pendingBalance > 0", async () => {
    const { reservation } = seedCheckedOutReservationWithLaunch({
      resId: 1003,
      code: "RES-INT-103",
      flatNumber: "103",
      guestId: 5003,
      guestName: "Pedro Henrique",
      guestPhone: "5522991110003",
      guestEmail: "pedro@teste.com",
      guestDocument: "33344455566",
      launchOrderId: "ORD-MB-DIV-103-NEW",
      inspectionId: "INSP-MB-103"
    });

    const oldPaidOrder = {
      id: "ORD-MB-OLD-PAID-103",
      flatNumber: "103",
      reservationId: 1003,
      reservationCode: "RES-INT-103",
      guestId: 5003,
      guestIndex: 1,
      guestName: "Pedro Henrique",
      totalAmount: 14.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: isoDaysAgo(1),
      pixEndToEndId: "E00416968202611181000OLDPAID0001",
      settlesLaunchOrders: true,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1)
    };
    db.minibarOrders.push(oldPaidOrder);

    const newDynamicTxId = "INTERDYN103FRESH0000000000000001";
    setMinibarTestHooks({
      createInterPixCob: async () => ({
        txid: newDynamicTxId,
        pixCopiaECola: "00020101021226890014br.gov.bcb.pix2567pix.bancointer.com.br/fresh103",
        createdAt: new Date().toISOString()
      })
    });

    const resCreate = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: oldPaidOrder.id,
        reservationCode: reservation.code,
        flatNumber: "103",
        requireCheckout: true,
        paymentMethod: "pix",
        document: "33344455566",
        documentType: "cpf",
        email: "pedro@teste.com",
        phone: "5522991110003"
      })
    });
    assert.strictEqual(resCreate.status, 200);
    const dataCreate = await resCreate.json();
    assert.strictEqual(dataCreate.success, true);
    assert.ok(!dataCreate.alreadyPaid, "NÃO deve retornar alreadyPaid quando pendingBalance > 0");
    assert.strictEqual(dataCreate.paymentStatus, "pendente");
    assert.notStrictEqual(dataCreate.orderId, oldPaidOrder.id, "Deve criar uma nova ordem pagável em vez de retornar a paga antiga");
    assert.strictEqual(dataCreate.totalAmount, 20.0);
    assert.strictEqual(dataCreate.pixIsDynamic, true);
    assert.ok(dataCreate.pixCopiaECola.includes("bancointer.com.br"));

    // Quando o saldo pendente for realmente ZERO e o pedido for pago verificado, retornar alreadyPaid: true é válido
    const launchOrd = db.minibarOrders.find(o => o.id === "ORD-MB-DIV-103-NEW");
    launchOrd.paymentStatus = "lancamento_quitado";
    launchOrd.remainingAmount = 0;

    const resZero = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: oldPaidOrder.id,
        reservationCode: reservation.code,
        flatNumber: "103",
        requireCheckout: true,
        paymentMethod: "pix"
      })
    });
    assert.strictEqual(resZero.status, 200);
    const dataZero = await resZero.json();
    assert.strictEqual(dataZero.alreadyPaid, true);
    assert.strictEqual(dataZero.paymentStatus, "pago");
  });

  it("4. Trava de produção: falha em createInterPixCob retorna HTTP 503 INTER_PIX_UNAVAILABLE sem gerar PIX estático", async () => {
    const { reservation } = seedCheckedOutReservationWithLaunch({
      resId: 1004,
      code: "RES-INT-104",
      flatNumber: "104",
      guestId: 5004,
      guestName: "Lucas Fernandes",
      guestPhone: "5522991110004",
      guestEmail: "lucas@teste.com",
      guestDocument: "44455566677",
      launchOrderId: "ORD-MB-DIV-104",
      inspectionId: "INSP-MB-104"
    });

    const ordersCountBefore = db.minibarOrders.length;

    setMinibarTestHooks({
      forceProductionPixGuard: true,
      createInterPixCob: async () => {
        throw new Error("Banco Inter mTLS timeout 504");
      }
    });

    const resFail = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: reservation.code,
        flatNumber: "104",
        requireCheckout: true,
        paymentMethod: "pix",
        partialMode: "configured_split",
        consumerGuest: { index: 1, name: "Lucas Fernandes" }
      })
    });
    assert.strictEqual(resFail.status, 503);
    const dataFail = await resFail.json();
    assert.strictEqual(dataFail.success, false);
    assert.strictEqual(dataFail.code, "INTER_PIX_UNAVAILABLE");
    assert.match(dataFail.error, /Cartão de Crédito/i);
    assert.strictEqual(db.minibarOrders.length, ordersCountBefore, "Nenhum pedido PIX estático/mock deve ser persistido quando Inter falha em produção");

    // Também bloqueia com HTTP 503 quando createInterPixCob retorna payload incompleto (sem txid/pixCopiaECola)
    setMinibarTestHooks({
      forceProductionPixGuard: true,
      createInterPixCob: async () => ({ txid: "", pixCopiaECola: "" })
    });
    const resEmpty = await fetch(`${BASE_URL}/api/minibar/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: reservation.code,
        flatNumber: "104",
        requireCheckout: true,
        paymentMethod: "pix",
        partialMode: "configured_split",
        consumerGuest: { index: 1, name: "Lucas Fernandes" }
      })
    });
    assert.strictEqual(resEmpty.status, 503);
    const dataEmpty = await resEmpty.json();
    assert.strictEqual(dataEmpty.code, "INTER_PIX_UNAVAILABLE");
    assert.strictEqual(db.minibarOrders.length, ordersCountBefore);
  });

  it("5. Webhook Banco Inter (POST /api/pms/inter/webhook) exige txid exato + E2E real e liquida via settleMinibarOrder()", async () => {
    const { launchOrder, inspection } = seedCheckedOutReservationWithLaunch({
      resId: 2001,
      code: "RES-WH-201",
      flatNumber: "201",
      guestId: 6001,
      guestName: "Amanda Costa",
      guestPhone: "5522992220001",
      guestEmail: "amanda@teste.com",
      guestDocument: "55566677788",
      launchOrderId: "ORD-MB-DIV-201",
      inspectionId: "INSP-MB-201",
      items: [
        {
          productId: "prod_cerveja_long_neck",
          productName: "Cerveja Long Neck",
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          remainingQuantity: 1,
          paidQuantity: 0
        },
        {
          productId: "prod_refrigerante",
          productName: "Refrigerante",
          quantity: 1,
          unitPrice: 12,
          totalPrice: 12,
          remainingQuantity: 1,
          paidQuantity: 0
        }
      ]
    });

    const oldTxId = "INTERDYN201HIST00000000000000001";
    const curTxId = "INTERDYN201CURR00000000000000002";
    const whOrder = {
      id: "ORD-MB-WH-201",
      flatNumber: "201",
      reservationId: 2001,
      reservationCode: "RES-WH-201",
      guestId: 6001,
      guestIndex: 1,
      guestName: "Amanda Costa",
      totalAmount: 32.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: curTxId,
      pixTxIdHistory: [oldTxId, curTxId],
      pixIsDynamic: true,
      items: [...launchOrder.items],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.minibarOrders.push(whOrder);

    // 5a. Match frouxo / substring de orderId NÃO pode casar
    await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix: [{ txid: `LOOSE_${whOrder.id}_SUFFIX`, valor: "32.00", endToEndId: "E00416968202611191300LOOSE000001" }]
      })
    });
    assert.strictEqual(whOrder.paymentStatus, "pendente", "Webhook não deve usar .includes() frouxo");

    // 5b. Valor inferior ao devido NÃO pode liquidar
    await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix: [{ txid: curTxId, valor: "10.00", endToEndId: "E00416968202611191301UNDER000001" }]
      })
    });
    assert.strictEqual(whOrder.paymentStatus, "pendente", "Webhook deve ignorar pagamento com valor insuficiente");

    // 5c. E2E sintético NÃO pode liquidar
    await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix: [{ txid: curTxId, valor: "32.00", endToEndId: "E2E_9999999999999" }]
      })
    });
    assert.strictEqual(whOrder.paymentStatus, "pendente", "Webhook deve bloquear E2E sintético");

    // 5d. Match exato (inclusive via pixTxIdHistory) + E2E real + valor cheio liquida tudo via settleMinibarOrder()
    const realWhE2e = "E00416968202611191305WEBHOOK0001";
    const resWh = await fetch(`${BASE_URL}/api/pms/inter/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pix: [{ txid: oldTxId, valor: "32.00", endToEndId: realWhE2e, horario: new Date().toISOString() }]
      })
    });
    assert.strictEqual(resWh.status, 200);
    assert.strictEqual(whOrder.paymentStatus, "pago");
    assert.strictEqual(whOrder.pixEndToEndId, realWhE2e);
    assert.strictEqual(whOrder.paymentVerifiedSource, "inter_webhook");
    assert.strictEqual(launchOrder.paymentStatus, "lancamento_quitado", "Webhook deve zerar lançamento pai via settleMinibarOrder()");
    assert.strictEqual(launchOrder.remainingAmount, 0);
    assert.strictEqual(inspection.discrepancyPaid, true, "Webhook deve marcar inspeção vinculada como discrepancyPaid=true");
    assert.strictEqual(inspection.discrepancyResolved, true);
  });

  it("6. Auditoria automática (auditAndReopenFalsePaidMinibarOrders) & proteção de merge contra ressurreição de 'pago'", async () => {
    const zapiSent = [];
    // Caso A: Falso-pago com E2E sintético + cobrança ATIVA -> deve REABRIR e restaurar lançamento + inspeção
    const caseA = seedCheckedOutReservationWithLaunch({
      resId: 2002,
      code: "RES-AUD-202",
      flatNumber: "202",
      guestId: 6002,
      guestName: "Bruno Almeida",
      guestPhone: "5522992220002",
      guestEmail: "bruno@teste.com",
      guestDocument: "11133355577",
      daysAgoCheckout: 4,
      launchOrderId: "ORD-MB-DIV-AUD-A",
      inspectionId: "INSP-MB-AUD-A"
    });
    caseA.launchOrder.paymentStatus = "lancamento_quitado";
    caseA.launchOrder.remainingAmount = 0;
    caseA.launchOrder.items[0].paidQuantity = 1;
    caseA.launchOrder.items[0].remainingQuantity = 0;
    caseA.inspection.discrepancyPaid = true;
    caseA.inspection.discrepancyResolved = true;

    const paidAtOld = isoDaysAgo(3);
    const orderReopen = {
      id: "ORD-MB-AUD-REOPEN",
      flatNumber: "202",
      reservationId: 2002,
      reservationCode: "RES-AUD-202",
      guestId: 6002,
      guestIndex: 1,
      guestName: "Bruno Almeida",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: paidAtOld,
      pixTxId: "INTERDYNAUDITUNPAID0000000000001",
      pixEndToEndId: "E2E_1793000000001",
      settlesLaunchOrders: true,
      items: [{ productId: "prod_cerveja_long_neck", productName: "Cerveja Long Neck", quantity: 1, unitPrice: 20, totalPrice: 20 }],
      createdAt: paidAtOld,
      updatedAt: paidAtOld
    };
    caseA.reservation.minibarPayments.push({ orderId: orderReopen.id, amount: 20, paidAt: paidAtOld });

    // Caso B: Pedido com E2E sintético MAS Inter confirma CONCLUIDA com E2E real -> deve PREENCHER E2E real e manter pago
    const realBackfillE2e = "E00416968202611191400BACKFILL001";
    const orderBackfill = {
      id: "ORD-MB-AUD-BACKFILL",
      flatNumber: "203",
      reservationId: 2003,
      reservationCode: "RES-AUD-203",
      guestName: "Carla Souza",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: paidAtOld,
      pixTxId: "INTERDYNAUDITPAID000000000000002",
      pixEndToEndId: "E2E_1793000000002",
      createdAt: paidAtOld,
      updatedAt: paidAtOld
    };

    // Caso C: Pedido com NF já anexada sem E2E real -> NÃO pode reabrir automaticamente (apenas sinalizar)
    const orderWithInvoice = {
      id: "ORD-MB-AUD-WITH-NF",
      flatNumber: "204",
      reservationId: 2004,
      reservationCode: "RES-AUD-204",
      guestName: "Daniel Rocha",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: paidAtOld,
      pixTxId: "INTERDYNAUDITNF00000000000000003",
      pixEndToEndId: "E2E_1793000000003",
      invoice: { status: "anexada", invoiceFileUrl: "/uploads/nf-aud-204.pdf", invoiceNumber: "NF-204" },
      createdAt: paidAtOld,
      updatedAt: paidAtOld
    };

    // Caso D: Erro de rede / timeout na consulta Inter -> JAMAIS pode reabrir
    const orderNetErr = {
      id: "ORD-MB-AUD-NETERR",
      flatNumber: "205",
      reservationId: 2005,
      reservationCode: "RES-AUD-205",
      guestName: "Eduarda Lima",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: paidAtOld,
      pixTxId: "INTERDYNAUDITNETERR0000000000004",
      pixEndToEndId: "E2E_1793000000004",
      createdAt: paidAtOld,
      updatedAt: paidAtOld
    };

    db.minibarOrders.push(orderReopen, orderBackfill, orderWithInvoice, orderNetErr);

    setMinibarTestHooks({
      checkInterPixCobStatus: async txid => {
        if (txid === orderReopen.pixTxId) return { _httpStatus: 200, status: "ATIVA", pix: [] };
        if (txid === orderBackfill.pixTxId) {
          return {
            _httpStatus: 200,
            status: "CONCLUIDA",
            pix: [{ endToEndId: realBackfillE2e, valor: "20.00", horario: paidAtOld }]
          };
        }
        if (txid === orderNetErr.pixTxId) return { _httpStatus: 503, _networkError: true };
        return { _httpStatus: 404, notFound: true };
      },
      getCachedInterExtratoCompleto: async () => null,
      getCachedInterExtratoCompletoWindow: async () => null,
      sendZapiMessage: async (_cfg, payload) => {
        zapiSent.push(payload);
        return { success: true };
      }
    });

    const resAudit = await fetch(`${BASE_URL}/api/minibar/collections/audit-false-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookbackDays: 15 })
    });
    assert.strictEqual(resAudit.status, 200);
    const dataAudit = await resAudit.json();
    assert.strictEqual(dataAudit.success, true);

    const rpt = dataAudit.report;
    assert.strictEqual(rpt.scannedCount, 4);
    assert.strictEqual(rpt.reopenedCount, 1);
    assert.strictEqual(rpt.backfilledCount, 1);
    assert.strictEqual(rpt.verifiedBackfilledCount, 1);
    assert.strictEqual(rpt.flaggedWithInvoiceCount, 1);
    assert.strictEqual(rpt.skippedOnNetworkErrorCount, 1);

    // Verifica Caso A reaberto completamente
    assert.strictEqual(orderReopen.paymentStatus, "pendente");
    assert.ok(orderReopen.reopenedAt, "Pedido reaberto deve registrar reopenedAt");
    assert.strictEqual(orderReopen.pixEndToEndId, null);
    assert.strictEqual(orderReopen.paidAt, null);
    assert.strictEqual(caseA.launchOrder.paymentStatus, "pendente");
    assert.strictEqual(caseA.launchOrder.remainingAmount, 20);
    assert.strictEqual(caseA.launchOrder.items[0].remainingQuantity, 1);
    assert.strictEqual(caseA.inspection.discrepancyPaid, false);
    assert.strictEqual(caseA.inspection.discrepancyResolved, false);
    assert.strictEqual(caseA.reservation.minibarPayments.length, 0);

    // Verifica Caso B backfilled com E2E real
    assert.strictEqual(orderBackfill.paymentStatus, "pago");
    assert.strictEqual(orderBackfill.pixEndToEndId, realBackfillE2e);
    assert.strictEqual(orderBackfill.paymentVerifiedSource, "inter_audit_backfill");

    // Verifica Caso C sinalizado e NÃO reaberto
    assert.strictEqual(orderWithInvoice.paymentStatus, "pago");
    assert.strictEqual(orderWithInvoice.reopenedAt, undefined);

    // Verifica Caso D preservado sob erro de rede
    assert.strictEqual(orderNetErr.paymentStatus, "pago");
    assert.strictEqual(orderNetErr.reopenedAt, undefined);

    // Gestor notificado via WhatsApp pelas reaberturas
    assert.ok(
      zapiSent.some(m => m.triggerEvent === "minibar_audit_reopen_summary"),
      "Gestor deve receber resumo no WhatsApp quando a auditoria reabrir pedidos"
    );

    // PROTEÇÃO DE MERGE: snapshot antigo com status "pago" (paidAt <= reopenedAt) NÃO pode ressuscitar "pago"
    reconcileUniversalIntegrity({
      minibarOrders: [
        {
          id: orderReopen.id,
          paymentStatus: "pago",
          paidAt: paidAtOld,
          pixEndToEndId: "E2E_1793000000001",
          updatedAt: paidAtOld
        }
      ]
    });
    const afterMergeOrder = db.minibarOrders.find(o => o.id === orderReopen.id);
    assert.strictEqual(
      afterMergeOrder.paymentStatus,
      "pendente",
      "reconcileUniversalIntegrity NÃO pode sobrescrever pedido reaberto de volta para 'pago' com snapshot antigo"
    );
  });

  it("7. Motor de avisos diários D+1..D+7: janela 15d, início seguro Dia 1, split-aware, pré-check ao vivo, D+7 CDC + Tag CRM + controles operacionais", async () => {
    const waLog = [];
    const emailLog = [];
    const convLog = [];

    // 7A. Reserva de 30 dias atrás -> fora da janela de 15 dias (deve ser ignorada)
    seedCheckedOutReservationWithLaunch({
      resId: 3001,
      code: "RES-OLD-301",
      flatNumber: "301",
      guestId: 7001,
      guestName: "Antônio Antigo",
      guestPhone: "5522993330001",
      guestEmail: "antonio@teste.com",
      guestDocument: "70010020033",
      daysAgoCheckout: 30,
      launchOrderId: "ORD-MB-DIV-301",
      inspectionId: "INSP-MB-301"
    });

    // 7B. Reserva pendente há 5 dias (reminderCount = 0) -> deve começar no DIA 1 (nunca pular para Dia 7)
    const res5d = seedCheckedOutReservationWithLaunch({
      resId: 3002,
      code: "RES-5D-302",
      flatNumber: "302",
      guestId: 7002,
      guestName: "Beatriz Ferreira",
      guestPhone: "5522993330002",
      guestEmail: "beatriz@teste.com",
      guestDocument: "70020030044",
      daysAgoCheckout: 5,
      launchOrderId: "ORD-MB-DIV-302",
      inspectionId: "INSP-MB-302",
      items: [
        {
          productId: "prod_cerveja_long_neck",
          productName: "Cerveja Long Neck",
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          remainingQuantity: 1,
          paidQuantity: 0
        },
        {
          productId: "prod_agua_mineral_copo",
          productName: "Água Mineral Copo",
          quantity: 1,
          unitPrice: 5,
          totalPrice: 5,
          remainingQuantity: 1,
          paidQuantity: 0
        }
      ]
    });

    // 7C. Reserva com divisão half_and_half onde Hóspede 1 JÁ pagou R$ 20 e Hóspede 2 DEVE R$ 20
    const resSplit = seedCheckedOutReservationWithLaunch({
      resId: 3003,
      code: "RES-SPLIT-303",
      flatNumber: "303",
      guestId: 7003,
      guestName: "Gustavo Pago",
      guestPhone: "5522993330003",
      guestEmail: "gustavo.pago@teste.com",
      guestDocument: "70030040055",
      daysAgoCheckout: 2,
      launchOrderId: "ORD-MB-DIV-303",
      inspectionId: "INSP-MB-303",
      items: [
        {
          productId: "prod_cerveja_long_neck",
          productName: "Cerveja Long Neck",
          quantity: 2,
          unitPrice: 20,
          totalPrice: 40,
          remainingQuantity: 2,
          paidQuantity: 0
        }
      ],
      extraGuests: [
        {
          index: 1,
          guestId: 7003,
          name: "Gustavo Pago",
          phone: "5522993330003",
          email: "gustavo.pago@teste.com",
          cpf: "70030040055"
        },
        {
          index: 2,
          guestId: 7004,
          name: "Helena Devedora",
          phone: "5522993330004",
          email: "helena.devedora@teste.com",
          cpf: "70040050066"
        }
      ],
      splitConfig: { mode: "half_and_half", updatedAt: isoDaysAgo(2) }
    });
    db.guests.push({
      id: 7004,
      name: "Helena Devedora",
      fullName: "Helena Devedora",
      phone: "5522993330004",
      email: "helena.devedora@teste.com",
      document: "70040050066",
      documentNumber: "70040050066",
      tags: []
    });
    // Liquida legitimamente a cota do Hóspede 1 (R$ 20)
    const g1PaidOrd = {
      id: "ORD-MB-SPLIT-RES-SPLIT-303-G1",
      flatNumber: "303",
      reservationId: 3003,
      reservationCode: "RES-SPLIT-303",
      guestId: 7003,
      guestIndex: 1,
      guestName: "Gustavo Pago",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      partialMode: "equal_split",
      settlesLaunchOrders: true,
      items: [{ productId: "split_share", productName: "Cota 50/50", quantity: 1, unitPrice: 20, totalPrice: 20 }],
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(2)
    };
    db.minibarOrders.push(g1PaidOrd);
    const g1Settled = settleMinibarOrder(g1PaidOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E00416968202611181000G1SPLIT0001",
      amount: 20.0,
      paidAt: isoDaysAgo(1),
      source: "inter_cob_api"
    });
    assert.ok(g1Settled, "Cota do Hóspede 1 deve liquidar com E2E real");

    // 7D. Reserva cujo PIX acabou de ser pago no Banco Inter -> pré-check ao vivo deve liquidar e ABORTAR lembrete!
    const resPrecheck = seedCheckedOutReservationWithLaunch({
      resId: 3004,
      code: "RES-PRECHK-304",
      flatNumber: "304",
      guestId: 7005,
      guestName: "Igor Quitado",
      guestPhone: "5522993330005",
      guestEmail: "igor@teste.com",
      guestDocument: "70050060077",
      daysAgoCheckout: 2,
      launchOrderId: "ORD-MB-DIV-304",
      inspectionId: "INSP-MB-304"
    });
    const precheckOrd = {
      id: "ORD-MB-PRECHK-304",
      flatNumber: "304",
      reservationId: 3004,
      reservationCode: "RES-PRECHK-304",
      guestId: 7005,
      guestIndex: 1,
      guestName: "Igor Quitado",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: "INTERDYN304PRECHECK0000000000001",
      pixTxIdHistory: ["INTERDYN304PRECHECK0000000000001"],
      pixIsDynamic: true,
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(2)
    };
    db.minibarOrders.push(precheckOrd);

    const precheckRealE2e = "E00416968202611191000PRECHK00001";
    setMinibarTestHooks({
      checkInterPixCobStatus: async txid => {
        if (txid === precheckOrd.pixTxId) {
          return {
            _httpStatus: 200,
            status: "CONCLUIDA",
            pix: [{ endToEndId: precheckRealE2e, valor: "20.00", horario: new Date().toISOString() }]
          };
        }
        return { _httpStatus: 200, status: "ATIVA", pix: [] };
      },
      sendZapiMessage: async (_cfg, payload) => {
        waLog.push(payload);
        return { success: true };
      },
      sendEmailAsync: payload => {
        emailLog.push(payload);
      },
      appendMessageToConversation: (_db, payload) => {
        convLog.push(payload);
      }
    });

    const todayYmd = ymdDaysAgo(0);

    // Verifica janela de 15 dias e split-awareness em collectPendingMinibarCollectionTargets
    const targetsBefore = collectPendingMinibarCollectionTargets({ lookbackDays: 15 });
    const targetKeys = targetsBefore.map(t => t.targetKey);
    assert.ok(!targetKeys.some(k => k.startsWith("RES-OLD-301")), "Reserva de 30 dias atrás deve ser ignorada pela janela de 15 dias");
    assert.ok(targetKeys.includes("RES-5D-302::G1"), "Reserva pendente há 5 dias deve ser incluída");
    assert.ok(!targetKeys.includes("RES-SPLIT-303::G1"), "Hóspede 1 que já pagou sua cota 50/50 NÃO deve ser cobrado");
    assert.ok(targetKeys.includes("RES-SPLIT-303::G2"), "Apenas Hóspede 2 com cota em aberto deve ser cobrado");
    assert.ok(targetKeys.includes("RES-PRECHK-304::G1"), "Reserva com PIX pendente no DB entra antes do pré-check");

    // Antes do horário agendado (09:00 < 10:00) -> não dispara automaticamente
    const runTooEarly = await processDailyMinibarPaymentReminders({
      force: false,
      nowOverride: brasiliaDateAtHour(todayYmd, 9, 0)
    });
    assert.strictEqual(runTooEarly.skipped, true);
    assert.strictEqual(runTooEarly.reason, "BEFORE_SCHEDULED_HOUR");
    assert.strictEqual(waLog.length, 0);

    // Pausa Helena (RES-SPLIT-303::G2) via endpoint -> não deve receber no disparo automático
    const pauseRes = await fetch(`${BASE_URL}/api/minibar/collections/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-SPLIT-303",
        guestIndex: 2,
        paused: true,
        reason: "Hóspede combinou pagamento amanhã"
      })
    });
    assert.strictEqual(pauseRes.status, 200);
    const pauseData = await pauseRes.json();
    assert.strictEqual(pauseData.state.paused, true);

    // Disparo automático às 10:30 Brasília (Dia 1):
    // - Beatriz (5d atrás): recebe Dia 1 (cordial) por WhatsApp + E-mail (nunca pula para Dia 7!)
    // - Helena (pausada): NÃO recebe
    // - Igor (RES-PRECHK-304): pré-check ao vivo confirma no Inter, liquida e ABORTA envio!
    const runDay1 = await processDailyMinibarPaymentReminders({
      force: false,
      nowOverride: brasiliaDateAtHour(todayYmd, 10, 30)
    });
    assert.strictEqual(runDay1.sentCount, 1, "Apenas Beatriz deve receber no disparo automático (Helena pausada, Igor quitado no pré-check)");
    assert.strictEqual(runDay1.settledBeforeSendCount, 1, "Igor deve ser liquidado automaticamente no pré-check ao vivo");
    assert.strictEqual(precheckOrd.paymentStatus, "pago");
    assert.strictEqual(precheckOrd.pixEndToEndId, precheckRealE2e);
    assert.strictEqual(resPrecheck.launchOrder.paymentStatus, "lancamento_quitado");
    assert.ok(!waLog.some(m => m.phone === resPrecheck.reservation.guestPhone), "Igor não pode receber cobrança após pré-check confirmar pagamento");
    assert.ok(!waLog.some(m => m.phone === "5522993330003"), "Gustavo (Hóspede 1 pago) jamais pode receber cobrança");
    assert.ok(!waLog.some(m => m.phone === "5522993330004"), "Helena pausada não pode receber cobrança automática");

    const beatrizDay1Wa = waLog.find(m => m.phone === "5522993330002");
    const beatrizDay1Email = emailLog.find(m => m.recipient === "beatriz@teste.com");
    assert.ok(beatrizDay1Wa, "Beatriz deve receber lembrete Dia 1 no WhatsApp");
    assert.strictEqual(beatrizDay1Wa.triggerEvent, "minibar_payment_reminder");
    assert.match(beatrizDay1Wa.message, /lembrar com carinho|excelente estadia/i, "Dia 1 deve usar tom cordial mesmo para pendência de 5 dias atrás");
    assert.ok(beatrizDay1Email, "Beatriz deve receber lembrete Dia 1 por E-mail");
    assert.strictEqual(res5d.reservation.minibarReminderState["1"].reminderCount, 1);

    // Mesmo dia não dispara novamente
    const runSameDayAgain = await processDailyMinibarPaymentReminders({
      force: false,
      nowOverride: brasiliaDateAtHour(todayYmd, 15, 0)
    });
    assert.strictEqual(runSameDayAgain.sentCount, 0, "Não deve enviar mais de 1 lembrete no mesmo dia");

    // Retoma Helena e dispara manualmente via POST /api/minibar/collections/send-now
    const resumeRes = await fetch(`${BASE_URL}/api/minibar/collections/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationCode: "RES-SPLIT-303", guestIndex: 2, paused: false })
    });
    assert.strictEqual(resumeRes.status, 200);

    const sendNowRes = await fetch(`${BASE_URL}/api/minibar/collections/send-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationCode: "RES-SPLIT-303", guestIndex: 2 })
    });
    assert.strictEqual(sendNowRes.status, 200);
    const sendNowData = await sendNowRes.json();
    assert.strictEqual(sendNowData.success, true);
    assert.strictEqual(sendNowData.stepNumber, 1);
    assert.strictEqual(sendNowData.whatsappSent, true);
    assert.strictEqual(sendNowData.emailSent, true);
    assert.ok(waLog.some(m => m.phone === "5522993330004" && /guestIndex=2/.test(m.message)));
    assert.ok(emailLog.some(m => m.recipient === "helena.devedora@teste.com"));
    assert.ok(!waLog.some(m => m.phone === "5522993330003"), "Hóspede 1 que já pagou continua sem receber nenhuma cobrança");

    // Avança Beatriz pelos Dias 2, 3, 4, 5, 6 e 7 (simulando 1 dia por vez às 10:30)
    for (let step = 2; step <= 7; step++) {
      const simYmd = addDaysYmd(todayYmd, step - 1);
      const rStep = await processDailyMinibarPaymentReminders({
        force: false,
        targetReservationCode: "RES-5D-302",
        targetGuestIndex: 1,
        nowOverride: brasiliaDateAtHour(simYmd, 10, 30)
      });
      assert.strictEqual(rStep.sentCount, 1, `Beatriz deve receber exatamente 1 aviso no Dia ${step}`);
      assert.strictEqual(res5d.reservation.minibarReminderState["1"].reminderCount, step);
    }

    // Verifica conformidade CDC Art. 42/71 no Dia 7 + Tag CRM + Alerta ao Gestor
    const beatrizFormalWa = waLog.find(
      m => m.phone === "5522993330002" && m.triggerEvent === "minibar_payment_formal_notice"
    );
    assert.ok(beatrizFormalWa, "Dia 7 deve disparar triggerEvent 'minibar_payment_formal_notice'");
    assert.match(beatrizFormalWa.message, /48 horas/i);
    assert.match(beatrizFormalWa.message, /SPC\/Serasa/i);
    assert.match(beatrizFormalWa.message, /protesto em cartório/i);
    assert.match(beatrizFormalWa.message, /comprovante/i);
    assert.doesNotMatch(beatrizFormalWa.message, /caloteir|vergonha|ladr[aã]o|pol[ií]cia|crime/i, "Mensagem D+7 deve respeitar CDC Art. 42/71 sem linguagem abusiva");

    assert.ok(
      waLog.some(m => m.phone === "5522999000001" && m.triggerEvent === "minibar_payment_day7_manager_alert"),
      "Dia 7 deve alertar o WhatsApp do gestor"
    );
    assert.ok(
      res5d.crmGuest.tags.includes("Pendência Frigobar"),
      "Dia 7 deve adicionar a tag 'Pendência Frigobar' no cadastro do hóspede no CRM"
    );

    // Overview reflete escalonamento D+7 e tag CRM
    const overviewRes = await fetch(`${BASE_URL}/api/minibar/collections/overview`);
    assert.strictEqual(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.strictEqual(overview.success, true);
    assert.ok(overview.summary.day7EscalatedCount >= 1);
    const beatrizTarget = overview.pendingTargets.find(t => t.targetKey === "RES-5D-302::G1");
    assert.ok(beatrizTarget);
    assert.strictEqual(beatrizTarget.reminderCount, 7);
    assert.strictEqual(beatrizTarget.crmTagged, true);

    // Baixa manual (POST /api/minibar/collections/manual-settle) quita Beatriz e REMOVE tag "Pendência Frigobar" do CRM!
    const manualSettleRes = await fetch(`${BASE_URL}/api/minibar/collections/manual-settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationCode: "RES-5D-302",
        guestIndex: 1,
        paymentMethod: "pix_avulso",
        amount: 25.0,
        notes: "Comprovante PIX conferido na recepção"
      })
    });
    assert.strictEqual(manualSettleRes.status, 200);
    const manualSettleData = await manualSettleRes.json();
    assert.strictEqual(manualSettleData.success, true);
    assert.strictEqual(manualSettleData.order.paymentStatus, "pago");
    assert.strictEqual(manualSettleData.order.manualPaymentConfirmed, true);
    assert.strictEqual(
      res5d.crmGuest.tags.includes("Pendência Frigobar"),
      false,
      "Baixa manual / quitação deve remover automaticamente a tag 'Pendência Frigobar' do CRM"
    );
    const stmtAfterSettle = buildReservationMinibarStatement(res5d.reservation, "302");
    assert.strictEqual(stmtAfterSettle.pendingBalance, 0);

    // Reabertura manual (POST /api/minibar/orders/:id/reopen) restaura pendência corretamente
    const reopenManualRes = await fetch(
      `${BASE_URL}/api/minibar/orders/${encodeURIComponent(manualSettleData.order.id)}/reopen`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Estorno de teste administrativo" })
      }
    );
    assert.strictEqual(reopenManualRes.status, 200);
    const reopenManualData = await reopenManualRes.json();
    assert.strictEqual(reopenManualData.success, true);
    assert.strictEqual(reopenManualData.order.paymentStatus, "pendente");
    assert.strictEqual(buildReservationMinibarStatement(res5d.reservation, "302").pendingBalance, 25);

    // Também valida remoção da tag CRM via quitação PIX real (não manual) em Helena (RES-SPLIT-303::G2)
    const helenaCrm = db.guests.find(g => g.id === 7004);
    helenaCrm.tags.push("Pendência Frigobar");
    const helenaPixOrd = {
      id: "ORD-MB-HELENA-PIX",
      flatNumber: "303",
      reservationId: 3003,
      reservationCode: "RES-SPLIT-303",
      guestId: 7004,
      guestIndex: 2,
      guestName: "Helena Devedora",
      guestPhone: "5522993330004",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      partialMode: "equal_split",
      settlesLaunchOrders: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.minibarOrders.push(helenaPixOrd);
    settleMinibarOrder(helenaPixOrd, {
      paymentMethod: "pix",
      pixEndToEndId: "E00416968202611191600HELENA00001",
      amount: 20.0,
      source: "inter_cob_api"
    });
    assert.strictEqual(
      helenaCrm.tags.includes("Pendência Frigobar"),
      false,
      "Liquidação via PIX real também deve remover automaticamente a tag 'Pendência Frigobar' do CRM"
    );

    // 7E. Valida também split 'by_item' (Hóspede 1 pagou seu item, só Hóspede 2 recebe cobrança)
    //     e pré-check ao vivo via POST /api/minibar/collections/send-now retornando settledOnPrecheck: true
    const byItemSeed = seedCheckedOutReservationWithLaunch({
      resId: 3005,
      code: "RES-BYITEM-305",
      flatNumber: "304",
      guestId: 7010,
      guestName: "Titular ByItem Pago",
      guestPhone: "5522993330010",
      guestEmail: "titular.byitem@teste.com",
      guestDocument: "70100020033",
      daysAgoCheckout: 2,
      launchOrderId: "ORD-MB-DIV-305",
      inspectionId: "INSP-MB-305",
      items: [
        {
          productId: "prod_refrigerante",
          productName: "Refrigerante",
          quantity: 1,
          unitPrice: 12,
          totalPrice: 12,
          remainingQuantity: 1,
          paidQuantity: 0
        },
        {
          productId: "prod_cerveja_long_neck",
          productName: "Cerveja Long Neck",
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          remainingQuantity: 1,
          paidQuantity: 0
        }
      ],
      extraGuests: [
        {
          index: 1,
          guestId: 7010,
          name: "Titular ByItem Pago",
          phone: "5522993330010",
          email: "titular.byitem@teste.com",
          cpf: "70100020033"
        },
        {
          index: 2,
          guestId: 7011,
          name: "Acompanhante ByItem Devedor",
          phone: "5522993330011",
          email: "acomp.byitem@teste.com",
          cpf: "70110020044"
        }
      ],
      splitConfig: {
        mode: "by_item",
        itemAssignments: {
          "ORD-MB-DIV-305::prod_refrigerante::0": { "1": 1, "2": 0 },
          "ORD-MB-DIV-305::prod_cerveja_long_neck::1": { "1": 0, "2": 1 }
        },
        updatedAt: isoDaysAgo(2)
      }
    });
    const byItemG1Ord = {
      id: "ORD-MB-SPLIT-RES-BYITEM-305-G1",
      flatNumber: "304",
      reservationId: 3005,
      reservationCode: "RES-BYITEM-305",
      guestId: 7010,
      guestIndex: 1,
      guestName: "Titular ByItem Pago",
      totalAmount: 12.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      partialMode: "items",
      settlesLaunchOrders: true,
      selectedLaunchItems: [
        { productId: "prod_refrigerante", quantity: 1, unitPrice: 12, launchOrderId: "ORD-MB-DIV-305" }
      ],
      items: [{ productId: "prod_refrigerante", productName: "Refrigerante", quantity: 1, unitPrice: 12, totalPrice: 12 }],
      createdAt: isoDaysAgo(2),
      updatedAt: isoDaysAgo(2)
    };
    db.minibarOrders.push(byItemG1Ord);
    assert.ok(
      settleMinibarOrder(byItemG1Ord, {
        paymentMethod: "pix",
        pixEndToEndId: "E00416968202611191700BYITEMG1001",
        amount: 12.0,
        source: "inter_cob_api"
      })
    );

    const byItemTargets = collectPendingMinibarCollectionTargets({ lookbackDays: 15 }).filter(
      t => t.reservationCode === "RES-BYITEM-305"
    );
    assert.strictEqual(byItemTargets.length, 1, "Em by_item, apenas o hóspede com item em aberto deve aparecer");
    assert.strictEqual(byItemTargets[0].guestIndex, 2);
    assert.strictEqual(byItemTargets[0].pendingAmount, 20.0);

    // Simula ordem PIX pendente do Hóspede 2 recém-paga no Inter e testa send-now abortando via pré-check ao vivo
    const byItemG2Ord = {
      id: "ORD-MB-SPLIT-RES-BYITEM-305-G2",
      flatNumber: "304",
      reservationId: 3005,
      reservationCode: "RES-BYITEM-305",
      guestId: 7011,
      guestIndex: 2,
      guestName: "Acompanhante ByItem Devedor",
      totalAmount: 20.0,
      paymentMethod: "pix",
      paymentStatus: "pendente",
      settlesLaunchOrders: true,
      pixTxId: "INTERDYN305BYITEMG20000000000001",
      pixTxIdHistory: ["INTERDYN305BYITEMG20000000000001"],
      pixIsDynamic: true,
      createdAt: isoDaysAgo(1),
      updatedAt: isoDaysAgo(1)
    };
    db.minibarOrders.push(byItemG2Ord);

    const waCountBeforePrecheckSendNow = waLog.length;
    setMinibarTestHooks({
      checkInterPixCobStatus: async txid => {
        if (txid === byItemG2Ord.pixTxId) {
          return {
            _httpStatus: 200,
            status: "CONCLUIDA",
            pix: [{ endToEndId: "E00416968202611191705BYITEMG2002", valor: "20.00", horario: new Date().toISOString() }]
          };
        }
        return { _httpStatus: 200, status: "ATIVA", pix: [] };
      },
      sendZapiMessage: async (_cfg, payload) => {
        waLog.push(payload);
        return { success: true };
      },
      sendEmailAsync: payload => {
        emailLog.push(payload);
      },
      appendMessageToConversation: (_db, payload) => {
        convLog.push(payload);
      }
    });

    const sendNowPrecheckRes = await fetch(`${BASE_URL}/api/minibar/collections/send-now`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationCode: byItemSeed.reservation.code, guestIndex: 2 })
    });
    assert.strictEqual(sendNowPrecheckRes.status, 200);
    const sendNowPrecheckData = await sendNowPrecheckRes.json();
    assert.strictEqual(sendNowPrecheckData.settledOnPrecheck, true);
    assert.strictEqual(sendNowPrecheckData.alreadyPaid, true);
    assert.strictEqual(waLog.length, waCountBeforePrecheckSendNow, "send-now não deve disparar WhatsApp quando pré-check confirma pagamento");
    assert.strictEqual(byItemG2Ord.paymentStatus, "pago");
    assert.strictEqual(buildReservationMinibarStatement(byItemSeed.reservation, "304").pendingBalance, 0);
  });

  it("8. Endpoints administrativos: confirmação manual de suspeito, PUT /api/minibar/settings, anserve-reports e guarda 403", async () => {
    // Pedido suspeito sem E2E real para testar anserve-reports + confirmação manual (Caso A)
    const suspOrder = {
      id: "ORD-MB-SUSP-801",
      flatNumber: "101",
      reservationCode: "RES-SUSP-801",
      guestName: "Sérgio Suspeito",
      totalAmount: 15.0,
      paymentMethod: "pix",
      paymentStatus: "pago",
      paidAt: new Date().toISOString(),
      pixEndToEndId: "E2E_1793999888777",
      items: [{ productId: "prod_refrigerante", productName: "Refrigerante", quantity: 1, unitPrice: 15, totalPrice: 15 }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.minibarOrders.push(suspOrder);

    // 8a. GET /api/minibar/anserve-reports expõe paymentVerificationStatus, pixEndToEndId e manualPaymentConfirmed
    const repRes = await fetch(`${BASE_URL}/api/minibar/anserve-reports?startDate=2026-01-01&endDate=2027-12-31`);
    assert.strictEqual(repRes.status, 200);
    const repData = await repRes.json();
    const repOrd = (repData.salesSummary?.orders || []).find(o => o.id === suspOrder.id);
    assert.ok(repOrd);
    assert.strictEqual(repOrd.paymentVerificationStatus, "unverified_synthetic_e2e");
    assert.strictEqual(repOrd.pixEndToEndId, "E2E_1793999888777");
    assert.strictEqual(repOrd.manualPaymentConfirmed, false);

    // 8b. Confirmação manual de pedido já pago suspeito (Caso A do manual-settle)
    const confirmRes = await fetch(`${BASE_URL}/api/minibar/collections/manual-settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: suspOrder.id,
        paymentMethod: "pix_avulso",
        amount: 15.0,
        notes: "Conferido no extrato pela gerência"
      })
    });
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(suspOrder.manualPaymentConfirmed, true);
    assert.strictEqual(getMinibarOrderVerificationStatus(suspOrder), "manual_confirmed");

    // 8c. PUT /api/minibar/settings persiste todas as novas configurações
    const putSetRes = await fetch(`${BASE_URL}/api/minibar/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyPaymentRemindersEnabled: false,
        dailyPaymentReminderHour: 11,
        dailyPaymentReminderLookbackDays: 20,
        dailyPaymentReminderMaxDays: 5,
        dailyPaymentReminderNotifyManagerOnDay7: false
      })
    });
    assert.strictEqual(putSetRes.status, 200);
    const putSetData = await putSetRes.json();
    assert.strictEqual(putSetData.settings.dailyPaymentRemindersEnabled, false);
    assert.strictEqual(putSetData.settings.dailyPaymentReminderHour, 11);
    assert.strictEqual(putSetData.settings.dailyPaymentReminderLookbackDays, 20);
    assert.strictEqual(putSetData.settings.dailyPaymentReminderMaxDays, 5);
    assert.strictEqual(putSetData.settings.dailyPaymentReminderNotifyManagerOnDay7, false);

    // 8d. Auth guard (403) com x-enforce-auth: true
    for (const [method, url] of [
      ["GET", "/api/minibar/collections/overview"],
      ["POST", "/api/minibar/collections/send-now"],
      ["POST", "/api/minibar/collections/pause"],
      ["POST", "/api/minibar/collections/manual-settle"],
      ["POST", "/api/minibar/collections/audit-false-paid"],
      ["POST", `/api/minibar/orders/${suspOrder.id}/reopen`]
    ]) {
      const guardRes = await fetch(`${BASE_URL}${url}`, {
        method,
        headers: { "Content-Type": "application/json", "x-enforce-auth": "true" },
        body: method === "POST" ? JSON.stringify({}) : undefined
      });
      assert.strictEqual(guardRes.status, 403, `${method} ${url} deve retornar 403 sem autenticação admin`);
    }
  });
});
