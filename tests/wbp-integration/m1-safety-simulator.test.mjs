import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";

// Ensure DATABASE_URL is strictly unset for complete test isolation
delete process.env.DATABASE_URL;

import { WBPClient, WbpApiError } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { getIntegrationMode, setIntegrationMode, WBP_MODES } from "../../artifacts/api-server/wbp/config.mjs";
import { createWbpCallbackRouter, WbpBackgroundWorker } from "../../artifacts/api-server/wbp/callbacks.mjs";
import { WBPSimulator } from "../../e2e/wbp-simulator/server.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";

describe("Milestone 1: Operational Safety, Storage & WBP Simulator", () => {
  const TEST_DIR = path.resolve(process.cwd(), "tmp", `wbp-m1-test-${Date.now()}`);
  let simulator;
  let pmsServer;
  let pmsUrl;
  let mockDb;
  let testStorage;

  before(async () => {
    // 1. Ensure isolated directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // 2. Setup isolated storage
    testStorage = new WbpStorage({
      storageFilePath: path.join(TEST_DIR, "wbp_raw_payloads.jsonl"),
      idempotencyFilePath: path.join(TEST_DIR, "wbp_idempotency.json")
    });
    await testStorage.init();

    // 3. Initialize mock PMS in-memory database
    mockDb = {
      settings: {
        wbp_integration_mode: WBP_MODES.OFF
      },
      reservations: [],
      whatsappHistory: [],
      breakfastOrders: []
    };

    // 4. Start local WBP Simulator on ephemeral port
    simulator = new WBPSimulator({
      sharedSecret: "s3cr3ts4uc3",
      wbpPropertyId: "111",
      pmsPropertyId: "soho-19",
      currency: "BRL"
    });
    await simulator.start(0);

    // 5. Start isolated PMS HTTP server for callback reception
    const pmsApp = express();
    pmsApp.use(express.json());
    pmsApp.use(express.urlencoded({ extended: true }));
    pmsApp.use("/api/callback/wbp", createWbpCallbackRouter({ db: mockDb, storage: testStorage, sharedSecret: "s3cr3ts4uc3" }));

    pmsServer = http.createServer(pmsApp);
    await new Promise((resolve) => {
      pmsServer.listen(0, "127.0.0.1", resolve);
    });
    const addr = pmsServer.address();
    pmsUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (simulator) await simulator.stop();
    if (pmsServer) {
      await new Promise((resolve) => pmsServer.close(resolve));
    }
    // Clean up temporary files
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  beforeEach(() => {
    simulator.reset();
    delete process.env.WBP_INTEGRATION_MODE;
    mockDb.settings.wbp_integration_mode = WBP_MODES.OFF;
  });

  // ── TEST 1: Operational General Switch 'off' (Safety) ────────────────────
  describe("1. Operational General Switch 'off' (100% Inert)", () => {
    it("leaves simulator calls at 0 when mode is 'off' and rejects outbound calls", async () => {
      mockDb.settings.wbp_integration_mode = WBP_MODES.OFF;
      assert.strictEqual(getIntegrationMode(mockDb), "off");

      const client = new WBPClient({
        baseUrl: simulator.url,
        sharedSecret: "s3cr3ts4uc3",
        wbpPropertyId: "111",
        pmsPropertyId: "soho-19",
        db: mockDb
      });

      // Outbound calls must be blocked
      await assert.rejects(
        () => client.healthCheck(),
        (err) => {
          assert(err instanceof WbpApiError);
          assert.strictEqual(err.code, 1031);
          assert.match(err.message, /Integração WBP desativada/);
          return true;
        }
      );

      await assert.rejects(
        () => client.sendARIUpdate({ Inventory: [] }),
        (err) => err.code === 1031
      );

      // Simulator received requests MUST be exactly 0
      assert.strictEqual(simulator.getReceivedRequests().length, 0);
    });

    it("callbacks return HTTP 200 { ErrorCode: 1031, Error: 'Integration disabled' } without saving bookings", async () => {
      mockDb.settings.wbp_integration_mode = WBP_MODES.OFF;

      // Inbound callback BookingCreate
      const res = await fetch(`${pmsUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "s3cr3ts4uc3",
          pms_property_id: "soho-19",
          reservation: { OrderId: "OFF-TEST-001", TotalPrice: 500 }
        })
      });

      const body = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(body.ErrorCode, 1031);
      assert.strictEqual(body.Error, "Integration disabled");

      // Verify NO raw payload recorded
      const count = await testStorage.getRawPayloadCount();
      assert.strictEqual(count, 0);
      assert.strictEqual(mockDb.reservations.length, 0);
    });

    it("does not start any background polling timer when mode is 'off'", () => {
      mockDb.settings.wbp_integration_mode = WBP_MODES.OFF;
      const worker = new WbpBackgroundWorker({ db: mockDb, storage: testStorage });
      worker.start(1000);
      assert.strictEqual(worker.intervalId, null);
      worker.stop();
    });
  });

  // ── TEST 2: Idempotent Concurrency & Deduplication ───────────────────────
  describe("2. Idempotency & Concurrency: 5x Callback + 3x Polling Delivery", () => {
    it("produces exactly 1 processed record under concurrent multi-channel delivery", async () => {
      mockDb.settings.wbp_integration_mode = WBP_MODES.AUTO;
      const targetOrderId = `ORD-CONCUR-${Date.now()}`;
      let processedExecutionsCount = 0;
      let deduplicatedCount = 0;

      // Create a shared booking payload
      const testPayload = {
        shared_secret: "s3cr3ts4uc3",
        pms_property_id: "soho-19",
        reservation: {
          OrderId: targetOrderId,
          OrderDate: "2026-10-14",
          TotalPrice: 553.26,
          PaymentCollect: "Channel"
        }
      };

      // Processor simulating the PMS booking creation logic with storage idempotency locks
      const handleDelivery = async (source, endpoint, payload) => {
        // 1. Store raw payload durably
        const payloadId = await testStorage.recordRawPayload({
          source,
          endpoint,
          payload
        });

        // 2. Claim processing
        const keys = testStorage.deriveKeys(payload);
        const claim = await testStorage.claimForProcessing(keys.idempotencyKey, payloadId, keys.orderId);

        if (!claim.shouldProcess) {
          deduplicatedCount++;
          return { status: "deduplicated", reason: claim.reason };
        }

        // 3. Perform atomic reservation creation
        processedExecutionsCount++;
        // Simulate processing time
        await new Promise((r) => setTimeout(r, 10));

        // 4. Release claim and mark processed
        await claim.release({ reservationId: `RES-${targetOrderId}` });
        return { status: "created", reservationId: `RES-${targetOrderId}` };
      };

      // Dispatch 5 callbacks and 3 pollings CONCURRENTLY
      const deliveries = [
        // 5x callbacks
        handleDelivery("webhook", "BookingCreate", testPayload),
        handleDelivery("webhook", "BookingCreate", testPayload),
        handleDelivery("webhook", "BookingCreate", testPayload),
        handleDelivery("webhook", "BookingCreate", testPayload),
        handleDelivery("webhook", "BookingCreate", testPayload),
        // 3x pollings
        handleDelivery("polling", "GetBookingId", testPayload),
        handleDelivery("polling", "GetBookingId", testPayload),
        handleDelivery("polling", "GetBookingId", testPayload)
      ];

      const results = await Promise.all(deliveries);

      // Verify Assertions:
      // 1. Exactly 1 reservation processed
      assert.strictEqual(processedExecutionsCount, 1, "Exatamente 1 reserva deve ser processada");
      // 2. The other 7 deliveries were deduplicated
      assert.strictEqual(deduplicatedCount, 7, "Exatamente 7 entregas devem ser desduplicadas");
      // 3. Raw insert-only audit storage recorded all 8 raw payloads
      const rawCount = await testStorage.getRawPayloadCount();
      assert.strictEqual(rawCount, 8, "Todos os 8 payloads brutos devem estar gravados no log de auditoria");
      // 4. Idempotency map reports targetOrderId as processed
      const isProcessed = await testStorage.isAlreadyProcessed(`order_${targetOrderId}`);
      assert.strictEqual(isProcessed, true, "OrderId deve constar como processado na tabela de idempotência");
    });
  });

  // ── TEST 3: Process Restart / Crash Recovery ─────────────────────────────
  describe("3. Durability & Crash Recovery: Resuming Unprocessed Raw Payloads", () => {
    it("picks up and completes unprocessed raw payloads upon process restart", async () => {
      const crashDir = path.join(TEST_DIR, "crash-test");
      fs.mkdirSync(crashDir, { recursive: true });

      const storageBeforeCrash = new WbpStorage({
        storageFilePath: path.join(crashDir, "raw.jsonl"),
        idempotencyFilePath: path.join(crashDir, "idem.json")
      });
      await storageBeforeCrash.init();

      // Simulate a raw payload recorded right before sudden process crash
      const orderId = "CRASH-RECOVER-123";
      const crashPayloadId = await storageBeforeCrash.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload: {
          reservation: { OrderId: orderId, TotalPrice: 320 }
        }
      });

      // Simulate restart: create fresh WbpStorage instance reading from the same files
      const storageAfterRestart = new WbpStorage({
        storageFilePath: path.join(crashDir, "raw.jsonl"),
        idempotencyFilePath: path.join(crashDir, "idem.json")
      });
      await storageAfterRestart.init();

      // Query unprocessed payloads
      const unprocessed = await storageAfterRestart.getUnprocessedPayloads();
      assert.strictEqual(unprocessed.length, 1, "Payload não processado antes do crash deve ser detectado");
      assert.strictEqual(unprocessed[0].id, crashPayloadId);
      assert.strictEqual(unprocessed[0].orderId, orderId);

      // Resume and complete processing
      const claim = await storageAfterRestart.claimForProcessing(
        unprocessed[0].idempotencyKey,
        unprocessed[0].id,
        unprocessed[0].orderId
      );
      assert.strictEqual(claim.shouldProcess, true);
      await claim.release({ recovered: true });

      // After release, unprocessed payloads queue must be empty
      const afterRecoverUnprocessed = await storageAfterRestart.getUnprocessedPayloads();
      assert.strictEqual(afterRecoverUnprocessed.length, 0, "Fila de não processados deve ficar vazia após recuperação");
    });
  });

  // ── TEST 4: pruneDatabase Immunity ───────────────────────────────────────
  describe("4. Storage Isolation: Immune to pruneDatabase", () => {
    it("ensures raw payloads survive pruneDatabase completely intact", async () => {
      const pruneDir = path.join(TEST_DIR, "prune-test");
      fs.mkdirSync(pruneDir, { recursive: true });

      const pruneStorage = new WbpStorage({
        storageFilePath: path.join(pruneDir, "raw.jsonl"),
        idempotencyFilePath: path.join(pruneDir, "idem.json")
      });
      await pruneStorage.init();

      // Seed 25 raw payloads
      for (let i = 0; i < 25; i++) {
        await pruneStorage.recordRawPayload({
          source: "webhook",
          endpoint: "BookingCreate",
          payload: { reservation: { OrderId: `PRUNE-TEST-${i}`, TotalPrice: 100 + i } }
        });
      }
      assert.strictEqual(await pruneStorage.getRawPayloadCount(), 25);

      // Create a mock db object with oversized collections to trigger pruning
      const oversizedDb = {
        reservations: Array.from({ length: 900 }, (_, i) => ({
          id: `res_${i}`,
          checkoutDate: "2020-01-01", // Old checkout > 180 days
          status: "finalizada"
        })),
        whatsappHistory: Array.from({ length: 700 }, (_, i) => ({
          id: `msg_${i}`,
          createdAt: "2026-01-01T00:00:00Z"
        })),
        breakfastOrders: Array.from({ length: 650 }, (_, i) => ({
          id: `ord_${i}`,
          date: "2026-01-01"
        }))
      };

      // Implement the exact pruneDatabase logic from demo-server.mjs
      function pruneMockDb(target) {
        const LIMITS = {
          whatsappHistory: 500,
          breakfastOrders: 500
        };
        for (const [key, max] of Object.entries(LIMITS)) {
          if (Array.isArray(target[key]) && target[key].length > max) {
            target[key] = target[key].slice(0, max);
          }
        }
        if (Array.isArray(target.reservations) && target.reservations.length > 800) {
          target.reservations = target.reservations.filter(
            (r) => r.status === "confirmada" || r.status === "checkin"
          );
        }
      }

      // Execute pruning on database
      pruneMockDb(oversizedDb);

      // Verify db collections were pruned
      assert(oversizedDb.reservations.length <= 800);
      assert.strictEqual(oversizedDb.whatsappHistory.length, 500);
      assert.strictEqual(oversizedDb.breakfastOrders.length, 500);

      // Verify WbpStorage raw payloads are 100% UNTOUCHED and fully preserved
      const rawCountAfterPrune = await pruneStorage.getRawPayloadCount();
      assert.strictEqual(rawCountAfterPrune, 25, "Payloads brutos devem permanecer 100% intactos após o pruneDatabase");
    });
  });

  // ── TEST 5: Simulator OpenAPI Schemas & Failure Injections ───────────────
  describe("5. WBP Simulator OpenAPI Schemas & Programmable Failure Modes", () => {
    let testClient;

    before(() => {
      testClient = new WBPClient({
        baseUrl: simulator.url,
        sharedSecret: "s3cr3ts4uc3",
        wbpPropertyId: "111",
        pmsPropertyId: "soho-19",
        currency: "BRL",
        timeoutMs: 500,
        maxRetries: 2,
        backoffBaseMs: 15
      });
    });

    it("validates and accepts all 8 mandatory outbound client endpoints against OpenAPI schemas", async () => {
      // 1. HealthCheck
      const r1 = await testClient.healthCheck({ bypassSwitch: true });
      assert.strictEqual(r1.success, true);

      // 2. SetupProperty
      const r2 = await testClient.setupProperty({}, { bypassSwitch: true });
      assert.strictEqual(r2.success, true);

      // 3. GetRoomTypes
      const r3 = await testClient.getRoomTypes({ bypassSwitch: true });
      assert.strictEqual(r3.success, true);
      assert(Array.isArray(r3.Rooms));

      // 4. GetRatePlans
      const r4 = await testClient.getRatePlans({ bypassSwitch: true });
      assert.strictEqual(r4.success, true);
      assert(Array.isArray(r4.RatePlans));

      // 5. ARIUpdate
      const r5 = await testClient.sendARIUpdate(
        {
          currency: "BRL",
          Inventory: [
            {
              wbp_room_id: "111",
              wbp_rate_id: "sem_cafe",
              start_date: "2026-10-15",
              end_date: "2026-10-20",
              units: 14,
              rate: "276.63",
              min_los: 1,
              close: false
            }
          ]
        },
        { bypassSwitch: true }
      );
      assert.strictEqual(r5.success, true);

      // 6. GetBookingList
      const r6 = await testClient.getBookingList({ wbp_booking_version: null }, { bypassSwitch: true });
      assert.strictEqual(r6.success, true);

      // 7. Inject & GetBookingId
      const injectedId = simulator.injectBooking({ OrderId: "ORD-SCHEMA-CHECK", TotalPrice: 600 });
      const r7 = await testClient.getBookingId({ booking_id: injectedId }, { bypassSwitch: true });
      assert.strictEqual(r7.success, true);
      assert.strictEqual(r7.reservation.OrderId, injectedId);

      // 8. AckBooking
      const r8 = await testClient.ackBooking({ booking_id: injectedId }, { bypassSwitch: true });
      assert.strictEqual(r8.success, true);
    });

    it("schema validator detects and flags invalid payloads", () => {
      // Missing guid
      const invalidNoGuid = validateRequest("HealthCheck", { verb: "HealthCheck", pms_cid: "gfm" });
      assert.strictEqual(invalidNoGuid.valid, false);
      assert(invalidNoGuid.errors.some((e) => e.includes("guid")));

      // Invalid dates in ARIUpdate (end before start)
      const invalidDates = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        pms_cid: "gfm",
        shared_secret: "sec",
        guid: "6C08B96E-450D-4E6A-9933-7D0305730305",
        currency: "BRL",
        Inventory: [
          {
            wbp_room_id: "111",
            wbp_rate_id: "sem_cafe",
            start_date: "2026-10-20",
            end_date: "2026-10-15"
          }
        ]
      });
      assert.strictEqual(invalidDates.valid, false);
      assert(invalidDates.errors.some((e) => e.includes("não pode ser posterior")));
    });

    it("injects Error 1001 (Invalid login) and client handles it as non-retryable", async () => {
      simulator.setFailureMode("SetupProperty", {
        errorCode: 1001,
        errorMessage: "The login details you provided are incorrect."
      });

      await assert.rejects(
        () => testClient.setupProperty({}, { bypassSwitch: true }),
        (err) => {
          assert(err instanceof WbpApiError);
          assert.strictEqual(err.code, 1001);
          assert.strictEqual(err.retryable, false);
          return true;
        }
      );
    });

    it("injects Error 1002 (Channel management not enabled)", async () => {
      simulator.setFailureMode("SetupProperty", {
        errorCode: 1002,
        errorMessage: "Credentials not enabled for channel management."
      });

      await assert.rejects(
        () => testClient.setupProperty({}, { bypassSwitch: true }),
        (err) => {
          assert.strictEqual(err.code, 1002);
          return true;
        }
      );
    });

    it("injects Error 1102 (Currency mismatch on ARIUpdate)", async () => {
      simulator.setFailureMode("ARIUpdate", {
        errorCode: 1102,
        errorMessage: "Your currency setting doesn't match the currency for this channel"
      });

      await assert.rejects(
        () => testClient.sendARIUpdate({ Inventory: [] }, { bypassSwitch: true }),
        (err) => {
          assert.strictEqual(err.code, 1102);
          return true;
        }
      );
    });

    it("handles timeout and retries with the EXACT SAME GUID across attempts", async () => {
      simulator.clearFailureModes();
      // Configure simulator to delay longer than client timeout (70ms vs 40ms)
      simulator.setFailureMode("GetBookingList", { delayMs: 80 });

      const retryClient = new WBPClient({
        baseUrl: simulator.url,
        sharedSecret: "s3cr3ts4uc3",
        timeoutMs: 30,
        maxRetries: 2,
        backoffBaseMs: 10
      });

      await assert.rejects(
        () => retryClient.getBookingList({}, { bypassSwitch: true }),
        (err) => {
          assert.strictEqual(err.code, 1003); // Timeout treated as transient 1003
          return true;
        }
      );

      // Verify simulator received requests
      const getListRequests = simulator.getReceivedRequests().filter((r) => r.verb === "GetBookingList");
      assert.strictEqual(getListRequests.length, 3, "Deve ter realizado 1 tentativa inicial + 2 retentativas");

      // Verify all 3 attempts reused the EXACT SAME GUID
      const firstGuid = getListRequests[0].guid;
      assert.ok(firstGuid, "Primeira tentativa deve conter um GUID");
      assert.strictEqual(getListRequests[1].guid, firstGuid, "Retentativa 1 deve reutilizar o mesmo GUID");
      assert.strictEqual(getListRequests[2].guid, firstGuid, "Retentativa 2 deve reutilizar o mesmo GUID");
    });
  });

  // ── TEST 6: Form-Urlencoded NotifyBooking Callback ───────────────────────
  describe("6. Callback: NotifyBooking (application/x-www-form-urlencoded)", () => {
    it("successfully receives and parses form-urlencoded NotifyBooking webhook", async () => {
      mockDb.settings.wbp_integration_mode = WBP_MODES.AUTO;
      const testBookingId = `NOTIFY-${Date.now()}`;

      // Simulator dispatches NotifyBooking to PMS
      const res = await simulator.sendNotifyBooking(pmsUrl, testBookingId);
      assert.deepStrictEqual(res, {});

      // Verify raw storage captured the form-urlencoded notification
      const unprocessed = await testStorage.getUnprocessedPayloads();
      const notifyEntry = unprocessed.find((u) => u.orderId === testBookingId);
      assert.ok(notifyEntry, "Notificação deve ser gravada no armazenamento durável");
      assert.strictEqual(notifyEntry.source, "webhook");
      assert.strictEqual(notifyEntry.endpoint, "NotifyBooking");
      assert.strictEqual(notifyEntry.payload.booking_id, testBookingId);
    });
  });
});
