/**
 * Independent Verification Suite: Troca de Flat com Corte e Inversão (907 ⇄ 512)
 * File: tests/room-move-swap.test.mjs
 *
 * Strictly isolated execution:
 *   node tests/room-move-swap.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ── 1. Strict Sandbox Environment BEFORE dynamic imports ─────────────────────
const ROOT_DIR = process.cwd();
const REAL_DB_PATH = path.join(ROOT_DIR, "data", "database.json");
const realDbExistsBefore = fs.existsSync(REAL_DB_PATH);
const initialRealDbHash = realDbExistsBefore
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex")
  : null;
const initialRealDbMtime = realDbExistsBefore ? fs.statSync(REAL_DB_PATH).mtimeMs : null;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "room-move-swap-test-"));
const tmpDbPath = path.join(tmpDir, "isolated-db.json");

process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.DATABASE_URL = "";
process.env.DATA_FILE = tmpDbPath;
process.env.ZAPI_INSTANCE_ID = "";
process.env.ZAPI_TOKEN = "";
process.env.ZAPI_CLIENT_TOKEN = "";
process.env.ZOHO_CLIENT_ID = "";
process.env.ZOHO_CLIENT_SECRET = "";
process.env.SMTP_HOST = "";
process.env.RESEND_API_KEY = "";
process.env.SERVER_BASE_URL = "http://127.0.0.1";

// Fix simulated Brasília time to 2026-11-18 15:00:00-03:00 (cutDate = 18/11)
const SIMULATED_NOW_MS = new Date("2026-11-18T15:00:00-03:00").getTime();
const prevSimulatedOffset = globalThis.__simulatedTimeOffsetMs;
globalThis.__simulatedTimeOffsetMs = SIMULATED_NOW_MS - Date.now();

// Intercept any non-localhost external HTTP call so zero WhatsApp/email/external requests ever fire
const originalFetch = globalThis.fetch;
const externalFetchAttempts = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : (input?.url || String(input));
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url)) {
    return originalFetch(input, init);
  }
  externalFetchAttempts.push({ url, method: init?.method || "GET" });
  return new Response(JSON.stringify({ mocked: true, blockedExternalCall: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

// Seed empty isolated JSON before importing demo-server
fs.writeFileSync(
  tmpDbPath,
  JSON.stringify(
    {
      flats: [],
      reservations: [],
      cleaningRequests: [],
      breakfastOrders: [],
      minibarOrders: [],
      minibarInspections: [],
      guests: [],
      users: [{ id: 1, username: "admin", role: "admin", name: "Admin Verifier" }],
      zapiConfig: { enabled: false },
      settings: { hotelName: "CorpFlats Soho", checkinProvider: "proprio" }
    },
    null,
    2
  ),
  "utf8"
);

const roomMoveService = await import("../artifacts/api-server/room-move-service.mjs");
const {
  isRoomMoveGroupMember,
  getRoomMoveGroupReservations,
  getActiveRoomMoveReservation,
  computeRoomMoveConsolidatedSummary,
  previewRoomMoveOrSwap,
  executeRoomMove,
  executeFlatSwap,
  undoLastRoomMove
} = roomMoveService;

const { handleOtaModification } = await import("../artifacts/api-server/wbp/inbox.mjs");
const { injectSessionContext } = await import("../artifacts/api-server/whatsapp-ai-service.mjs");
const serverModule = await import("../artifacts/api-server/demo-server.mjs");
const { app, httpServer, db } = serverModule;

const DEFAULT_PRODUCTS_SNAPSHOT = JSON.parse(JSON.stringify(db.minibarProducts || []));
const DEFAULT_STOCK_SNAPSHOT = JSON.parse(JSON.stringify(db.minibarDefaultStock || {}));

function getBaseFlats() {
  return [
    { id: 18, number: "907", colName: "X 907 casal", floor: 9, status: "ocupado", active: true, isOccupied: true },
    { id: 12, number: "512", colName: "512 casal", floor: 5, status: "clean", active: true, isOccupied: false },
    { id: 13, number: "605", colName: "605 solteiro", floor: 6, status: "clean", active: true, isOccupied: false }
  ];
}

function makeSignedFiveNightRes(overrides = {}) {
  return {
    id: 605,
    code: "RES-907-0605",
    reservationCode: "RES-907-0605",
    flatId: 18,
    flatNumber: "907",
    guestId: 7001,
    guestName: "João Carlos Verifier",
    guestDocument: "12345678909",
    guestPhone: "5522999112233",
    guestEmail: "joao.verifier@example.com",
    checkinDate: "2026-11-15",
    checkoutDate: "2026-11-20",
    status: "in_house",
    channel: "booking",
    externalOrderId: "EXT-907-555",
    channexBookingId: "CHX-907-555",
    wbpBookingId: "WBP-907-555",
    otaReservationCode: "OTA-907-555",
    channexRevisionId: "REV-907-1",
    dailyRate: 200,
    dailyRates: [
      { date: "2026-11-15", rate: 200, channel: "booking" },
      { date: "2026-11-16", rate: 200, channel: "booking" },
      { date: "2026-11-17", rate: 200, channel: "booking" },
      { date: "2026-11-18", rate: 200, channel: "booking" },
      { date: "2026-11-19", rate: 200, channel: "booking" }
    ],
    cleaningFee: 150,
    charges: [
      { id: "chg_pet_605", type: "pet", title: "Taxa Pet", amount: 80 }
    ],
    totalAmount: 1230,
    totalPrice: 1230,
    paidAmount: 1230,
    amountPaid: 1230,
    paymentStatus: "pago_total",
    paymentMethod: "pix",
    paidAt: "2026-11-14T10:00:00.000Z",
    payments: [
      { id: "pay_605_init", amount: 1230, method: "pix", date: "2026-11-14T10:00:00.000Z" }
    ],
    fnhrCompleted: true,
    preCheckinCompleted: true,
    hasPreCheckin: true,
    checkedInAt: "2026-11-15T14:15:00.000Z",
    fnrhSignedAt: "2026-11-15T14:15:00.000Z",
    fnrhDocumentUuid: "fnrh-uuid-907",
    fnrhPdfUrl: "/storage/files/fnrh/fnrh-uuid-907.pdf",
    signatureUrl: "data:image/png;base64,iVBORw0KGgo=",
    guests: [
      {
        index: 1,
        name: "João Carlos Verifier",
        document: "12345678909",
        phone: "5522999112233",
        email: "joao.verifier@example.com",
        hasCompletedCheckin: true,
        status: "CHECKED_IN",
        checkinCompletedAt: "2026-11-15T14:15:00.000Z",
        fnrhDocumentUuid: "fnrh-uuid-907",
        fnrhSignedAt: "2026-11-15T14:15:00.000Z"
      }
    ],
    welcomeKitConsumption: {},
    auditLogs: [],
    ...overrides
  };
}

function createIsolatedUnitDb(seed = {}) {
  return {
    flats: getBaseFlats(),
    reservations: [],
    cleaningRequests: [],
    breakfastOrders: [],
    minibarOrders: [],
    minibarInspections: [],
    minibarProducts: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS_SNAPSHOT)),
    minibarDefaultStock: JSON.parse(JSON.stringify(DEFAULT_STOCK_SNAPSHOT)),
    roomBlocks: [],
    serviceOrders: [],
    invoices: [],
    boletos: [],
    guests: [],
    whatsappHistory: [],
    whatsappQueue: [],
    reservationCommunications: [],
    zapiConfig: { enabled: false },
    settings: { hotelName: "CorpFlats Soho", checkinProvider: "proprio" },
    ...seed
  };
}

function resetServerDb(seed = {}) {
  const base = createIsolatedUnitDb({
    users: [
      { id: 1, username: "admin", role: "admin", name: "Admin Verifier" },
      { id: 2, username: "cris", role: "camareira", name: "Cris Camareira" }
    ],
    minibarSettings: { anservePin: "1234", operationMode: "restocker_daily_launch" },
    ...seed
  });
  for (const key of Object.keys(db)) {
    delete db[key];
  }
  Object.assign(db, base);
}

let BASE_URL = "";

describe("Troca de Flat com Corte e Inversão (907 ⇄ 512)", () => {
  before(async () => {
    if (!httpServer.listening) {
      await new Promise((resolve) => {
        httpServer.once("listening", resolve);
      });
    }
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : Number(process.env.PORT);
    BASE_URL = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((r) => setTimeout(r, 30));
    globalThis.__simulatedTimeOffsetMs = prevSimulatedOffset;
    globalThis.fetch = originalFetch;

    if (httpServer && typeof httpServer.close === "function") {
      await new Promise((resolve) => httpServer.close(() => resolve()));
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    if (realDbExistsBefore) {
      const finalHash = crypto.createHash("sha256").update(fs.readFileSync(REAL_DB_PATH)).digest("hex");
      const finalMtime = fs.statSync(REAL_DB_PATH).mtimeMs;
      assert.strictEqual(finalHash, initialRealDbHash, "Real data/database.json hash must remain unchanged");
      assert.strictEqual(finalMtime, initialRealDbMtime, "Real data/database.json mtime must remain unchanged");
    }
    assert.strictEqual(
      externalFetchAttempts.length,
      0,
      `Zero external HTTP calls allowed during tests, got: ${JSON.stringify(externalFetchAttempts)}`
    );
    setTimeout(() => process.exit(0), 50);
  });

  // ── 1. Mid-stay split (executeRoomMove mode "split") ───────────────────────
  it("1. Mid-stay split (15/11..20/11, corte 18/11 -> Flat 512): rateio estrito, FNRH, OTA IDs, limpeza e café", async () => {
    const unitDb = createIsolatedUnitDb({
      reservations: [makeSignedFiveNightRes()],
      cleaningRequests: [
        {
          id: 901,
          flatId: 18,
          flatNumber: "907",
          requestDate: "2026-11-20",
          source: "checkout",
          status: "dirty",
          leavingGuest: "João Carlos Verifier",
          checkoutReservationId: 605,
          checkoutReservationCode: "RES-907-0605"
        }
      ],
      breakfastOrders: [
        {
          id: "BF-18-DEL",
          reservationId: 605,
          reservationCode: "RES-907-0605",
          flatId: 18,
          flatNumber: "907",
          roomNumber: "907",
          date: "2026-11-18",
          status: "delivered"
        },
        {
          id: "BF-19-PEN",
          reservationId: 605,
          reservationCode: "RES-907-0605",
          flatId: 18,
          flatNumber: "907",
          roomNumber: "907",
          date: "2026-11-19",
          status: "pending"
        }
      ]
    });

    const reSignatureNotifications = [];
    let whatsappTriggered = false;

    const result = await executeRoomMove(
      unitDb,
      {
        reservationId: 605,
        targetFlatId: 12,
        cutDate: "2026-11-18",
        mode: "split",
        generateCutoffCleaning: true,
        reason: "Troca para flat 512 no meio da estadia"
      },
      {
        todayStr: "2026-11-18",
        nowIso: "2026-11-18T15:00:00.000Z",
        onAfterReservationRoomMoved: async (r, ctx) => {
          if (r.needsReSignature) {
            whatsappTriggered = true;
            reSignatureNotifications.push({
              reservationId: r.id,
              code: r.code,
              flatNumber: r.flatNumber,
              action: ctx.action,
              changes: ctx.changes
            });
          }
        }
      }
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.mode, "split");
    assert.strictEqual(unitDb.reservations.length, 2);

    const rPast = result.pastSegment;
    const r = result.reservation;

    // Part 1 (rPast on Flat 907, 15/11..18/11)
    assert.ok(rPast, "rPast historical segment must be created");
    assert.strictEqual(rPast.flatNumber, "907");
    assert.strictEqual(rPast.checkinDate, "2026-11-15");
    assert.strictEqual(rPast.checkoutDate, "2026-11-18");
    assert.strictEqual(rPast.dailyRates.length, 3);
    assert.strictEqual(rPast.totalAmount, 830); // 3 * 200 + 150 + 80
    assert.strictEqual(rPast.paidAmount, 830);
    assert.strictEqual(rPast.paymentStatus, "pago_total");
    assert.strictEqual(rPast.fnhrCompleted, true);
    assert.strictEqual(rPast.fnrhDocumentUuid, "fnrh-uuid-907");
    assert.strictEqual(rPast.guests[0].hasCompletedCheckin, true);
    assert.strictEqual(rPast.isRoomMoveHistoricalSegment, true);
    assert.strictEqual(rPast.isRoomMoveActiveSegment, false);
    assert.strictEqual(rPast.originExternalOrderId, "EXT-907-555");
    assert.strictEqual(rPast.originChannexBookingId, "CHX-907-555");
    assert.strictEqual(rPast.externalOrderId, undefined);
    assert.strictEqual(rPast.channexBookingId, undefined);
    assert.strictEqual(rPast.wbpBookingId, undefined);
    assert.strictEqual(rPast.otaReservationCode, undefined);

    // Part 2 (r on Flat 512, 18/11..20/11)
    assert.strictEqual(r.id, 605, "Active segment must preserve original r.id");
    assert.strictEqual(r.code, "RES-907-0605", "Active segment must preserve original r.code");
    assert.strictEqual(r.flatNumber, "512");
    assert.strictEqual(r.checkinDate, "2026-11-18");
    assert.strictEqual(r.checkoutDate, "2026-11-20");
    assert.strictEqual(r.dailyRates.length, 2);
    assert.strictEqual(r.totalAmount, 400); // 2 * 200 + 0 fees
    assert.strictEqual(r.paidAmount, 400);
    assert.strictEqual(r.cleaningFee, 0);
    assert.strictEqual(r.petFee, 0);
    assert.strictEqual(r.charges.length, 0);
    assert.strictEqual(r.needsReSignature, true);
    assert.strictEqual(r.fnhrCompleted, false);
    assert.strictEqual(r.fnrhDocumentUuid, undefined);
    assert.strictEqual(r.guestName, "João Carlos Verifier");
    assert.strictEqual(r.guestDocument, "12345678909");
    assert.strictEqual(r.guestPhone, "5522999112233");
    assert.strictEqual(whatsappTriggered, true);
    assert.strictEqual(reSignatureNotifications.length, 1);
    assert.strictEqual(reSignatureNotifications[0].flatNumber, "512");

    // Cleaning checks
    const cutoffCard = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-18"
    );
    assert.ok(cutoffCard, "Cutoff cleaning card must be generated on 18/11 in Flat 907");
    assert.strictEqual(cutoffCard.source, "checkout");
    assert.strictEqual(cutoffCard.isRoomMoveCheckout, true);
    assert.strictEqual(cutoffCard.status, "dirty");

    const finalCard512 = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "512" && c.requestDate === "2026-11-20"
    );
    assert.ok(finalCard512, "Final checkout cleaning card must move to Flat 512 on 20/11");
    const orphanCard907 = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-20" && !c.isDeleted
    );
    assert.strictEqual(orphanCard907, undefined, "No active final checkout cleaning card left on 907 for 20/11");

    // Breakfast checks
    const bf18 = unitDb.breakfastOrders.find((b) => b.id === "BF-18-DEL");
    const bf19 = unitDb.breakfastOrders.find((b) => b.id === "BF-19-PEN");
    assert.strictEqual(bf18.roomNumber, "907", "Delivered breakfast on 18/11 must stay on Flat 907");
    assert.strictEqual(bf18.flatNumber, "907");
    assert.strictEqual(bf19.roomNumber, "512", "Future breakfast on 19/11 must move to Flat 512");
    assert.strictEqual(bf19.flatNumber, "512");
  });

  // ── 2. Minibar, Welcome Kit, Consolidation & Checkout Guard ────────────────
  it("2. Minibar, Welcome Kit, Consolidação NFS-e e Checkout Guard (integração demo-server + room-move-service)", async () => {
    resetServerDb({
      reservations: [
        makeSignedFiveNightRes({
          channel: "direct",
          externalOrderId: undefined,
          channexBookingId: undefined,
          wbpBookingId: undefined,
          otaReservationCode: undefined,
          channexRevisionId: undefined
        })
      ],
      cleaningRequests: [
        {
          id: 950,
          flatId: 18,
          flatNumber: "907",
          requestDate: "2026-11-20",
          source: "checkout",
          status: "dirty",
          leavingGuest: "João Carlos Verifier",
          checkoutReservationId: 605,
          checkoutReservationCode: "RES-907-0605"
        }
      ],
      minibarOrders: [
        {
          id: "ORD-1",
          flatNumber: "907",
          reservationId: 605,
          reservationCode: "RES-907-0605",
          guestName: "João Carlos Verifier",
          totalAmount: 20,
          remainingAmount: 20,
          paymentStatus: "pendente",
          paymentMethod: "pendente",
          source: "restocker_launch",
          launchDate: "2026-11-16",
          createdAt: "2026-11-16T11:00:00.000Z",
          items: [
            { productId: "prod_cerveja_long_neck", productName: "Cerveja Long Neck", quantity: 1, unitPrice: 20, totalPrice: 20 }
          ]
        }
      ],
      guests: [
        {
          id: 7001,
          name: "João Carlos Verifier",
          fullName: "João Carlos Verifier",
          documentNumber: "12345678909",
          cpf: "12345678909",
          phone: "5522999112233",
          email: "joao.verifier@example.com",
          address: "Rua Teste, 100",
          city: "Campos dos Goytacazes",
          state: "RJ",
          cep: "28010000"
        }
      ]
    });

    // 2a. Welcome kit inspection in Flat 907 (2 waters + 2 peanuts) BEFORE move
    const insp907Resp = await originalFetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-token": "test-token" },
      body: JSON.stringify({
        flatNumber: "907",
        reservationCode: "RES-907-0605",
        launchDate: "2026-11-16",
        status: "conforme",
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 }
      })
    });
    assert.strictEqual(insp907Resp.status, 200);
    const insp907Json = await insp907Resp.json();
    assert.strictEqual(insp907Json.inspection.welcomeKitConsumption.waterCups, 2);
    assert.strictEqual(insp907Json.inspection.welcomeKitConsumption.mendoratoPeanuts, 2);

    // 2b. Execute split move 907 -> 512 on 18/11 via HTTP
    const moveResp = await originalFetch(`${BASE_URL}/api/pms/reservations/605/room-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetFlatId: 12,
        cutDate: "2026-11-18",
        mode: "split",
        generateCutoffCleaning: true
      })
    });
    assert.strictEqual(moveResp.status, 200);
    const moveJson = await moveResp.json();
    assert.strictEqual(moveJson.success, true);

    const activeRes = db.reservations.find((x) => x.id === 605);
    const pastRes = db.reservations.find((x) => x.isRoomMoveHistoricalSegment);
    assert.ok(activeRes && pastRes);
    assert.strictEqual(activeRes.flatNumber, "512");
    assert.deepStrictEqual(activeRes.welcomeKitConsumption, {});

    // Verify automatic re-signature audit log recorded on active reservation
    const hasReSigAudit = (activeRes.auditLogs || []).some((a) => a.action === "re_signature_requested");
    assert.strictEqual(hasReSigAudit, true, "Re-signature notification dispatch must be logged after FNRH invalidation");

    // 2c. Add minibar order ORD-2 in Flat 512
    db.minibarOrders.push({
      id: "ORD-2",
      flatNumber: "512",
      reservationId: 605,
      reservationCode: "RES-907-0605",
      guestName: "João Carlos Verifier",
      totalAmount: 12,
      remainingAmount: 12,
      paymentStatus: "pendente",
      paymentMethod: "pendente",
      source: "restocker_launch",
      launchDate: "2026-11-18",
      createdAt: "2026-11-18T16:00:00.000Z",
      items: [
        { productId: "prod_refrigerante", productName: "Refrigerante", quantity: 1, unitPrice: 12, totalPrice: 12 }
      ]
    });

    // Verify guest-portal returns BOTH ORD-1 (907) and ORD-2 (512) with flatNumber preserved
    const portalResp = await originalFetch(`${BASE_URL}/api/pms/guest-portal/RES-907-0605`);
    assert.strictEqual(portalResp.status, 200);
    const portalJson = await portalResp.json();
    const portalOrders = portalJson.minibarOrders || [];
    const ord1 = portalOrders.find((o) => o.id === "ORD-1");
    const ord2 = portalOrders.find((o) => o.id === "ORD-2");
    assert.ok(ord1, "ORD-1 from Flat 907 must appear on active reservation");
    assert.ok(ord2, "ORD-2 from Flat 512 must appear on active reservation");
    assert.strictEqual(ord1.flatNumber, "907");
    assert.strictEqual(ord2.flatNumber, "512");
    assert.strictEqual(portalJson.reservation.totalAmount, 1230);
    assert.strictEqual(portalJson.reservation.paidAmount, 1230);

    // 2d. Welcome kit courtesy inspection in Flat 512 (2 waters + 2 peanuts) — zero cross-flat penalty
    const insp512Resp = await originalFetch(`${BASE_URL}/api/minibar/inspections`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-token": "test-token" },
      body: JSON.stringify({
        flatNumber: "512",
        reservationCode: "RES-907-0605",
        launchDate: "2026-11-18",
        status: "conforme",
        welcomeKitConsumption: { waterCups: 2, mendoratoPeanuts: 2 }
      })
    });
    assert.strictEqual(insp512Resp.status, 200);
    const insp512Json = await insp512Resp.json();
    assert.strictEqual(insp512Json.inspection.welcomeKitConsumption.waterCups, 2, "512 must allow 2 independent courtesy waters");
    assert.strictEqual(insp512Json.inspection.welcomeKitConsumption.mendoratoPeanuts, 2, "512 must allow 2 independent courtesy peanuts");

    const ctx512Resp = await originalFetch(`${BASE_URL}/api/minibar/reservation-context/RES-907-0605`);
    assert.strictEqual(ctx512Resp.status, 200);
    const ctx512Json = await ctx512Resp.json();
    assert.strictEqual(ctx512Json.welcomeKitSummary.waterCupsConsumed, 2);
    assert.strictEqual(ctx512Json.welcomeKitSummary.peanutsConsumed, 2);

    // Verify Anserve flats-status flags Flat 907 as isRoomTransferOut
    const flatsStatusResp = await originalFetch(`${BASE_URL}/api/anserve/flats-status`);
    assert.strictEqual(flatsStatusResp.status, 200);
    const flatsStatusJson = await flatsStatusResp.json();
    const flat907Status = (flatsStatusJson.flats || flatsStatusJson).find((f) => String(f.flatNumber || f.number) === "907");
    assert.ok(flat907Status, "Flat 907 entry must exist in /api/anserve/flats-status");
    assert.strictEqual(flat907Status.isRoomTransferOut, true);
    assert.strictEqual(flat907Status.transferredToFlatNumber, "512");
    assert.strictEqual(flat907Status.activeReservationCode, "RES-907-0605");

    // 2e. Consolidated summary & NFS-e pending reservations sum accommodation (1000) + fees (230) = 1230 without double-counting minibar orders
    const consolidated = computeRoomMoveConsolidatedSummary(db, activeRes);
    assert.strictEqual(consolidated.accommodationTotal, 1000);
    assert.strictEqual(consolidated.chargesTotal, 230);
    assert.strictEqual(consolidated.totalAmount, 1230);
    assert.strictEqual(consolidated.paidAmount, 1230);

    const nfsePendingResp = await originalFetch(`${BASE_URL}/api/nfse/pending-reservations`);
    assert.strictEqual(nfsePendingResp.status, 200);
    const nfsePendingJson = await nfsePendingResp.json();
    const pendingList = Array.isArray(nfsePendingJson) ? nfsePendingJson : (nfsePendingJson.reservations || []);
    const groupEntries = pendingList.filter((item) => item.roomMoveGroupId === activeRes.roomMoveGroupId);
    assert.strictEqual(groupEntries.length, 1, "Historical segment must NOT duplicate NFS-e pending list");
    assert.strictEqual(groupEntries[0].totalAmount, 1230);
    assert.strictEqual(groupEntries[0].accommodationAmount, 1230);
    assert.strictEqual(groupEntries[0].consumptionAmount, 32, "Minibar ORD-1 (20) + ORD-2 (12) = 32 without double-counting");

    // 2f. Checkout guard: marking historical rPast as checked out / cleaned must NOT triggerCheckoutWhatsApp
    db.whatsappQueue.push({
      id: "q-active-512",
      reservationId: 605,
      reservationCode: "RES-907-0605",
      flatId: 12,
      flatNumber: "512",
      triggerEvent: "checkout_reminder",
      status: "scheduled"
    });
    const cutoffCard = db.cleaningRequests.find(
      (c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-18" && c.isRoomMoveCheckout
    );
    assert.ok(cutoffCard);

    const cleanResp = await originalFetch(`${BASE_URL}/api/cleaning/assignments/${cutoffCard.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "clean", isVacant: true, markedByAdmin: true })
    });
    assert.strictEqual(cleanResp.status, 200);
    assert.strictEqual(pastRes.checkoutDone, true);
    assert.strictEqual(pastRes.status, "completed");

    const checkoutWaSent = (db.whatsappHistory || []).some(
      (h) => h.triggerEvent === "checkout_completed" || h.triggerEvent === "on_checkout"
    );
    const checkoutWaQueued = (db.whatsappQueue || []).some(
      (q) => q.triggerEvent === "checkout_completed" || q.triggerEvent === "on_checkout" || q.triggerEvent === "post_checkout_review"
    );
    assert.strictEqual(checkoutWaSent, false, "Historical segment checkout must NEVER fire triggerCheckoutWhatsApp");
    assert.strictEqual(checkoutWaQueued, false, "Historical segment checkout must NEVER schedule review/checkout WhatsApp");

    const activeStayQueue = db.whatsappQueue.find((q) => q.id === "q-active-512");
    assert.strictEqual(activeStayQueue.status, "scheduled", "Active destination reservation reminders must remain scheduled");
  });

  // ── 3. Atomic Swap (executeFlatSwap, 907 ⇄ 512) ───────────────────────────
  it("3a. Atomic Swap (907 ⇄ 512): Hóspede A cortado + Hóspede B inteiro, FNRH/WhatsApp ambos, limpeza e café sem contaminação cruzada", async () => {
    const resA = makeSignedFiveNightRes({
      id: 701,
      code: "RES-A-907",
      reservationCode: "RES-A-907",
      flatId: 18,
      flatNumber: "907",
      guestName: "Hóspede A (907)",
      guestPhone: "5522999000101",
      checkinDate: "2026-11-15",
      checkoutDate: "2026-11-20"
    });
    const resB = makeSignedFiveNightRes({
      id: 702,
      code: "RES-B-512",
      reservationCode: "RES-B-512",
      flatId: 12,
      flatNumber: "512",
      guestName: "Hóspede B (512)",
      guestPhone: "5522999000202",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-22",
      status: "confirmada",
      dailyRates: [
        { date: "2026-11-18", rate: 250, channel: "direct" },
        { date: "2026-11-19", rate: 250, channel: "direct" },
        { date: "2026-11-20", rate: 250, channel: "direct" },
        { date: "2026-11-21", rate: 250, channel: "direct" }
      ],
      cleaningFee: 100,
      charges: [],
      totalAmount: 1100,
      totalPrice: 1100,
      paidAmount: 1100,
      amountPaid: 1100
    });

    const unitDb = createIsolatedUnitDb({
      reservations: [resA, resB],
      cleaningRequests: [
        {
          id: 910,
          flatId: 18,
          flatNumber: "907",
          requestDate: "2026-11-20",
          source: "checkout",
          status: "dirty",
          leavingGuest: "Hóspede A (907)",
          checkoutReservationId: 701,
          checkoutReservationCode: "RES-A-907"
        },
        {
          id: 911,
          flatId: 12,
          flatNumber: "512",
          requestDate: "2026-11-22",
          source: "checkout",
          status: "dirty",
          leavingGuest: "Hóspede B (512)",
          checkoutReservationId: 702,
          checkoutReservationCode: "RES-B-512"
        }
      ],
      breakfastOrders: [
        { id: "BF-A-18", reservationId: 701, reservationCode: "RES-A-907", flatId: 18, flatNumber: "907", roomNumber: "907", date: "2026-11-18", status: "delivered" },
        { id: "BF-A-19", reservationId: 701, reservationCode: "RES-A-907", flatId: 18, flatNumber: "907", roomNumber: "907", date: "2026-11-19", status: "pending" },
        { id: "BF-B-19", reservationId: 702, reservationCode: "RES-B-512", flatId: 12, flatNumber: "512", roomNumber: "512", date: "2026-11-19", status: "pending" }
      ]
    });

    const waCallbacks = [];
    const swapRes = await executeFlatSwap(
      unitDb,
      { reservationAId: 701, reservationBId: 702, cutDate: "2026-11-18", mode: "auto" },
      {
        todayStr: "2026-11-18",
        nowIso: "2026-11-18T15:00:00.000Z",
        onAfterReservationRoomMoved: async (r, ctx) => {
          waCallbacks.push({ id: r.id, code: r.code, flatNumber: r.flatNumber, needsReSignature: r.needsReSignature, action: ctx.action });
        }
      }
    );

    assert.strictEqual(swapRes.success, true);

    // Guest A split (907 15..18 + 512 18..20)
    assert.ok(swapRes.pastSegmentA);
    assert.strictEqual(swapRes.pastSegmentA.flatNumber, "907");
    assert.strictEqual(swapRes.pastSegmentA.checkinDate, "2026-11-15");
    assert.strictEqual(swapRes.pastSegmentA.checkoutDate, "2026-11-18");
    assert.strictEqual(swapRes.reservationA.flatNumber, "512");
    assert.strictEqual(swapRes.reservationA.checkinDate, "2026-11-18");
    assert.strictEqual(swapRes.reservationA.checkoutDate, "2026-11-20");
    assert.strictEqual(swapRes.reservationA.needsReSignature, true);
    assert.strictEqual(swapRes.reservationA.fnhrCompleted, false);

    // Guest B moved whole (907 18..22)
    assert.strictEqual(swapRes.pastSegmentB, null);
    assert.strictEqual(swapRes.reservationB.flatNumber, "907");
    assert.strictEqual(swapRes.reservationB.checkinDate, "2026-11-18");
    assert.strictEqual(swapRes.reservationB.checkoutDate, "2026-11-22");
    assert.strictEqual(swapRes.reservationB.needsReSignature, true);
    assert.strictEqual(swapRes.reservationB.fnhrCompleted, false);

    // WhatsApp callback triggered for BOTH
    assert.strictEqual(waCallbacks.length, 2);
    assert.ok(waCallbacks.some((c) => c.id === 701 && c.flatNumber === "512" && c.needsReSignature));
    assert.ok(waCallbacks.some((c) => c.id === 702 && c.flatNumber === "907" && c.needsReSignature));

    // Cleaning cards synced cleanly without overwriting each other
    const cutoff907 = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-18" && c.isRoomMoveCheckout
    );
    assert.ok(cutoff907);
    assert.strictEqual(cutoff907.leavingGuest, "Hóspede A (907)");
    assert.strictEqual(cutoff907.arrivingGuest, "Hóspede B (512)");

    const checkoutCardA512 = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "512" && c.requestDate === "2026-11-20" && Number(c.checkoutReservationId) === 701
    );
    const checkoutCardB907 = unitDb.cleaningRequests.find(
      (c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-22" && Number(c.checkoutReservationId) === 702
    );
    assert.ok(checkoutCardA512, "Guest A final checkout card must move to Flat 512 on 20/11");
    assert.ok(checkoutCardB907, "Guest B final checkout card must move to Flat 907 on 22/11");

    // Breakfast synced strictly per reservation without cross-contamination
    assert.strictEqual(unitDb.breakfastOrders.find((b) => b.id === "BF-A-18").roomNumber, "907");
    assert.strictEqual(unitDb.breakfastOrders.find((b) => b.id === "BF-A-19").roomNumber, "512");
    assert.strictEqual(unitDb.breakfastOrders.find((b) => b.id === "BF-B-19").roomNumber, "907");
  });

  it("3b. Atomic Swap rejects 409 when 3rd reservation occupies Flat 907 on 21/11, leaving BOTH A and B 100% untouched", async () => {
    const resA = makeSignedFiveNightRes({
      id: 711,
      code: "RES-A-LOCK",
      flatId: 18,
      flatNumber: "907",
      guestName: "Hóspede A",
      checkinDate: "2026-11-15",
      checkoutDate: "2026-11-20"
    });
    const resB = makeSignedFiveNightRes({
      id: 712,
      code: "RES-B-LOCK",
      flatId: 12,
      flatNumber: "512",
      guestName: "Hóspede B",
      checkinDate: "2026-11-18",
      checkoutDate: "2026-11-22"
    });
    const resC = makeSignedFiveNightRes({
      id: 713,
      code: "RES-C-CONFLICT",
      flatId: 18,
      flatNumber: "907",
      guestName: "Hóspede C (Conflito 21/11)",
      checkinDate: "2026-11-21",
      checkoutDate: "2026-11-23",
      status: "confirmada"
    });

    const unitDb = createIsolatedUnitDb({
      reservations: [resA, resB, resC]
    });
    const snapshotBefore = JSON.stringify(unitDb);

    await assert.rejects(
      async () => {
        await executeFlatSwap(unitDb, {
          reservationAId: 711,
          reservationBId: 712,
          cutDate: "2026-11-18"
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 409);
        assert.ok(Array.isArray(err.conflicts) && err.conflicts.length > 0);
        return true;
      }
    );

    assert.strictEqual(JSON.stringify(unitDb), snapshotBefore, "Failed swap must leave entire database 100% untouched");
  });

  it("3c. Flat Lock Guard (isFlatLocked: true): rejeita 409 requiresFlatLockConfirmation sem override e conclui com override=true", async () => {
    resetServerDb({
      reservations: [
        makeSignedFiveNightRes({
          id: 721,
          code: "RES-LOCK-A",
          flatId: 18,
          flatNumber: "907",
          isFlatLocked: true,
          flatLockReason: "Preferência do hóspede",
          checkinDate: "2026-11-15",
          checkoutDate: "2026-11-20"
        }),
        makeSignedFiveNightRes({
          id: 722,
          code: "RES-LOCK-B",
          flatId: 12,
          flatNumber: "512",
          checkinDate: "2026-11-18",
          checkoutDate: "2026-11-22",
          status: "confirmada"
        })
      ]
    });

    // 1. Unit check without override
    await assert.rejects(
      async () => {
        await executeFlatSwap(db, {
          reservationAId: 721,
          reservationBId: 722,
          cutDate: "2026-11-18",
          confirmFlatLockOverride: false
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.requiresFlatLockConfirmation, true);
        return true;
      }
    );

    // 2. HTTP check on /swap-flats without override -> 409 + requiresFlatLockConfirmation: true
    const blockedSwapResp = await originalFetch(`${BASE_URL}/api/pms/reservations/swap-flats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationAId: 721,
        reservationBId: 722,
        cutDate: "2026-11-18",
        confirmFlatLockOverride: false
      })
    });
    assert.strictEqual(blockedSwapResp.status, 409);
    const blockedSwapJson = await blockedSwapResp.json();
    assert.strictEqual(blockedSwapJson.requiresFlatLockConfirmation, true);

    // 3. HTTP check on /room-move without override -> 409 + requiresFlatLockConfirmation: true
    const blockedMoveResp = await originalFetch(`${BASE_URL}/api/pms/reservations/721/room-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetFlatId: 13,
        cutDate: "2026-11-18",
        mode: "split",
        confirmFlatLockOverride: false
      })
    });
    assert.strictEqual(blockedMoveResp.status, 409);
    const blockedMoveJson = await blockedMoveResp.json();
    assert.strictEqual(blockedMoveJson.requiresFlatLockConfirmation, true);

    // 4. HTTP check on /swap-flats WITH confirmFlatLockOverride: true -> 200 OK
    const okSwapResp = await originalFetch(`${BASE_URL}/api/pms/reservations/swap-flats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationAId: 721,
        reservationBId: 722,
        cutDate: "2026-11-18",
        confirmFlatLockOverride: true
      })
    });
    assert.strictEqual(okSwapResp.status, 200);
    const okSwapJson = await okSwapResp.json();
    assert.strictEqual(okSwapJson.success, true);
    assert.strictEqual(okSwapJson.reservationA.flatNumber, "512");
    assert.strictEqual(okSwapJson.reservationB.flatNumber, "907");
  });

  // ── 4. Undo (undoLastRoomMove) ─────────────────────────────────────────────
  it("4. Undo (undoLastRoomMove): reunifica Parte 1 + Parte 2 no Flat 907 (15..20), restaura R$ 1230, taxas, FNRH e remove rPast", async () => {
    const unitDb = createIsolatedUnitDb({
      reservations: [makeSignedFiveNightRes()],
      cleaningRequests: [
        {
          id: 920,
          flatId: 18,
          flatNumber: "907",
          requestDate: "2026-11-20",
          source: "checkout",
          status: "dirty",
          leavingGuest: "João Carlos Verifier",
          checkoutReservationId: 605,
          checkoutReservationCode: "RES-907-0605"
        }
      ],
      breakfastOrders: [
        { id: "BF-UNDO-19", reservationId: 605, reservationCode: "RES-907-0605", flatId: 18, flatNumber: "907", roomNumber: "907", date: "2026-11-19", status: "pending" }
      ]
    });

    await executeRoomMove(
      unitDb,
      {
        reservationId: 605,
        targetFlatId: 12,
        cutDate: "2026-11-18",
        mode: "split",
        upgradeAdjustmentAmount: 100,
        generateCutoffCleaning: true
      },
      { todayStr: "2026-11-18", nowIso: "2026-11-18T15:00:00.000Z" }
    );
    assert.strictEqual(unitDb.reservations.length, 2);

    const undoResult = undoLastRoomMove(
      unitDb,
      { reservationId: 605 },
      { todayStr: "2026-11-18", nowIso: "2026-11-18T15:05:00.000Z" }
    );
    assert.strictEqual(undoResult.success, true);
    assert.strictEqual(undoResult.restoredFlatNumber, "907");
    assert.strictEqual(unitDb.reservations.length, 1, "rPast must be removed from db.reservations");

    const restored = unitDb.reservations[0];
    assert.strictEqual(restored.id, 605);
    assert.strictEqual(restored.flatNumber, "907");
    assert.strictEqual(restored.checkinDate, "2026-11-15");
    assert.strictEqual(restored.checkoutDate, "2026-11-20");
    assert.strictEqual(restored.dailyRates.length, 5);
    assert.strictEqual(restored.cleaningFee, 150);
    assert.strictEqual(restored.totalAmount, 1230);
    assert.strictEqual(restored.paidAmount, 1230);
    assert.strictEqual(restored.paymentStatus, "pago_total");
    assert.strictEqual(restored.charges.some((c) => String(c.id || "").startsWith("chg_upgrade_")), false);
    assert.strictEqual(restored.fnhrCompleted, true);
    assert.strictEqual(restored.fnrhDocumentUuid, "fnrh-uuid-907");
    assert.strictEqual(restored.needsReSignature, false);
    assert.strictEqual(restored.roomMoveGroupId, undefined);
    assert.strictEqual(isRoomMoveGroupMember(restored), false);

    // Cutoff dirty cleaning on 18/11 removed, checkout cleaning on 20/11 & breakfast on 19/11 back in 907
    assert.strictEqual(
      unitDb.cleaningRequests.some((c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-18" && c.isRoomMoveCheckout),
      false
    );
    assert.ok(
      unitDb.cleaningRequests.find((c) => String(c.flatNumber) === "907" && c.requestDate === "2026-11-20")
    );
    assert.strictEqual(unitDb.breakfastOrders.find((b) => b.id === "BF-UNDO-19").roomNumber, "907");
  });

  // ── 5. OTA Modification & Context Injector ─────────────────────────────────
  it("5a. handleOtaModification: não classifica rPast + r como isMultiRoomMod e preserva cutDate", async () => {
    const unitDb = createIsolatedUnitDb({
      reservations: [makeSignedFiveNightRes()]
    });

    await executeRoomMove(
      unitDb,
      {
        reservationId: 605,
        targetFlatId: 12,
        cutDate: "2026-11-18",
        mode: "split"
      },
      { todayStr: "2026-11-18", nowIso: "2026-11-18T15:00:00.000Z" }
    );

    const modResult = handleOtaModification({
      db: unitDb,
      normalized: {
        externalOrderId: "EXT-907-555",
        channexBookingId: "CHX-907-555",
        wbpBookingId: "WBP-907-555",
        channel: "booking",
        guestName: "João Carlos Verifier",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-22",
        nights: 7,
        totalPrice: 1400, // 7 * 200 total OTA price -> minus 600 (Part 1 accom) = 800 on Part 2
        adults: 1,
        children: 0,
        includeBreakfast: false
      }
    });

    assert.strictEqual(modResult.success, true);
    assert.strictEqual(modResult.modifiedRoomsCount, undefined, "Must NOT be misclassified as multi-room modification");
    const active = unitDb.reservations.find((r) => r.id === 605);
    assert.strictEqual(active.flatNumber, "512");
    assert.strictEqual(active.checkinDate, "2026-11-18", "Must preserve cutDate 18/11 on active segment");
    assert.strictEqual(active.checkoutDate, "2026-11-22");
    assert.strictEqual(active.originalStayCheckinDate, "2026-11-15");
    assert.strictEqual(active.totalAmount, 800);
  });

  it("5b. injectSessionContext: retorna Flat ativo 512 (não 907 histórico) e totais consolidados", async () => {
    const unitDb = createIsolatedUnitDb({
      reservations: [makeSignedFiveNightRes()]
    });

    const splitRes = await executeRoomMove(
      unitDb,
      {
        reservationId: 605,
        targetFlatId: 12,
        cutDate: "2026-11-18",
        mode: "split"
      },
      { todayStr: "2026-11-18", nowIso: "2026-11-18T15:00:00.000Z" }
    );

    // Put historical rPast BEFORE active r to strictly test historical filtering
    unitDb.reservations = [splitRes.pastSegment, splitRes.reservation];

    const ctx = injectSessionContext({
      db: unitDb,
      phone: "5522999112233",
      now: new Date("2026-11-18T15:00:00-03:00")
    });

    assert.strictEqual(ctx.estado_atual, "IN_STAY_CONCIERGE");
    assert.ok(ctx.reserva_ativa, "reserva_ativa must be populated");
    assert.strictEqual(ctx.reserva_ativa.nome_imovel, "Flat 512", "Must select active Flat 512 rather than historical Flat 907");
    assert.strictEqual(ctx.reserva_ativa.valor_total, 1230, "Must expose consolidated group total (1230)");
    assert.strictEqual(ctx.reserva_ativa.valor_pago, 1230, "Must expose consolidated paid amount (1230)");
    assert.strictEqual(ctx.reserva_ativa.saldo_pendente, 0);
    assert.strictEqual(ctx.reserva_ativa.status_pagamento, "PAGO_INTEGRALMENTE");
  });
});
