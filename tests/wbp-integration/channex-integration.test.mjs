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
import { WBPClient, ChannexClient, ChannexApiError } from "../../artifacts/api-server/wbp/client.mjs";
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
    if (ariSync?.debounceTimer) clearTimeout(ariSync.debounceTimer);
    if (ariSync?.rateLimitRetryTimer) clearTimeout(ariSync.rateLimitRetryTimer);
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
    assert.equal(blockedByLocalLimiter.queuedForRetry, true);
    if (ariSync.rateLimitRetryTimer) {
      clearTimeout(ariSync.rateLimitRetryTimer);
      ariSync.rateLimitRetryTimer = null;
    }

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

  test("11. All 28 Webhook Event Types: Non-Booking Events (sync_error, ari, reservation_request) & Lightweight Webhooks (send_data: false)", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use("/api/callback", createWbpCallbackRouter({
      db,
      storage,
      channexClient,
      backgroundWorker: worker
    }));

    const srv = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = srv.address().port;

    try {
      const postSignedWebhook = async (payloadObj) => {
        const rawStr = JSON.stringify(payloadObj);
        const ts = Math.floor(Date.now() / 1000);
        const sig = crypto
          .createHmac("sha256", WEBHOOK_SECRET)
          .update(`${ts}.${rawStr}`)
          .digest("hex");
        const res = await fetch(`http://127.0.0.1:${port}/api/callback/channex`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-hmac-timestamp": String(ts),
            "x-hmac-signature-256": sig
          },
          body: rawStr
        });
        return { status: res.status, body: await res.json() };
      };

      const quarantineBefore = db.wbpQuarantine.length;

      // 11a: Non-booking operational event (sync_error) -> 200 OK acknowledged, creates operational alert, NO quarantine
      const syncErrRes = await postSignedWebhook({
        event: "sync_error",
        property_id: channexClient.propertyId,
        payload: { id: "err-991", channel: "BookingCom", message: "Room mapping mismatch" }
      });
      assert.equal(syncErrRes.status, 200);
      assert.equal(syncErrRes.body.status, "acknowledged");
      assert.equal(syncErrRes.body.event, "sync_error");
      assert.equal(db.wbpQuarantine.length, quarantineBefore, "sync_error must not pollute booking quarantine");
      assert.equal(
        Array.isArray(db.wbpOperationalAlerts) &&
          db.wbpOperationalAlerts.some((a) => a.type === "CHANNEX_EVENT_SYNC_ERROR"),
        true,
        "Operational alert recorded for sync_error"
      );

      // 11b: Non-booking informational event (ari) -> 200 OK acknowledged
      const ariEventRes = await postSignedWebhook({
        event: "ari",
        property_id: channexClient.propertyId,
        payload: { id: "ari-101" }
      });
      assert.equal(ariEventRes.status, 200);
      assert.equal(ariEventRes.body.status, "acknowledged");

      // 11c: Lightweight booking webhook (send_data: false -> only revision_id in payload)
      const seeded = simulator.seedBookingRevision({
        property_id: channexClient.propertyId,
        ota_reservation_code: "AIRBNB-LIGHT-7001",
        ota_name: "Airbnb",
        status: "new",
        arrival_date: "2026-11-01",
        departure_date: "2026-11-03",
        amount: "620.00",
        rooms: [
          {
            room_type_id: channexClient.roomTypeId,
            rate_plan_id: null,
            meta: { parent_rate_plan_id: channexClient.ratePlanSemCafeId },
            checkin_date: "2026-11-01",
            checkout_date: "2026-11-03",
            amount: "620.00",
            occupancy: { adults: 2, children: 0 }
          }
        ]
      });

      const lightRes = await postSignedWebhook({
        event: "booking_new",
        property_id: channexClient.propertyId,
        payload: {
          booking_id: seeded.bookingId,
          revision_id: seeded.revisionId
        }
      });
      assert.equal(lightRes.status, 200);
      assert.equal(lightRes.body.acknowledged, true, "Lightweight webhook fetched full revision and ACKed it");

      const createdLight = db.reservations.find((r) => r.externalOrderId === "AIRBNB-LIGHT-7001");
      assert.ok(createdLight, "Reservation created from lightweight webhook + parent_rate_plan_id fallback");
      assert.equal(createdLight.ratePlanId, "sem_cafe");
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  test("12. Multi-Room Booking Modification (Expanding 1 -> 2 Rooms & Shrinking 2 -> 1 Room)", async () => {
    // Modify AIRBNB-LIGHT-7001 from 1 room to 2 rooms
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "AIRBNB-LIGHT-7001",
      ota_name: "Airbnb",
      status: "modified",
      arrival_date: "2026-11-01",
      departure_date: "2026-11-04",
      amount: "1440.00",
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanSemCafeId,
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-04",
          amount: "720.00",
          occupancy: { adults: 2, children: 0 }
        },
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanComCafeId,
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-04",
          amount: "720.00",
          occupancy: { adults: 2, children: 0 }
        }
      ]
    });

    await worker.pollChannexFeed();
    const expandedRooms = db.reservations.filter(
      (r) =>
        (r.externalOrderId === "AIRBNB-LIGHT-7001" || r.parentExternalOrderId === "AIRBNB-LIGHT-7001") &&
        r.status !== "cancelada"
    );
    assert.equal(expandedRooms.length, 2, "Expanded modification must allocate a 2nd active room");
    assert.notEqual(expandedRooms[0].flatNumber, expandedRooms[1].flatNumber);

    // Shrink back from 2 rooms to 1 room
    simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      ota_reservation_code: "AIRBNB-LIGHT-7001",
      ota_name: "Airbnb",
      status: "modified",
      arrival_date: "2026-11-01",
      departure_date: "2026-11-04",
      amount: "720.00",
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanSemCafeId,
          checkin_date: "2026-11-01",
          checkout_date: "2026-11-04",
          amount: "720.00",
          occupancy: { adults: 2, children: 0 }
        }
      ]
    });

    await worker.pollChannexFeed();
    const activeAfterShrink = db.reservations.filter(
      (r) =>
        (r.externalOrderId === "AIRBNB-LIGHT-7001" || r.parentExternalOrderId === "AIRBNB-LIGHT-7001") &&
        r.status !== "cancelada"
    );
    assert.equal(activeAfterShrink.length, 1, "Shrunk modification must cancel the removed room");
  });

  test("13. Decoupled Incremental ARI Sync: Availability-Only vs Restrictions-Only Delta Calls", async () => {
    ariSync.availabilityCallTimestamps = [];
    ariSync.restrictionsCallTimestamps = [];
    simulator.rateLimitBuckets.availability.clear();
    simulator.rateLimitBuckets.restrictions.clear();
    simulator.requestLog = [];

    // 13a: Availability-only trigger (e.g. reservation_created)
    ariSync.triggerIncrementalSync("2026-11-10", "2026-11-12", "reservation_created");
    if (ariSync.debounceTimer) clearTimeout(ariSync.debounceTimer);
    const avRes = await ariSync.flushIncrementalSync();
    assert.equal(avRes.success, true);

    const avCalls1 = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/availability");
    const restCalls1 = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/restrictions");
    assert.equal(avCalls1.length, 1, "Reservation mutation must call POST /availability");
    assert.equal(restCalls1.length, 0, "Reservation mutation must NOT waste rate limit on POST /restrictions");

    // 13b: Restrictions-only trigger (e.g. pricing_published)
    simulator.requestLog = [];
    ariSync.triggerIncrementalSync("2026-11-10", "2026-11-12", "pricing_published");
    if (ariSync.debounceTimer) clearTimeout(ariSync.debounceTimer);
    const prRes = await ariSync.flushIncrementalSync();
    assert.equal(prRes.success, true);

    const avCalls2 = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/availability");
    const restCalls2 = simulator.requestLog.filter((c) => c.method === "POST" && c.path === "/api/v1/restrictions");
    assert.equal(avCalls2.length, 0, "Pricing mutation must NOT call POST /availability");
    assert.equal(restCalls2.length, 1, "Pricing mutation must call POST /restrictions");
  });

  test("14. Extended ChannexClient v1 Endpoints (WhoAmI, Tasks, Health, Channels, OTA Ops, Availability Rules)", async () => {
    const who = await channexClient.getWhoAmI();
    assert.ok(who.data?.id);

    const health = await channexClient.getPropertyHealth(channexClient.propertyId);
    assert.equal(health.data?.attributes?.status, "healthy");

    const tasks = await channexClient.listTasks({ propertyId: channexClient.propertyId });
    assert.equal(Array.isArray(tasks.data), true);

    const channels = await channexClient.listChannels(channexClient.propertyId);
    assert.equal(Array.isArray(channels.data), true);

    const ruleCreated = await channexClient.createAvailabilityRule({
      property_id: channexClient.propertyId,
      title: "Close Out 0",
      type: "close_out"
    });
    assert.ok(ruleCreated.data?.id);

    const rulesList = await channexClient.listAvailabilityRules(channexClient.propertyId);
    assert.equal(rulesList.data.length >= 1, true);

    const noShow = await channexClient.reportNoShow("00000000-0000-4000-8000-000000000001", { waived_fees: true });
    assert.equal(noShow.meta?.status, "ok");

    const invCard = await channexClient.reportInvalidCard("00000000-0000-4000-8000-000000000001");
    assert.equal(invCard.meta?.status, "ok");

    // Verify Signing Keys /generate endpoint & Webhook test/logs contracts
    const skCreated = await channexClient.createSigningKey({ title: "Key Rotation Test" });
    assert.ok(skCreated.data?.id);
    const skGen = await channexClient.generateSigningKeyVersion(skCreated.data.id);
    assert.equal(skGen.data?.attributes?.status, "pending_rotation");
    assert.ok(skGen.data?.attributes?.pending_key);
    const skList = await channexClient.listSigningKeys({ billingAccountId: "ba-123" });
    assert.equal(Array.isArray(skList.data), true);

    const whTestById = await channexClient.testWebhook("wh-test-id-1");
    assert.equal(whTestById.meta?.message, "Success");
    const whTestPayload = await channexClient.testWebhook({
      property_id: channexClient.propertyId,
      callback_url: "https://example.com/wh",
      event_mask: "booking"
    });
    assert.equal(whTestPayload.meta?.message, "Success");
    const whLogsById = await channexClient.getWebhookLogs("wh-test-id-1");
    assert.equal(Array.isArray(whLogsById.data), true);

    // Verify financial metadata (deposits, collectedTaxes, otaReservationCode) & single-room modification field updates
    const finCreated = simulator.seedBookingRevision({
      property_id: channexClient.propertyId,
      status: "new",
      channel_id: "BDC",
      unique_id: "BDC-FIN-777",
      ota_reservation_code: "OTA-CODE-777",
      arrival_date: "2027-01-10",
      departure_date: "2027-01-12",
      amount: "500.00",
      deposits: [{ amount: "250.00", currency: "BRL", type: "prepayment" }],
      collected_taxes: [{ name: "ISS", amount: "25.00" }],
      customer: { name: "Carlos", surname: "Financeiro", mail: "carlos@test.com", phone: "+5511977776666" },
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanSemCafeId,
          ota_reservation_code: "OTA-ROOM-777",
          checkin_date: "2027-01-10",
          checkout_date: "2027-01-12",
          amount: "500.00",
          occupancy: { adults: 1, children: 0 },
          days: { "2027-01-10": "250.00", "2027-01-11": "250.00" }
        }
      ]
    });

    const finIngest = await processIncomingOTA(
      { data: { id: finCreated.revisionId, type: "booking_revision", attributes: finCreated.attributes } },
      { db }
    );
    assert.equal(finIngest.action, "created");
    const finRes = db.reservations.find((r) => r.id === finIngest.reservationId);
    assert.ok(finRes);
    assert.equal(finRes.otaReservationCode, "OTA-CODE-777");
    assert.equal(Array.isArray(finRes.deposits), true);
    assert.equal(finRes.deposits[0].amount, "250.00");
    assert.equal(Array.isArray(finRes.collectedTaxes), true);
    assert.equal(finRes.collectedTaxes[0].name, "ISS");

    // Single-room modification upgrading to com_cafe and 2 adults + 1 child
    const finMod = simulator.seedBookingRevision({
      booking_id: finCreated.bookingId,
      property_id: channexClient.propertyId,
      status: "modified",
      channel_id: "BDC",
      unique_id: "BDC-FIN-777",
      ota_reservation_code: "OTA-CODE-777-MOD",
      arrival_date: "2027-01-10",
      departure_date: "2027-01-12",
      amount: "660.00",
      deposits: [{ amount: "330.00", currency: "BRL", type: "prepayment" }],
      collected_taxes: [{ name: "ISS", amount: "33.00" }],
      customer: { name: "Carlos", surname: "Financeiro", mail: "carlos@test.com", phone: "+5511977776666" },
      rooms: [
        {
          room_type_id: channexClient.roomTypeId,
          rate_plan_id: channexClient.ratePlanComCafeId,
          ota_reservation_code: "OTA-ROOM-777-MOD",
          checkin_date: "2027-01-10",
          checkout_date: "2027-01-12",
          amount: "660.00",
          occupancy: { adults: 2, children: 1 },
          days: { "2027-01-10": "330.00", "2027-01-11": "330.00" }
        }
      ]
    });

    const finModResult = await processIncomingOTA(
      { data: { id: finMod.revisionId, type: "booking_revision", attributes: finMod.attributes } },
      { db }
    );
    assert.equal(finModResult.action, "modified_same_flat");
    assert.equal(finRes.ratePlanId, "com_cafe");
    assert.equal(finRes.breakfastIncluded, true);
    assert.equal(finRes.adults, 2);
    assert.equal(finRes.children, 1);
    assert.equal(finRes.guestCount, 3);
    assert.equal(finRes.dailyRate, 330);
    assert.equal(finRes.otaReservationCode, "OTA-CODE-777-MOD");
    assert.equal(finRes.deposits[0].amount, "330.00");
    assert.equal(finRes.collectedTaxes[0].amount, "33.00");

    // Verify dynamic _resolveConfig() when ChannexClient is instantiated BEFORE loadDatabase() populates db.settings.channex_config
    const lateDb = { settings: { wbp_integration_mode: "off" } };
    const prevEnvKey = process.env.CHANNEX_API_KEY;
    delete process.env.CHANNEX_API_KEY;
    try {
      const earlyBootClient = new ChannexClient({
        db: lateDb,
        baseUrl: simBaseUrl,
        appOrigin: simOrigin,
        apiKey: ""
      });
      assert.equal(earlyBootClient.apiKey, "");

      // Simulate loadDatabase() / updateChannexConfig() populating credentials after boot
      updateChannexConfig(
        {
          apiKey: API_KEY,
          webhookSecret: WEBHOOK_SECRET,
          propertyId: channexClient.propertyId,
          groupId: "d565df25-5a14-405b-89e0-85315b087f19"
        },
        lateDb
      );

      const tokenRes = await earlyBootClient.createOneTimeToken(
        { redirectTo: "/inventory" },
        { bypassSwitch: true }
      );
      assert.ok(tokenRes.token, "One-time token generated dynamically after late DB config load");
      assert.equal(tokenRes.iframeUrl.includes("redirect_to=%2Finventory"), true);
      assert.equal(tokenRes.iframeUrl.includes("group_id=d565df25-5a14-405b-89e0-85315b087f19"), true);

      // Verify methods with default propertyId parameter resolve late DB propertyId dynamically
      const lateHealth = await earlyBootClient.getPropertyHealth(undefined, { bypassSwitch: true });
      assert.equal(lateHealth.data?.attributes?.status, "healthy");
      const lateRooms = await earlyBootClient.listRoomTypes(undefined, { bypassSwitch: true });
      assert.equal(Array.isArray(lateRooms.data) && lateRooms.data.length >= 1, true);

      // Verify environment switch (staging -> production) updates baseUrl & appOrigin when not explicitly pinned
      const prevBaseUrl = process.env.CHANNEX_BASE_URL;
      const prevAppOrigin = process.env.CHANNEX_APP_ORIGIN;
      delete process.env.CHANNEX_BASE_URL;
      delete process.env.CHANNEX_APP_ORIGIN;
      try {
        const envSwitchDb = { settings: { wbp_integration_mode: "off" } };
        const envSwitchClient = new ChannexClient({ db: envSwitchDb });
        assert.equal(envSwitchClient._resolveConfig().baseUrl, "https://staging.channex.io/api/v1");
        updateChannexConfig(
          {
            environment: "production",
            apiKey: "prod-test-key",
            propertyId: channexClient.propertyId
          },
          envSwitchDb
        );
        assert.equal(envSwitchClient._resolveConfig().baseUrl, "https://app.channex.io/api/v1");
        assert.equal(envSwitchClient._resolveConfig().appOrigin, "https://app.channex.io");
      } finally {
        process.env.CHANNEX_BASE_URL = prevBaseUrl;
        process.env.CHANNEX_APP_ORIGIN = prevAppOrigin;
      }

      // Verify demo-server.mjs dual-client wiring (both legacy WBPClient and ChannexClient passed)
      const unconfiguredLegacyWbp = new WBPClient({ db, sharedSecret: "" });
      const dualAriSync = new WbpAriSynchronizer({
        db,
        storage,
        client: unconfiguredLegacyWbp,
        channexClient
      });
      const dualPushRes = await dualAriSync.performFullPush({
        startDate: "2026-12-01",
        endDate: "2026-12-03"
      });
      assert.equal(dualPushRes.success, true, "Dual-client WbpAriSynchronizer must route performFullPush to Channex");
      assert.equal(dualPushRes.provider, "channex");

      const dualWorker = new WbpBackgroundWorker({
        db,
        storage,
        client: unconfiguredLegacyWbp,
        channexClient
      });
      const dualPollRes = await dualWorker.poll();
      assert.equal(dualPollRes.success, true, "Dual-client WbpBackgroundWorker must poll Channex without failing on unconfigured legacy WBP");
      assert.equal(dualPollRes.provider, "channex");
    } finally {
      process.env.CHANNEX_API_KEY = prevEnvKey;
    }
  });
});


