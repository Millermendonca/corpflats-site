/**
 * tests/wbp-integration/channex-integration.test.mjs
 *
 * Targeted End-to-End & Certification Test Suite for Channex.io REST API v1 Integration.
 * Runs in 100% isolated temporary storage in os.tmpdir() without touching production data.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

// Strict isolation in os.tmpdir() BEFORE importing any PMS modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "channex-e2e-test-"));
process.env.NODE_ENV = "test";
process.env.DATA_FILE = path.join(tmpDir, "test-database.json");
process.env.AUDIT_LOG_FILE = path.join(tmpDir, "test-audit.jsonl");
process.env.WBP_STORAGE_DIR = path.join(tmpDir, "wbp-storage");
process.env.WBP_RAW_STORAGE_FILE = path.join(tmpDir, "wbp_raw_payloads.jsonl");
process.env.WBP_IDEMPOTENCY_FILE = path.join(tmpDir, "wbp_idempotency.json");
process.env.WBP_CARD_VAULT_KEY = crypto.randomBytes(32).toString("hex");
delete process.env.DATABASE_URL;

import { ChannexSimulator } from "../../e2e/channex-simulator/index.mjs";
import {
  WBP_MODES,
  setIntegrationMode,
  getChannexConfig,
  updateChannexConfig
} from "../../artifacts/api-server/wbp/config.mjs";
import { ChannexClient, ChannexApiError } from "../../artifacts/api-server/wbp/client.mjs";
import {
  WbpAriSynchronizer,
  buildChannexAvailabilityValues,
  buildChannexRestrictionsValues,
  getWbpRestrictionsState
} from "../../artifacts/api-server/wbp/ari-sync.mjs";
import {
  processIncomingOTA,
  normalizeChannexBookingRevision
} from "../../artifacts/api-server/wbp/inbox.mjs";
import {
  verifyChannexHmacSignature,
  WbpBackgroundWorker,
  createWbpCallbackRouter
} from "../../artifacts/api-server/wbp/callbacks.mjs";
import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { getCardVault } from "../../artifacts/api-server/wbp/vault.mjs";
import { CORPFLATS_19_FLATS } from "../../artifacts/api-server/wbp/availability.mjs";

describe("Channex.io REST API v1 Integration & 14 Certification Tests", () => {
  let simulator;
  let simBaseUrl;
  let simOrigin;
  let db;
  let storage;
  let channexClient;
  let ariSync;
  let worker;

  const API_KEY = "chx_test_corpflats_key_2026";
  const WEBHOOK_SECRET = "chx_hmac_secret_corpflats_2026";

  before(async () => {
    simulator = new ChannexSimulator({
      apiKey: API_KEY,
      webhookSecret: WEBHOOK_SECRET,
      availabilityLimitPerMin: 10,
      restrictionsLimitPerMin: 10
    });
    const started = await simulator.start(0);
    simBaseUrl = started.baseUrl;
    simOrigin = `http://127.0.0.1:${started.port}`;

    process.env.CHANNEX_BASE_URL = simBaseUrl;
    process.env.CHANNEX_APP_ORIGIN = simOrigin;
    process.env.CHANNEX_API_KEY = API_KEY;
    process.env.CHANNEX_WEBHOOK_SECRET = WEBHOOK_SECRET;

    db = {
      flats: JSON.parse(JSON.stringify(CORPFLATS_19_FLATS)),
      reservations: [],
      roomBlocks: [],
      serviceOrders: [],
      cleaningRequests: [],
      serproQueue: [],
      wbpQuarantine: [],
      wbpInbox: [],
      channexTaskLogs: [],
      settings: {
        wbp_integration_mode: "off",
        receptionEmail: "soho@promenade.com.br"
      }
    };

    storage = new WbpStorage({
      storageFilePath: path.join(tmpDir, "wbp_raw_payloads.jsonl"),
      idempotencyFilePath: path.join(tmpDir, "wbp_idempotency.json")
    });
    channexClient = new ChannexClient({
      db,
      baseUrl: simBaseUrl,
      appOrigin: simOrigin,
      apiKey: API_KEY,
      rateLimitPauseMs: 50,
      backoffBaseMs: 20
    });
    ariSync = new WbpAriSynchronizer({
      db,
      channexClient,
      debounceMs: 50,
      maxWaitMs: 150
    });
    worker = new WbpBackgroundWorker({
      db,
      storage,
      channexClient
    });
  });

  after(async () => {
    if (worker) worker.stop();
    if (simulator) await simulator.stop();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("1. Master Switch OFF Guard: blocks all outbound Channex API calls when mode is 'off'", async () => {
    setIntegrationMode(WBP_MODES.OFF, db);
    const beforeCalls = simulator.requestLog.length;

    await assert.rejects(
      async () => {
        await channexClient.listProperties();
      },
      (err) => err instanceof ChannexApiError && err.code === "integration_disabled"
    );

    const syncRes = await ariSync.performChannexFullSync();
    assert.equal(syncRes.skipped, true);
    assert.equal(syncRes.reason, "integration_off");
    assert.equal(simulator.requestLog.length, beforeCalls, "Zero requests should hit Channex when mode is OFF");
  });

  test("2. 1-Click Auto-Setup: creates Property, Room Type 'Flat' (19 units) and Rate Plans ('Sem Café' & 'Com Café')", async () => {
    setIntegrationMode(WBP_MODES.AUTO, db);

    const setup = await channexClient.autoSetupCorpFlats();
    assert.ok(setup.propertyId, "Property UUID created");
    assert.ok(setup.roomTypeId, "Room Type UUID created");
    assert.ok(setup.ratePlanSemCafeId, "Sem Café Rate Plan UUID created");
    assert.ok(setup.ratePlanComCafeId, "Com Café Rate Plan UUID created");

    const cfg = getChannexConfig(db);
    assert.equal(cfg.propertyId, setup.propertyId);
    assert.equal(cfg.roomTypeId, setup.roomTypeId);
    assert.equal(cfg.ratePlanSemCafeId, setup.ratePlanSemCafeId);
    assert.equal(cfg.ratePlanComCafeId, setup.ratePlanComCafeId);

    const roomOpt = await channexClient.getRoomTypeOptions(setup.propertyId);
    assert.equal(roomOpt.data.length, 1);
    assert.equal(roomOpt.data[0].attributes.count_of_rooms, 19);
    assert.equal(roomOpt.data[0].attributes.title, "Flat");
  });

  test("3. Certification Test #1: Full 500-Day Data Update in strictly 2 API calls with zero null warnings", async () => {
    simulator.requestLog = [];

    const fullSync = await ariSync.performChannexFullSync({
      startDate: "2026-06-01",
      days: 500
    });

    assert.equal(fullSync.success, true);
    assert.equal(fullSync.apiCallsCount, 2, "Must execute in strictly 2 API calls");
    assert.equal(fullSync.availabilityTaskIds.length, 1, "Must return 1 availability task ID");
    assert.equal(fullSync.restrictionsTaskIds.length, 1, "Must return 1 restrictions task ID");
    assert.equal(fullSync.warnings.length, 0, "Zero null-field warnings allowed on /restrictions");

    const postAvailCalls = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/availability");
    const postRestCalls = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/restrictions");
    assert.equal(postAvailCalls.length, 1);
    assert.equal(postRestCalls.length, 1);
    assert.equal(db.channexTaskLogs.length >= 2, true, "Task IDs logged in db.channexTaskLogs");
  });

  test("4. Certification Tests #2, #3, #4, #5, #6, #7: Single & Multi-Date Availability, Rates, Min Stay & Stop Sell Updates", async () => {
    // Block 2 flats on nights 2026-07-10..2026-07-12 (endDate exclusive = 2026-07-13) -> availability drops from 19 to 17
    db.roomBlocks.push(
      { id: "blk-1", flatNumber: "113", startDate: "2026-07-10", endDate: "2026-07-13" },
      { id: "blk-2", flatNumber: "114", startDate: "2026-07-10", endDate: "2026-07-13" }
    );

    // Set stop_sell and min_los = 3 on 2026-07-11
    const rState = getWbpRestrictionsState(db);
    rState.overrides["2026-07-11"] = {
      min_los: 3,
      max_los: 15,
      close: true,
      closearr: true,
      closedep: false
    };

    const availValues = buildChannexAvailabilityValues("2026-07-10", "2026-07-12", db);
    assert.equal(availValues.length, 1, "Contiguous dates with identical 17 availability compressed into 1 range");
    assert.equal(availValues[0].availability, 17);
    assert.equal(availValues[0].date_from, "2026-07-10");
    assert.equal(availValues[0].date_to, "2026-07-12");

    const restValues = buildChannexRestrictionsValues("2026-07-10", "2026-07-12", db);
    const stopSellBlock = restValues.find((v) => v.date_from === "2026-07-11" && v.date_to === "2026-07-11");
    assert.ok(stopSellBlock, "2026-07-11 restriction block present");
    assert.equal(stopSellBlock.stop_sell, true);
    assert.equal(stopSellBlock.closed_to_arrival, true);
    assert.equal(stopSellBlock.min_stay_arrival, 3);
    assert.equal(Array.isArray(stopSellBlock.rates), true);
    assert.equal(stopSellBlock.rates.length, 3, "Occupancy 1, 2, 3 rates present");

    // Verify zero null values anywhere in restValues
    for (const item of restValues) {
      for (const [k, val] of Object.entries(item)) {
        assert.notEqual(val, null, `Field ${k} must never be null`);
        assert.notEqual(val, undefined, `Field ${k} must never be undefined`);
      }
    }

    const deltaRes = await ariSync.performChannexDeltaSync("2026-07-10", "2026-07-12");
    assert.equal(deltaRes.success, true);
    assert.equal(deltaRes.availabilityTaskIds.length, 1);
    assert.equal(deltaRes.restrictionsTaskIds.length, 1);

    db.roomBlocks = [];
    delete rState.overrides["2026-07-11"];
  });

  test("5. Certification Test #8: Receive New Booking via Feed, Virtual Card metadata, PCI Vault, PIX suppression & ACK", async () => {
    const seeded = simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-8001001",
      ota_name: "BookingCom",
      status: "new",
      arrival_date: "2026-08-01",
      departure_date: "2026-08-04",
      amount: "840.00",
      payment_collect: "ota",
      customer: {
        name: "Roberto",
        surname: "Almeida",
        mail: "roberto@example.com",
        phone: "+5522998887766",
        country: "BR"
      },
      guarantee: {
        card_number: "4532111122228899",
        card_type: "VI",
        cardholder_name: "ROBERTO ALMEIDA",
        expiration_date: "10/2028",
        cvv: "999",
        is_virtual: true,
        meta: {
          virtual_card_currency_code: "BRL",
          virtual_card_current_balance: "840.00",
          virtual_card_decimal_places: "2",
          virtual_card_effective_date: "2026-08-01",
          virtual_card_expiration_date: "2026-09-01"
        }
      },
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanComCafeId,
          checkin_date: "2026-08-01",
          checkout_date: "2026-08-04",
          amount: "840.00",
          occupancy: { adults: 2, children: 0, infants: 0 },
          days: {
            "2026-08-01": "280.00",
            "2026-08-02": "280.00",
            "2026-08-03": "280.00"
          }
        }
      ]
    });

    const pollRes = await worker.pollChannexFeed();
    assert.equal(pollRes.success, true);
    assert.equal(pollRes.processedCount, 1);
    assert.equal(pollRes.processedRevisions[0].acknowledged, true);

    // Feed must now be empty because revision was ACKed
    const feedAfter = await channexClient.getBookingRevisionsFeed();
    assert.equal(feedAfter.data.length, 0, "Revision must leave feed after POST /booking_revisions/:id/ack");

    // Verify reservation created in db.reservations
    const created = db.reservations.find((r) => r.externalOrderId === "BDC-8001001");
    assert.ok(created, "Reservation created in PMS");
    assert.equal(created.checkinDate, "2026-08-01");
    assert.equal(created.checkoutDate, "2026-08-04");
    assert.equal(created.breakfastIncluded, true);
    assert.equal(created.ratePlanId, "com_cafe");
    assert.equal(created.paymentStatus, "pago_total");
    assert.equal(created.pixTxId, null, "PIX TxId must be strictly null for OTA bookings");
    assert.equal(created.pixCopiaECola, null, "PIX CopiaECola must be strictly null for OTA bookings");
    assert.equal(created.isVirtualCard, true);
    assert.equal(created.virtualCardMeta?.virtual_card_current_balance, "840.00");
    assert.equal(created.cardLast4, "8899");

    // Verify card stored in encrypted vault without CVV
    const vault = getCardVault();
    const decrypted = vault.decryptCardByIdentifier(created.id, db);
    assert.ok(decrypted, "Card retrievable from AES-256-GCM vault");
    assert.equal(decrypted.cardNumber, "4532111122228899");
    assert.equal(decrypted.cvv, undefined, "CVV must never be stored");
  });

  test("6. Certification Test #9: Multi-Room Booking allocates 2 distinct flats via Fair-Share", async () => {
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-MULTI-2002",
      ota_name: "BookingCom",
      status: "new",
      arrival_date: "2026-08-10",
      departure_date: "2026-08-12",
      amount: "1120.00",
      payment_collect: "property",
      customer: {
        name: "Luciana",
        surname: "Costa",
        mail: "luciana@example.com",
        phone: "+5522997776655"
      },
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanSemCafeId,
          checkin_date: "2026-08-10",
          checkout_date: "2026-08-12",
          amount: "560.00",
          occupancy: { adults: 2, children: 0, infants: 0 }
        },
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanSemCafeId,
          checkin_date: "2026-08-10",
          checkout_date: "2026-08-12",
          amount: "560.00",
          occupancy: { adults: 2, children: 0, infants: 0 }
        }
      ]
    });

    const pollRes = await worker.pollChannexFeed();
    assert.equal(pollRes.processedCount, 1);

    const multiRes = db.reservations.filter((r) => r.parentExternalOrderId === "BDC-MULTI-2002");
    assert.equal(multiRes.length, 2, "Must create 2 distinct PMS reservations for 2 rooms");
    assert.notEqual(multiRes[0].flatNumber, multiRes[1].flatNumber, "Must allocate 2 different physical flats");
    assert.equal(multiRes[0].paymentStatus, "pendente", "Property collect sets status to pendente");
    assert.equal(multiRes[0].collectAtCheckin, true);
  });

  test("7. Certification Test #10: Booking with Unmapped Room or Rate routes to Quarantine", async () => {
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-UNMAPPED-3003",
      ota_name: "BookingCom",
      status: "new",
      arrival_date: "2026-09-01",
      departure_date: "2026-09-03",
      amount: "500.00",
      rooms: [
        {
          room_type_id: null,
          rate_plan_id: null,
          checkin_date: "2026-09-01",
          checkout_date: "2026-09-03",
          amount: "500.00",
          occupancy: { adults: 2, children: 0 }
        }
      ]
    });

    const pollRes = await worker.pollChannexFeed();
    assert.equal(pollRes.processedCount, 1);

    const qItem = db.wbpQuarantine.find((q) => q.externalOrderId === "BDC-UNMAPPED-3003");
    assert.ok(qItem, "Unmapped room/rate booking routed to Quarantine");
    assert.equal(qItem.reason, "UNMAPPED_ROOM_OR_RATE");
  });

  test("8. Certification Tests #11 & #12: Booking Modification & Cancellation (with In-House Check-in Guard)", async () => {
    // 11: Modify BDC-8001001 from 2026-08-01..04 to 2026-08-02..05
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-8001001",
      ota_name: "BookingCom",
      status: "modified",
      arrival_date: "2026-08-02",
      departure_date: "2026-08-05",
      amount: "900.00",
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanComCafeId,
          checkin_date: "2026-08-02",
          checkout_date: "2026-08-05",
          amount: "900.00",
          occupancy: { adults: 2, children: 0 }
        }
      ]
    });

    await worker.pollChannexFeed();
    const modRes = db.reservations.find((r) => r.externalOrderId === "BDC-8001001");
    assert.equal(modRes.checkinDate, "2026-08-02");
    assert.equal(modRes.checkoutDate, "2026-08-05");
    assert.equal(modRes.totalAmount, 900);
    assert.ok(modRes.modificationHistory?.length >= 1, "Before/After modification history recorded");

    // 12a: Mark guest as checked-in and attempt cancellation -> must be blocked into Quarantine
    modRes.status = "hospedado";
    modRes.checkedIn = true;

    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-8001001",
      ota_name: "BookingCom",
      status: "cancelled",
      arrival_date: "2026-08-02",
      departure_date: "2026-08-05",
      amount: "900.00"
    });

    await worker.pollChannexFeed();
    assert.equal(modRes.status, "hospedado", "In-house reservation must NOT be auto-cancelled");
    const blockedQuar = db.wbpQuarantine.find(
      (q) => q.externalOrderId === "BDC-8001001" && q.reason === "CHECKED_IN_CANCELLATION"
    );
    assert.ok(blockedQuar, "Checked-in cancellation routed to quarantine");

    // 12b: Normal cancellation on non-checked-in reservation (BDC-MULTI-2002)
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "BDC-MULTI-2002",
      ota_name: "BookingCom",
      status: "cancelled",
      arrival_date: "2026-08-10",
      departure_date: "2026-08-12",
      amount: "1120.00"
    });

    await worker.pollChannexFeed();
    const cancelledMulti = db.reservations.filter((r) => r.parentExternalOrderId === "BDC-MULTI-2002");
    assert.equal(cancelledMulti.every((r) => r.status === "cancelada"), true);
  });

  test("9. Webhook HMAC-SHA256 Verification & White-Label Headless IFrame Token", async () => {
    const rawBody = JSON.stringify({ event: "booking", property_id: channexClient.propertyId });
    const ts = Math.floor(Date.now() / 1000);
    const validSig = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`${ts}.${rawBody}`)
      .digest("hex");

    // Single valid signature
    const check1 = verifyChannexHmacSignature(rawBody, ts, validSig, WEBHOOK_SECRET);
    assert.equal(check1.valid, true);

    // Dual comma-separated signatures during key rotation
    const check2 = verifyChannexHmacSignature(
      rawBody,
      ts,
      `deadbeef0000,${validSig}`,
      WEBHOOK_SECRET
    );
    assert.equal(check2.valid, true);

    // Tampered body rejection
    const check3 = verifyChannexHmacSignature(rawBody + "tamper", ts, validSig, WEBHOOK_SECRET);
    assert.equal(check3.valid, false);
    assert.equal(check3.reason, "signature_mismatch");

    // Expired timestamp skew rejection
    const check4 = verifyChannexHmacSignature(rawBody, ts - 600, validSig, WEBHOOK_SECRET, 300);
    assert.equal(check4.valid, false);
    assert.equal(check4.reason, "timestamp_skew_exceeded");

    // White-Label Headless IFrame Token
    const tokenRes = await channexClient.createOneTimeToken({
      propertyId: channexClient.propertyId,
      username: "Miller CorpFlats"
    });
    assert.ok(tokenRes.token);
    assert.ok(tokenRes.iframeUrl.includes("app_mode=headless"));
    assert.ok(tokenRes.iframeUrl.includes("redirect_to=%2Fchannels"));
    assert.ok(tokenRes.iframeUrl.includes("lng=pt"));
  });

  test("10. Certification Tests #13 & #14: Rate Limit (10 req/min per endpoint) & HTTP 429 Automatic Recovery", async () => {
    // Reset timestamps and test local 10 req/min guard
    ariSync.availabilityCallTimestamps = [];
    for (let i = 0; i < 10; i++) {
      ariSync.availabilityCallTimestamps.push(Date.now());
    }
    const blockedByLocalLimiter = await ariSync.performChannexDeltaSync("2026-10-01", "2026-10-02", {
      includeAvailability: true,
      includeRestrictions: false
    });
    assert.equal(blockedByLocalLimiter.rateLimited, true);
    assert.equal(blockedByLocalLimiter.endpoint, "availability");

    // Clear local timestamps and verify ChannexClient automatic retry when server returns HTTP 429 once
    ariSync.availabilityCallTimestamps = [];
    simulator.availabilityLimitPerMin = 1;
    simulator.rateLimitBuckets.availability.clear();

    // Pre-populate the 1-req bucket with a timestamp expiring in 30ms so the first call gets HTTP 429 and retry succeeds after 50ms
    const now = Date.now();
    simulator.rateLimitBuckets.availability.set(channexClient.propertyId, [now - 59_970]);
    const recovered = await channexClient.updateAvailability([
      {
        property_id: channexClient.propertyId,
        room_type_id: channexClient.roomTypeId,
        date_from: "2026-10-05",
        date_to: "2026-10-06",
        availability: 19
      }
    ]);
    assert.equal(recovered.taskIds.length, 1, "Client automatically waited and succeeded after HTTP 429");
    simulator.availabilityLimitPerMin = 10;
  });
});
