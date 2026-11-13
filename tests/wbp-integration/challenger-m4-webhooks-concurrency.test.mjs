/**
 * tests/wbp-integration/challenger-m4-webhooks-concurrency.test.mjs
 *
 * Challenger 1: Webhooks & Concurrency Stress Test Suite (Milestone 4).
 *
 * Adversarial empirical verification of:
 * 1. Pre & post-flight database integrity guard (verifies baseline SHA-256 7e94a217... untouched).
 * 2. Timing-safe secret validation & rejection under concurrent bursts (invalid, empty, mismatched secrets).
 * 3. High-concurrency deduplication: 25 simultaneous webhook payloads with duplicate order IDs (0 duplicate reservations created, 100% audit durability).
 * 4. Fair-share allocation distribution across all 19 Soho flats under peak turnover (15 successive bookings on same dates, pairwise distinct flats, 0 clustering).
 * 5. Inventory exhaustion & 20th booking quarantine routing (OVERBOOKING fail-safe, 0 overbooking in reservations).
 *
 * Strictly adheres to AGENTS.md:
 * - Runs EXCLUSIVELY this targeted test.
 * - Test isolation: DATABASE_URL unset, DATA_FILE in os.tmpdir(), NODE_ENV="test".
 * - Ephemeral port allocation and clean process tree termination.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");

import {
  createWbpCallbackRouter,
  verifyWbpCallbackAuth,
  sanitizeCardDataInMemory
} from "../../artifacts/api-server/wbp/callbacks.mjs";

import {
  allocateFairShareFlat,
  calculateFairShareStats,
  processIncomingOTA,
  normalizeOtaBooking,
  routeToQuarantine
} from "../../artifacts/api-server/wbp/inbox.mjs";

import {
  CORPFLATS_19_FLATS,
  getCanonicalFlats,
  calculateCanonicalAvailability
} from "../../artifacts/api-server/wbp/availability.mjs";

import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { WBP_MODES } from "../../artifacts/api-server/wbp/config.mjs";

// Helper: dynamic available TCP port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// Helper: compute file hash and metadata
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
}

// Helper: kill process tree cleanly across platforms
function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch (_) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

// Helper: poll until HTTP server is responsive
async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms`);
}

describe("Challenger 1: Webhooks & Concurrency Stress Test Suite (Milestone 4)", () => {
  let initialDbMeta;
  let tmpDir;
  let tmpDbPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;
  const SHARED_SECRET = "stress_test_secret_m4_challenge_2026";

  before(async () => {
    // 1. Capture real baseline database metadata
    assert.ok(fs.existsSync(prodDbPath), "Real data/database.json must exist");
    initialDbMeta = getFileMetadata(prodDbPath);
    assert.ok(initialDbMeta.size > 0, "Real database must not be empty");
    assert.ok(
      initialDbMeta.hash.startsWith("7e94a217"),
      `Expected baseline hash starting with 7e94a217..., got: ${initialDbMeta.hash}`
    );

    // 2. Setup completely isolated temp directory in os.tmpdir()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "challenger-m4-wbp-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Clean initial DB state with canonical 19 flats and empty reservations
    const initialDb = {
      settings: {
        wbp_integration_mode: "auto",
        wbp: {
          mode: "auto",
          enabled: true,
          apiKey: "test-m4-chal-key",
          propertyId: "test-m4-chal-prop"
        }
      },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      roomBlocks: [],
      serviceOrders: [],
      wbpQuarantine: [],
      wbpInbox: []
    };
    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    // 3. Allocate ephemeral port and spawn demo-server
    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = { ...process.env };
    delete spawnEnv.DATABASE_URL;
    spawnEnv.PORT = String(serverPort);
    spawnEnv.DATA_FILE = tmpDbPath;
    spawnEnv.DATABASE_FILE = tmpDbPath;
    spawnEnv.AUDIT_LOG_FILE = path.join(tmpDir, "audit_logs.jsonl");
    spawnEnv.NODE_ENV = "test";
    spawnEnv.WBP_SHARED_SECRET = SHARED_SECRET;
    spawnEnv.WBP_RAW_STORAGE_FILE = path.join(tmpDir, "wbp_raw_payloads.jsonl");
    spawnEnv.WBP_IDEMPOTENCY_FILE = path.join(tmpDir, "wbp_idempotency.json");
    spawnEnv.WBP_INTEGRATION_MODE = "auto";

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    await waitForServer(serverBaseUrl);
  });

  after(() => {
    // 1. Cleanly terminate server process tree
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }

    // 2. Clean temporary directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    // 3. Assert real data/database.json baseline integrity is 100% untouched
    const postDbMeta = getFileMetadata(prodDbPath);
    assert.equal(
      postDbMeta.hash,
      initialDbMeta.hash,
      "CRITICAL INTEGRITY VIOLATION: Real data/database.json SHA-256 hash was modified during challenger tests!"
    );
    assert.equal(
      postDbMeta.mtimeMs,
      initialDbMeta.mtimeMs,
      "CRITICAL INTEGRITY VIOLATION: Real data/database.json mtime was modified during challenger tests!"
    );
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. TIMING-SAFE SECRET VALIDATION UNDER CONCURRENT BURSTS
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 1: Timing-Safe Secret Validation Under Concurrent Bursts", () => {
    it("verifyWbpCallbackAuth performs strict constant-time equality and rejects empty/malicious secrets", () => {
      // Valid secret match
      assert.equal(verifyWbpCallbackAuth(SHARED_SECRET, SHARED_SECRET), true);

      // Invalids, empty, and partial variations
      assert.equal(verifyWbpCallbackAuth("", SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth(null, SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth(undefined, SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth("wrong_secret_123", SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth(SHARED_SECRET.substring(0, 10), SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth(SHARED_SECRET + "_extra", SHARED_SECRET), false);
      assert.equal(verifyWbpCallbackAuth(SHARED_SECRET.toUpperCase(), SHARED_SECRET), false);
    });

    it("concurrent burst of 30 unauthorized webhook deliveries are rejected with zero reservations created", async () => {
      const badSecrets = [
        "", // empty secret
        "wrong_token_attack_999", // wrong secret
        "invalid_mismatched_key", // mismatched secret
        "stress_test_secret_m4_challenge_2026_suffix", // extra byte timing probe
        "stress_test_secret" // truncated prefix
      ];

      // Dispatch 30 concurrent unauthorized requests
      const unauthorizedRequests = Array.from({ length: 30 }, async (_, i) => {
        const candidateSecret = badSecrets[i % badSecrets.length];
        const payload = {
          shared_secret: candidateSecret,
          reservation: {
            OrderId: `UNAUTH-ATTACK-${i}-${Date.now()}`,
            Channel: "booking",
            TotalPrice: 500,
            Rooms: [{ StartDate: "2026-11-10", EndDate: "2026-11-12", Adults: 1 }]
          }
        };

        const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const status = res.status;
        let body = {};
        try {
          body = await res.json();
        } catch (_) {}

        // WBP Protocol Specification or HTTP status: must be rejected with 401/403 or ErrorCode 1001 (Invalid credentials)
        const isRejected =
          status === 401 ||
          status === 403 ||
          (status === 200 && (body.ErrorCode === 1001 || body.Error === "Invalid credentials"));

        return { index: i, isRejected, status, body };
      });

      const results = await Promise.all(unauthorizedRequests);

      // Verify all 30 were rejected
      for (const r of results) {
        assert.ok(
          r.isRejected,
          `Request ${r.index} with bad secret must be rejected. Got status ${r.status}, body: ${JSON.stringify(r.body)}`
        );
      }

      // Verify 0 reservations were created in the database
      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const unauthReservations = (dbContent.reservations || []).filter(
        (res) => res.externalOrderId && res.externalOrderId.includes("UNAUTH-ATTACK")
      );
      assert.equal(
        unauthReservations.length,
        0,
        "Zero unauthorized reservations must exist in the database!"
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. CONCURRENCY & DEDUPLICATION STRESS (25 CONCURRENT WEBHOOK PAYLOADS)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 2: Concurrency & Deduplication Stress (25 Concurrent Inbound Webhooks)", () => {
    it("ingests 25 simultaneous concurrent deliveries across 5 distinct orders: guarantees exactly 5 reservations and 0 duplicates", async () => {
      // 5 unique order IDs
      const uniqueOrderIds = [
        `ORD-BURST-A-${Date.now()}`,
        `ORD-BURST-B-${Date.now()}`,
        `ORD-BURST-C-${Date.now()}`,
        `ORD-BURST-D-${Date.now()}`,
        `ORD-BURST-E-${Date.now()}`
      ];

      // Each of the 5 orders is fired 5 times simultaneously = 25 total concurrent HTTP requests
      const deliveries = [];
      let deliveryIndex = 0;

      for (const orderId of uniqueOrderIds) {
        for (let dup = 0; dup < 5; dup++) {
          const idx = deliveryIndex++;
          const payload = {
            shared_secret: SHARED_SECRET,
            reservation: {
              OrderId: orderId,
              Channel: idx % 2 === 0 ? "booking" : "airbnb",
              PaymentCollect: idx % 2 === 0 ? "Channel" : "Property",
              TotalPrice: 650.0 + idx * 10,
              Customers: [
                {
                  CustomerFName: `Guest_${orderId}`,
                  CustomerLName: `Repeat_${dup}`,
                  CustomerEmail: `guest_${dup}@example.com`,
                  CustomerTelephone: "2299881122"
                }
              ],
              Rooms: [
                {
                  StartDate: "2026-11-15",
                  EndDate: "2026-11-17",
                  Adults: 2,
                  RateId: "com_cafe"
                }
              ]
            }
          };

          deliveries.push(async () => {
            const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            assert.equal(res.status, 200, `Webhook delivery ${idx} must return HTTP 200`);
            const data = await res.json();
            return { idx, orderId, dup, data };
          });
        }
      }

      // Fire all 25 requests simultaneously
      const results = await Promise.all(deliveries.map((fn) => fn()));
      assert.equal(results.length, 25, "All 25 concurrent webhook requests must resolve");

      // Give a tiny tick for async disk flush
      await new Promise((r) => setTimeout(r, 400));

      // Read database state from disk
      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const createdReservations = (dbContent.reservations || []).filter(
        (r) => r.externalOrderId && uniqueOrderIds.includes(r.externalOrderId)
      );

      // ── VERIFICATION ASSERTIONS ──
      // 1. Exactly 5 reservations created (1 per unique OrderId)
      assert.equal(
        createdReservations.length,
        5,
        `Expected exactly 5 reservations created for 5 unique order IDs, but found ${createdReservations.length}`
      );

      // 2. Exactly 0 duplicate reservations created
      const foundOrderIds = createdReservations.map((r) => r.externalOrderId);
      const uniqueFound = new Set(foundOrderIds);
      assert.equal(
        uniqueFound.size,
        5,
        `All 5 created reservations must have unique externalOrderIds, but got duplicates: ${JSON.stringify(foundOrderIds)}`
      );

      // 3. Exactly 0 duplicate internal reservation IDs
      const resIds = createdReservations.map((r) => r.id);
      assert.equal(
        new Set(resIds).size,
        5,
        `Reservation primary keys must be strictly unique, got: ${JSON.stringify(resIds)}`
      );

      // 4. Verify durable raw audit storage captured all 25 deliveries (zero audit loss)
      const rawStoragePath = path.join(tmpDir, "wbp_raw_payloads.jsonl");
      assert.ok(fs.existsSync(rawStoragePath), "Raw storage file must exist");
      const rawLines = fs
        .readFileSync(rawStoragePath, "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l));

      const burstRawItems = rawLines.filter(
        (item) => item.orderId && uniqueOrderIds.includes(item.orderId)
      );
      assert.equal(
        burstRawItems.length,
        25,
        `Audit storage must preserve all 25 raw payloads, but found ${burstRawItems.length}`
      );

      // 5. Verify idempotency cache marks all 5 orders as processed
      const idemStoragePath = path.join(tmpDir, "wbp_idempotency.json");
      assert.ok(fs.existsSync(idemStoragePath), "Idempotency tracking file must exist");
      const idemContent = JSON.parse(fs.readFileSync(idemStoragePath, "utf8"));

      for (const orderId of uniqueOrderIds) {
        const record = idemContent[`order_${orderId}`];
        assert.ok(record, `Order ${orderId} must have an entry in idempotency map`);
        assert.equal(record.status, "processed", `Order ${orderId} must be marked as processed`);
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. FAIR-SHARE ALLOCATION DISTRIBUTION (15 SUCCESSIVE BOOKINGS)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 3: Fair-Share Allocation Distribution Under Peak Turnover", () => {
    it("simulates 15 successive booking creations on the same dates: verifies pairwise distinct flat allocation and 0 clustering", async () => {
      // Common stay dates for peak turnover
      const checkinDate = "2026-11-20";
      const checkoutDate = "2026-11-23"; // 3 nights

      const allocatedFlats = [];

      for (let i = 1; i <= 15; i++) {
        const orderId = `SUCCESSIVE-FAIR-${i}-${Date.now()}`;
        const payload = {
          shared_secret: SHARED_SECRET,
          reservation: {
            OrderId: orderId,
            Channel: "booking",
            PaymentCollect: "Channel",
            TotalPrice: 720.0,
            Customers: [
              {
                CustomerFName: `Guest_Successive`,
                CustomerLName: `#${i}`,
                CustomerEmail: `guest_${i}@turnover.com`,
                CustomerTelephone: `229977000${i.toString().padStart(2, "0")}`
              }
            ],
            Rooms: [
              {
                StartDate: checkinDate,
                EndDate: "2026-11-22", // inclusive end date = checkout on 2026-11-23
                Adults: 2,
                RateId: "com_cafe"
              }
            ]
          }
        };

        const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        assert.equal(res.status, 200, `Successive booking #${i} must succeed`);
      }

      // Wait for disk sync
      await new Promise((r) => setTimeout(r, 300));

      // Read reservations from disk
      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const turnoverReservations = (dbContent.reservations || []).filter(
        (r) => r.externalOrderId && r.externalOrderId.includes("SUCCESSIVE-FAIR-")
      );

      assert.equal(turnoverReservations.length, 15, "Exactly 15 successive reservations must be created");

      for (const r of turnoverReservations) {
        assert.ok(r.flatNumber, `Reservation ${r.code} must have an allocated flatNumber`);
        allocatedFlats.push(String(r.flatNumber));
      }

      // ── FAIR-SHARE DISTRIBUTION ASSERTIONS ──
      // 1. All 15 allocated flats are valid Soho Residence canonical flats
      const canonicalNumbers = CORPFLATS_19_FLATS.map((f) => String(f.number));
      for (const fn of allocatedFlats) {
        assert.ok(
          canonicalNumbers.includes(fn),
          `Allocated flat '${fn}' must belong to CORPFLATS_19_FLATS`
        );
      }

      // 2. Exactly 15 distinct flats allocated (ZERO duplicate allocations on overlapping dates)
      const uniqueAllocated = new Set(allocatedFlats);
      assert.equal(
        uniqueAllocated.size,
        15,
        `Expected exactly 15 distinct flats allocated across 15 bookings on the same dates, but got ${uniqueAllocated.size}. Flats: ${JSON.stringify(allocatedFlats)}`
      );

      // 3. Verify zero clustering: no flat was allocated more than once on the same stay dates
      const counts = {};
      for (const fn of allocatedFlats) {
        counts[fn] = (counts[fn] || 0) + 1;
        assert.equal(
          counts[fn],
          1,
          `Flat ${fn} was allocated ${counts[fn]} times on the exact same dates — OVERBOOKING / CLUSTERING DETECTED!`
        );
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. CAPACITY EXHAUSTION & 20TH BOOKING QUARANTINE ROUTING (OVERBOOKING)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 4: Capacity Exhaustion & 20th Booking Quarantine Routing", () => {
    it("fills the remaining 4 flats (total 19 flats full) and routes 20th booking cleanly to Quarantine with reason OVERBOOKING", async () => {
      const checkinDate = "2026-11-20";
      const checkoutDate = "2026-11-23";

      // 1. Book flats 16, 17, 18, 19 for the same dates to reach 100% capacity (19 flats)
      for (let i = 16; i <= 19; i++) {
        const orderId = `FILL-CAPACITY-${i}-${Date.now()}`;
        const payload = {
          shared_secret: SHARED_SECRET,
          reservation: {
            OrderId: orderId,
            Channel: "airbnb",
            PaymentCollect: "Channel",
            TotalPrice: 800.0,
            Customers: [
              {
                CustomerFName: `Guest_Fill`,
                CustomerLName: `#${i}`,
                CustomerEmail: `fill_${i}@hotel.com`,
                CustomerTelephone: "2299881122"
              }
            ],
            Rooms: [
              {
                StartDate: checkinDate,
                EndDate: "2026-11-22",
                Adults: 2,
                RateId: "sem_cafe"
              }
            ]
          }
        };

        const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        assert.equal(res.status, 200);
      }

      await new Promise((r) => setTimeout(r, 300));

      // Verify that all 19 flats are now full for these dates
      const dbAfter19 = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const allActiveOnDates = (dbAfter19.reservations || []).filter(
        (r) =>
          r.status === "ativa" &&
          r.checkinDate === checkinDate &&
          r.checkoutDate === checkoutDate
      );
      assert.equal(
        allActiveOnDates.length,
        19,
        `All 19 flats must be occupied for dates ${checkinDate} to ${checkoutDate}, found ${allActiveOnDates.length}`
      );

      // Verify canonical availability reports 0 free units
      const avail = calculateCanonicalAvailability(checkinDate, checkoutDate, { db: dbAfter19 });
      assert.equal(avail.minAvailable, 0, "Availability must report 0 free flats when all 19 are occupied");

      // 2. Send the 20th booking on the same dates (overbooking attempt)
      const overbookingOrderId = `OVERBOOK-BOOKING-20-${Date.now()}`;
      const overbookingPayload = {
        shared_secret: SHARED_SECRET,
        reservation: {
          OrderId: overbookingOrderId,
          Channel: "booking",
          PaymentCollect: "Channel",
          TotalPrice: 950.0,
          Customers: [
            {
              CustomerFName: "Claudio",
              CustomerLName: "Overbooked",
              CustomerEmail: "claudio@overbooked.com",
              CustomerTelephone: "2299443322"
            }
          ],
          Rooms: [
            {
              StartDate: checkinDate,
              EndDate: "2026-11-22",
              Adults: 2,
              RateId: "com_cafe"
            }
          ]
        }
      };

      const overbookRes = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overbookingPayload)
      });
      assert.equal(overbookRes.status, 200, "Webhook endpoint returns 200 acknowledgment");

      await new Promise((r) => setTimeout(r, 400));

      // 3. Inspect Quarantine via HTTP endpoint GET /api/wbp/quarantine
      const quarRes = await fetch(`${serverBaseUrl}/api/wbp/quarantine`);
      assert.equal(quarRes.status, 200);
      const quarData = await quarRes.json();
      assert.equal(quarData.success, true);

      const targetQuarantine = quarData.items.find(
        (q) => q.bookingId === overbookingOrderId || q.externalOrderId === overbookingOrderId
      );
      assert.ok(
        targetQuarantine,
        `The 20th booking (${overbookingOrderId}) must be present in db.wbpQuarantine!`
      );
      assert.equal(
        targetQuarantine.reason,
        "OVERBOOKING",
        `Quarantine reason must be 'OVERBOOKING', got: ${targetQuarantine.reason}`
      );
      assert.equal(
        targetQuarantine.status,
        "pending",
        "Quarantine item status must be 'pending'"
      );

      // 4. Inspect db.reservations: verify ZERO overbooked reservations were added
      const dbFinal = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const overbookedInReservations = (dbFinal.reservations || []).filter(
        (r) => r.externalOrderId === overbookingOrderId
      );
      assert.equal(
        overbookedInReservations.length,
        0,
        "The 20th booking must NEVER be created in db.reservations when flats are exhausted!"
      );

      // Active reservations for those dates must remain exactly 19
      const finalActiveOnDates = (dbFinal.reservations || []).filter(
        (r) =>
          r.status === "ativa" &&
          r.checkinDate === checkinDate &&
          r.checkoutDate === checkoutDate
      );
      assert.equal(
        finalActiveOnDates.length,
        19,
        "Active reservations count must remain exactly 19 (no overbooking permitted)"
      );
    });
  });
});
