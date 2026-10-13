import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";

// Ensure DATABASE_URL is strictly unset for complete test isolation
delete process.env.DATABASE_URL;

import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { getIntegrationMode, setIntegrationMode, WBP_MODES } from "../../artifacts/api-server/wbp/config.mjs";
import { createWbpCallbackRouter } from "../../artifacts/api-server/wbp/callbacks.mjs";

describe("Challenger 1: Concurrency & Idempotency Stress Harness (Milestone 1)", () => {
  const TEST_DIR = path.resolve(process.cwd(), "tmp", `wbp-challenger-m1-${Date.now()}`);
  let pmsServer;
  let pmsUrl;
  let mockDb;
  let testStorage;

  before(async () => {
    // 1. Ensure isolated temp directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // 2. Setup isolated storage
    testStorage = new WbpStorage({
      storageFilePath: path.join(TEST_DIR, "wbp_raw_payloads.jsonl"),
      idempotencyFilePath: path.join(TEST_DIR, "wbp_idempotency.json")
    });
    await testStorage.init();

    // 3. Initialize mock PMS database in auto mode
    mockDb = {
      settings: {
        wbp_integration_mode: WBP_MODES.AUTO
      },
      reservations: [],
      processedBookings: new Map()
    };

    // 4. Start isolated PMS HTTP server for callback reception
    const pmsApp = express();
    pmsApp.use(express.json());
    pmsApp.use(express.urlencoded({ extended: true }));
    pmsApp.use(
      "/api/callback/wbp",
      createWbpCallbackRouter({
        db: mockDb,
        storage: testStorage,
        sharedSecret: "stress-test-secret"
      })
    );

    pmsServer = http.createServer(pmsApp);
    await new Promise((resolve) => {
      pmsServer.listen(0, "127.0.0.1", resolve);
    });
    const addr = pmsServer.address();
    pmsUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (pmsServer) {
      await new Promise((resolve) => pmsServer.close(resolve));
    }
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch (_) {}
  });

  beforeEach(async () => {
    await testStorage.clear();
    mockDb.settings.wbp_integration_mode = WBP_MODES.AUTO;
    mockDb.reservations = [];
    mockDb.processedBookings.clear();
  });

  // ── TEST SUITE 1: 50 SIMULTANEOUS CONCURRENT DELIVERIES OF THE SAME BOOKING ──────
  describe("Suite 1: 50 Simultaneous Concurrent Deliveries of the Same Booking (Core Challenge)", () => {
    it("guarantees exactly 1 execution acquires processing lock, exactly 1 record marked processed, and 0 duplicate IDs under 30 callbacks + 20 polling deliveries", async () => {
      const targetOrderId = `STRESS-CONCUR-${Date.now()}`;
      const payload = {
        shared_secret: "stress-test-secret",
        pms_property_id: "soho-19",
        reservation: {
          OrderId: targetOrderId,
          OrderDate: "2026-10-15",
          TotalPrice: 842.15,
          GuestName: "Empirical Stress Guest",
          PaymentCollect: "Channel"
        }
      };

      // Spies & trackers
      let totalDeliveriesFired = 0;
      let acquiredLocksCount = 0;
      let deduplicatedCount = 0;
      const executedBusinessLogics = [];
      const deduplicationReasons = [];

      // Intercept and instrument claimForProcessing to track concurrent claims accurately
      const originalClaim = testStorage.claimForProcessing.bind(testStorage);
      testStorage.claimForProcessing = async (idempotencyKey, payloadId, orderId) => {
        const claim = await originalClaim(idempotencyKey, payloadId, orderId);
        if (claim.shouldProcess) {
          acquiredLocksCount++;
          // Wrap release to simulate 25ms of database/business processing while holding in-flight lock
          const origRelease = claim.release;
          claim.release = async (result, error) => {
            executedBusinessLogics.push({
              orderId,
              payloadId,
              timestamp: Date.now()
            });
            // Simulate processing latency to force concurrency race window
            await new Promise((r) => setTimeout(r, 25));
            return origRelease(result, error);
          };
        } else {
          deduplicatedCount++;
          deduplicationReasons.push(claim.reason);
        }
        return claim;
      };

      try {
        // Dispatch 30 HTTP callback deliveries + 20 simulated polling deliveries CONCURRENTLY
        const callbackPromises = Array.from({ length: 30 }, async (_, i) => {
          totalDeliveriesFired++;
          const res = await fetch(`${pmsUrl}/api/callback/wbp/BookingCreate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          assert.strictEqual(res.status, 200, `Callback ${i} must return HTTP 200`);
          return { type: "callback", index: i };
        });

        const pollingPromises = Array.from({ length: 20 }, async (_, i) => {
          totalDeliveriesFired++;
          // Simulate background polling worker ingesting the same booking
          const rawId = await testStorage.recordRawPayload({
            source: "polling",
            endpoint: "GetBookingId",
            payload: payload.reservation,
            idempotencyKey: `order_${targetOrderId}`,
            orderId: targetOrderId
          });

          const keys = testStorage.deriveKeys(payload.reservation);
          const claim = await testStorage.claimForProcessing(keys.idempotencyKey, rawId, keys.orderId);
          if (claim.shouldProcess) {
            await claim.release({ processedViaPolling: true });
          }
          return { type: "polling", index: i, shouldProcess: claim.shouldProcess };
        });

        // Fire all 50 deliveries at the exact same instant
        const allResults = await Promise.all([...callbackPromises, ...pollingPromises]);
        assert.strictEqual(allResults.length, 50, "Total deliveries resolved must be exactly 50");

        // ── VERIFICATION ASSERTIONS ──
        // 1. Total deliveries fired was 50
        assert.strictEqual(totalDeliveriesFired, 50, "50 deliveries must have been fired");

        // 2. Exactly 1 execution acquired processing lock
        assert.strictEqual(
          acquiredLocksCount,
          1,
          `Expected exactly 1 execution to acquire lock, but got ${acquiredLocksCount}`
        );

        // 3. Exactly 49 deliveries were deduplicated
        assert.strictEqual(
          deduplicatedCount,
          49,
          `Expected exactly 49 deliveries to be deduplicated, but got ${deduplicatedCount}`
        );

        // 4. Exactly 1 business logic execution completed
        assert.strictEqual(
          executedBusinessLogics.length,
          1,
          `Expected exactly 1 business execution, but got ${executedBusinessLogics.length}`
        );
        assert.strictEqual(executedBusinessLogics[0].orderId, targetOrderId);

        // 5. Zero duplicate IDs created
        const uniqueOrderIds = new Set(executedBusinessLogics.map((b) => b.orderId));
        assert.strictEqual(uniqueOrderIds.size, 1, "There must be 0 duplicate order IDs");

        // 6. Durable raw audit storage contains ALL 50 raw payloads (zero data loss)
        const rawCount = await testStorage.getRawPayloadCount();
        assert.strictEqual(
          rawCount,
          50,
          `Audit storage must preserve all 50 raw payloads, but found ${rawCount}`
        );

        // 7. Idempotency store has exactly 1 processed record for this order
        const isProcessed = await testStorage.isAlreadyProcessed(`order_${targetOrderId}`);
        assert.strictEqual(isProcessed, true, "OrderId must be marked as processed in idempotency table");

        // 8. No unprocessed payloads remain for this completed order
        const unprocessed = await testStorage.getUnprocessedPayloads();
        const unprocessedForThisOrder = unprocessed.filter((u) => u.orderId === targetOrderId);
        assert.strictEqual(
          unprocessedForThisOrder.length,
          0,
          "Completed order must leave 0 unprocessed items in recovery queue"
        );
      } finally {
        // Restore original method
        testStorage.claimForProcessing = originalClaim;
      }
    });
  });

  // ── TEST SUITE 2: POST-PROCESSING FLOOD (50 CONCURRENT DELIVERIES AFTER COMPLETION) ──
  describe("Suite 2: Post-Processing Flood (50 Concurrent Deliveries After Already Processed)", () => {
    it("rejects 100% of 50 concurrent deliveries with ALREADY_PROCESSED and executes 0 new locks", async () => {
      const orderId = `FLOOD-COMPLETED-${Date.now()}`;
      const payload = {
        shared_secret: "stress-test-secret",
        pms_property_id: "soho-19",
        reservation: { OrderId: orderId, TotalPrice: 199.99 }
      };

      // 1. Initial delivery that processes and completes
      const initialRawId = await testStorage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload
      });
      const keys = testStorage.deriveKeys(payload);
      const initialClaim = await testStorage.claimForProcessing(keys.idempotencyKey, initialRawId, keys.orderId);
      assert.strictEqual(initialClaim.shouldProcess, true);
      await initialClaim.release({ processed: true });

      // Verify it is processed
      assert.strictEqual(await testStorage.isAlreadyProcessed(keys.idempotencyKey), true);

      // 2. Fire 50 concurrent duplicate deliveries (25 callbacks + 25 pollings)
      let postAcquiredLocks = 0;
      let postDeduplicated = 0;

      const promises = Array.from({ length: 50 }, async (_, i) => {
        if (i % 2 === 0) {
          // Callback
          const res = await fetch(`${pmsUrl}/api/callback/wbp/BookingCreate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          assert.strictEqual(res.status, 200);
          return { type: "callback" };
        } else {
          // Polling
          const rawId = await testStorage.recordRawPayload({
            source: "polling",
            endpoint: "GetBookingId",
            payload: payload.reservation
          });
          const claim = await testStorage.claimForProcessing(keys.idempotencyKey, rawId, keys.orderId);
          if (claim.shouldProcess) {
            postAcquiredLocks++;
            await claim.release();
          } else {
            postDeduplicated++;
            assert.strictEqual(claim.reason, "ALREADY_PROCESSED");
          }
          return { type: "polling" };
        }
      });

      await Promise.all(promises);

      // Verify: 0 new locks acquired for polling deliveries
      assert.strictEqual(postAcquiredLocks, 0, "No new locks can be acquired for already processed booking");
      assert.strictEqual(postDeduplicated, 25, "All 25 polling deliveries must see ALREADY_PROCESSED");

      // Verify raw payloads grew by 25 from polling + 25 from callbacks = 50 + 1 initial = 51
      const count = await testStorage.getRawPayloadCount();
      assert.strictEqual(count, 51, "Audit log must retain 1 initial + 50 flood raw payloads = 51 total");
    });
  });

  // ── TEST SUITE 3: MULTI-BOOKING BURST CONCURRENCY (50 DELIVERIES ACROSS 5 DISTINCT ORDERS) ──
  describe("Suite 3: Multi-Booking Burst (50 Deliveries Across 5 Distinct Orders)", () => {
    it("locks per-order correctly: acquires exactly 5 locks and deduplicates exactly 45 deliveries", async () => {
      const distinctOrders = ["ORDER-A", "ORDER-B", "ORDER-C", "ORDER-D", "ORDER-E"].map(
        (id) => `${id}-${Date.now()}`
      );

      const locksPerOrder = new Map();
      const dedupPerOrder = new Map();
      distinctOrders.forEach((id) => {
        locksPerOrder.set(id, 0);
        dedupPerOrder.set(id, 0);
      });

      // For each order, create 10 concurrent deliveries = 50 total deliveries
      const allDeliveries = [];

      for (const orderId of distinctOrders) {
        const payload = {
          shared_secret: "stress-test-secret",
          pms_property_id: "soho-19",
          reservation: { OrderId: orderId, TotalPrice: 300 }
        };

        for (let j = 0; j < 10; j++) {
          allDeliveries.push(async () => {
            const rawId = await testStorage.recordRawPayload({
              source: "webhook",
              endpoint: "BookingCreate",
              payload
            });
            const keys = testStorage.deriveKeys(payload);
            const claim = await testStorage.claimForProcessing(keys.idempotencyKey, rawId, keys.orderId);

            if (claim.shouldProcess) {
              locksPerOrder.set(orderId, locksPerOrder.get(orderId) + 1);
              // Hold lock briefly
              await new Promise((r) => setTimeout(r, 15));
              await claim.release({ createdOrderId: orderId });
            } else {
              dedupPerOrder.set(orderId, dedupPerOrder.get(orderId) + 1);
            }
          });
        }
      }

      // Execute all 50 deliveries concurrently
      await Promise.all(allDeliveries.map((fn) => fn()));

      // Verify each of the 5 distinct orders:
      for (const orderId of distinctOrders) {
        assert.strictEqual(
          locksPerOrder.get(orderId),
          1,
          `Order ${orderId} must have acquired exactly 1 lock`
        );
        assert.strictEqual(
          dedupPerOrder.get(orderId),
          9,
          `Order ${orderId} must have deduplicated exactly 9 deliveries`
        );
        const processed = await testStorage.isAlreadyProcessed(`order_${orderId}`);
        assert.strictEqual(processed, true, `Order ${orderId} must be processed in idempotency table`);
      }

      const totalRaw = await testStorage.getRawPayloadCount();
      assert.strictEqual(totalRaw, 50, "Exactly 50 raw payloads recorded across all 5 orders");
    });
  });

  // ── TEST SUITE 4: SELF-HEALING / ERROR RELEASE LOCK RECOVERY ────────────────
  describe("Suite 4: Fault Tolerance (Lock Release on Processing Failure)", () => {
    it("releases in-flight lock cleanly when an error occurs, permitting subsequent retry delivery to succeed", async () => {
      const orderId = `FAIL-RETRY-${Date.now()}`;
      const payload = {
        OrderId: orderId,
        TotalPrice: 500
      };

      const rawId1 = await testStorage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload
      });
      const keys = testStorage.deriveKeys(payload);

      // 1. Delivery 1 claims lock but fails with error
      const claim1 = await testStorage.claimForProcessing(keys.idempotencyKey, rawId1, keys.orderId);
      assert.strictEqual(claim1.shouldProcess, true);

      // Simulate failure in business logic: release with error
      const failureError = new Error("Simulated payment processor connection drop");
      await claim1.release(null, failureError);

      // Must NOT be marked as processed
      const isProcessedAfterFail = await testStorage.isAlreadyProcessed(keys.idempotencyKey);
      assert.strictEqual(isProcessedAfterFail, false, "Failed processing must NOT be marked as processed");

      // 2. Retry delivery arrives
      const rawId2 = await testStorage.recordRawPayload({
        source: "polling",
        endpoint: "GetBookingId",
        payload
      });
      const claim2 = await testStorage.claimForProcessing(keys.idempotencyKey, rawId2, keys.orderId);
      assert.strictEqual(
        claim2.shouldProcess,
        true,
        "Retry delivery MUST acquire lock after previous failure was released"
      );

      // Completes successfully
      await claim2.release({ status: "success" });

      // Now it is marked as processed
      const isProcessedAfterRetry = await testStorage.isAlreadyProcessed(keys.idempotencyKey);
      assert.strictEqual(isProcessedAfterRetry, true, "Retry must mark record as processed");
    });
  });

  // ── TEST SUITE 5: CONCURRENT CRASH RECOVERY UNDER MULTIPLE WORKERS ─────────
  describe("Suite 5: Concurrent Crash Recovery Under Multiple Workers", () => {
    it("safely recovers 50 unacknowledged raw payloads across 5 concurrent worker loops without duplicate processing", async () => {
      // Seed 10 distinct orders, 5 duplicate raw records each = 50 raw unacknowledged payloads
      const orderIds = Array.from({ length: 10 }, (_, i) => `CRASH-ORD-${i}-${Date.now()}`);

      for (const orderId of orderIds) {
        for (let j = 0; j < 5; j++) {
          await testStorage.recordRawPayload({
            source: j % 2 === 0 ? "webhook" : "polling",
            endpoint: "BookingCreate",
            payload: { OrderId: orderId, Amount: 100 }
          });
        }
      }

      // Verify initial raw count is 50
      const initialCount = await testStorage.getRawPayloadCount();
      assert.strictEqual(initialCount, 50, "50 unacknowledged payloads must be seeded");

      // Verify all 50 are initially detected by getUnprocessedPayloads
      const initialUnprocessed = await testStorage.getUnprocessedPayloads();
      assert.strictEqual(initialUnprocessed.length, 50, "All 50 must be in unprocessed state");

      // Simulate 5 concurrent recovery workers competing to process the queue
      const processedOrders = new Set();
      const duplicatesDetected = [];

      const runWorker = async (workerId) => {
        const queue = await testStorage.getUnprocessedPayloads();
        for (const item of queue) {
          const claim = await testStorage.claimForProcessing(item.idempotencyKey, item.id, item.orderId);
          if (claim.shouldProcess) {
            if (processedOrders.has(item.orderId)) {
              duplicatesDetected.push({ workerId, orderId: item.orderId });
            }
            processedOrders.add(item.orderId);
            // Simulate recovery processing
            await new Promise((r) => setTimeout(r, 5));
            await claim.release({ recoveredBy: workerId });
          }
        }
      };

      // Run 5 worker threads concurrently
      await Promise.all([runWorker(1), runWorker(2), runWorker(3), runWorker(4), runWorker(5)]);

      // Assertions:
      // Exactly 10 distinct orders processed
      assert.strictEqual(processedOrders.size, 10, "Exactly 10 unique orders must be processed");
      // 0 duplicates processed across workers
      assert.strictEqual(
        duplicatesDetected.length,
        0,
        `Zero duplicates allowed, but found: ${JSON.stringify(duplicatesDetected)}`
      );

      // All 10 orders must now be marked processed
      for (const orderId of orderIds) {
        assert.strictEqual(
          await testStorage.isAlreadyProcessed(`order_${orderId}`),
          true,
          `Order ${orderId} must be processed`
        );
      }

      // Queue of unprocessed must now be completely empty
      const finalUnprocessed = await testStorage.getUnprocessedPayloads();
      assert.strictEqual(finalUnprocessed.length, 0, "Unprocessed queue must be 0 after recovery");
    });
  });

  // ── TEST SUITE 6: POLYMORPHIC PAYLOAD VARIATIONS (NUMERIC VS STRING, BOOKING VS RESERVATION) ──
  describe("Suite 6: Polymorphic Concurrency (Numeric OrderId, case variation, Booking vs Reservation)", () => {
    it("deduplicates across 50 concurrent deliveries using heterogeneous payload field casing and types", async () => {
      const orderNum = 987654321;
      const variations = [
        // Variation 1: standard reservation.OrderId string
        () => ({ reservation: { OrderId: String(orderNum), Price: 100 } }),
        // Variation 2: reservation.OrderId number
        () => ({ reservation: { OrderId: orderNum, Price: 100 } }),
        // Variation 3: Booking.OrderId string
        () => ({ Booking: { OrderId: String(orderNum), Price: 100 } }),
        // Variation 4: booking.booking_id
        () => ({ booking: { booking_id: orderNum, Price: 100 } }),
        // Variation 5: root orderId
        () => ({ orderId: String(orderNum), Price: 100 })
      ];

      let acquired = 0;
      let deduped = 0;

      const promises = Array.from({ length: 50 }, async (_, i) => {
        const payloadGenerator = variations[i % variations.length];
        const payload = payloadGenerator();

        const rawId = await testStorage.recordRawPayload({
          source: i % 2 === 0 ? "webhook" : "polling",
          endpoint: "BookingCreate",
          payload
        });

        const keys = testStorage.deriveKeys(payload);
        const claim = await testStorage.claimForProcessing(keys.idempotencyKey, rawId, keys.orderId);

        if (claim.shouldProcess) {
          acquired++;
          await new Promise((r) => setTimeout(r, 10));
          await claim.release({ normalizedOrderId: keys.orderId });
        } else {
          deduped++;
        }
      });

      await Promise.all(promises);

      assert.strictEqual(acquired, 1, "Polymorphic representations of the same order must yield exactly 1 lock");
      assert.strictEqual(deduped, 49, "All 49 other polymorphic variations must be deduplicated");
      assert.strictEqual(await testStorage.isAlreadyProcessed(`order_${orderNum}`), true);
    });
  });

  // ── TEST SUITE 7: ULTRA-CONCURRENCY (100 SIMULTANEOUS REQUESTS) ─────────────
  describe("Suite 7: Ultra-Concurrency Burst (100 Simultaneous Requests)", () => {
    it("survives 100 simultaneous concurrent deliveries of the same booking with 0 duplicate IDs and 0 file corruption", async () => {
      const ultraOrderId = `ULTRA-BURST-${Date.now()}`;
      let acquired = 0;
      let deduped = 0;

      const promises = Array.from({ length: 100 }, async (_, i) => {
        const payload = {
          OrderId: ultraOrderId,
          Index: i,
          Timestamp: Date.now()
        };

        const rawId = await testStorage.recordRawPayload({
          source: i % 2 === 0 ? "webhook" : "polling",
          endpoint: "BookingCreate",
          payload
        });

        const keys = testStorage.deriveKeys(payload);
        const claim = await testStorage.claimForProcessing(keys.idempotencyKey, rawId, keys.orderId);

        if (claim.shouldProcess) {
          acquired++;
          await new Promise((r) => setTimeout(r, 20));
          await claim.release({ ultraSuccess: true });
        } else {
          deduped++;
        }
      });

      await Promise.all(promises);

      assert.strictEqual(acquired, 1, "Ultra concurrency of 100 requests must yield exactly 1 processing lock");
      assert.strictEqual(deduped, 99, "Exactly 99 requests must be deduplicated");
      assert.strictEqual(await testStorage.getRawPayloadCount(), 100, "All 100 raw payloads must be stored cleanly");
      assert.strictEqual(await testStorage.isAlreadyProcessed(`order_${ultraOrderId}`), true);
    });
  });
});
