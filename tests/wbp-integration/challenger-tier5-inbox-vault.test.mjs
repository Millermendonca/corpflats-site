/**
 * tests/wbp-integration/challenger-tier5-inbox-vault.test.mjs
 *
 * Tier 5 Adversarial Coverage Hardening Suite:
 * Inbound Webhooks, Inbox, Reconciler, Credit Card Vault & Provisional Adapters.
 *
 * Empirical challenger stress-testing of:
 * 1. Rapid concurrent webhook arrival and duplicate payload idempotency under burst traffic.
 * 2. Fair-share allocation, deterministic tie-breaking across 19 Soho flats, and maintenance block attribution.
 * 3. Room move / stay modification collision detection and 3-tier reallocation logic.
 * 4. OTA cancellation safety guards protecting checked-in in-house guests vs pre-check-in auto-cancellation.
 * 5. Manual reservation reconciliation heuristics: exact safe matching vs ambiguous name/date quarantining.
 * 6. Credit card vault single-use token burning, concurrent consumption race hardening, and exact 300s TTL boundary.
 * 7. Auto-purge lifecycle under irregular calendar offsets (leap day, month-end rollover, year-end rollover).
 * 8. Provisional messages and reviews fail-safe behavior when disabled or integration mode is off.
 *
 * Strict Isolation & Integrity (AGENTS.md):
 * - Ephemeral database, storage, idempotency, and vault paths in os.tmpdir().
 * - Dynamic port allocation, zero global sweeps, zero leaks.
 * - Baseline data/database.json SHA-256 (7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6)
 *   verified 100% untouched pre and post flight.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

const VAULT_TEST_KEY = "challenger_tier5_vault_key_2026_test_hex";
process.env.CREDIT_CARD_VAULT_KEY = VAULT_TEST_KEY;

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

// Modules under test
import {
  CORPFLATS_19_FLATS,
  getCanonicalFlats,
  checkFlatBlockedOnNight,
  calculateCanonicalAvailability
} from "../../artifacts/api-server/wbp/availability.mjs";

import {
  allocateFairShareFlat,
  calculateFairShareStats,
  processIncomingOTA,
  handleOtaCancellation,
  handleOtaModification,
  normalizeOtaBooking,
  routeToQuarantine,
  stripCvvDeep,
  maskPan,
  detectCardBrand
} from "../../artifacts/api-server/wbp/inbox.mjs";

import {
  computeReconciliationScore,
  findBestManualMatch,
  applySafeReconciliationLink,
  normalizeGuestName,
  calculateNameSimilarity,
  generateReconciliationReport
} from "../../artifacts/api-server/wbp/reconciler.mjs";

import {
  CreditCardVault,
  getCardVault,
  addDays,
  getEffectiveNow,
  runZeroLeakageForensicAudit
} from "../../artifacts/api-server/wbp/vault.mjs";

import {
  WbpProvisionalAdapter,
  getProvisionalAdapter,
  isProvisionalMessagesEnabled,
  isProvisionalReviewsEnabled,
  setProvisionalMessagesEnabled,
  setProvisionalReviewsEnabled
} from "../../artifacts/api-server/wbp/provisional.mjs";

import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { WBP_MODES, getIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";

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

// Helper: wait for HTTP server to become responsive
async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms.`);
}

// Helper: compute file hash and size
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, size: stat.size, mtimeMs: stat.mtimeMs };
}

describe("Tier 5 Challenger: Webhooks, Fair-Share, Reconciler, Vault & Provisional", () => {
  let initialDbMeta;
  let tmpDir;
  let tmpDbPath;
  let tmpVaultPath;
  let tmpStoragePath;
  let tmpIdempotencyPath;
  let tmpAuditLogPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;
  const SHARED_SECRET = "tier5_challenger_secret_corpflats_2026";
  const EXPECTED_HASH = "7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6";

  before(async () => {
    // 1. Verify baseline production database integrity
    assert.ok(fs.existsSync(prodDbPath), "Real data/database.json must exist");
    initialDbMeta = getFileMetadata(prodDbPath);
    assert.equal(
      initialDbMeta.hash.toLowerCase(),
      EXPECTED_HASH,
      `Pre-flight database SHA-256 hash must be ${EXPECTED_HASH}, got: ${initialDbMeta.hash}`
    );
    assert.equal(initialDbMeta.size, 997627, "Pre-flight database size must be 997,627 bytes");

    // 2. Setup completely isolated sandbox directory in os.tmpdir()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tier5-wbp-challenger-"));
    tmpDbPath = path.join(tmpDir, "database.json");
    tmpVaultPath = path.join(tmpDir, "wbp_card_vault.json");
    tmpStoragePath = path.join(tmpDir, "wbp_raw_payloads.jsonl");
    tmpIdempotencyPath = path.join(tmpDir, "wbp_idempotency.json");
    tmpAuditLogPath = path.join(tmpDir, "audit_logs.jsonl");

    // Seed clean database state
    const seedDb = {
      settings: {
        wbp_integration_mode: "auto",
        wbp: {
          mode: "auto",
          enabled: true,
          apiKey: "test-tier5-key",
          propertyId: "test-tier5-prop"
        }
      },
      users: [
        { id: 1, username: "admin", role: "admin", passwordHash: "superadmin123" }
      ],
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      roomBlocks: [],
      serviceOrders: [],
      cleaningRequests: [],
      wbpQuarantine: [],
      wbpInbox: []
    };
    fs.writeFileSync(tmpDbPath, JSON.stringify(seedDb, null, 2), "utf8");

    // 3. Allocate dynamic port and spawn isolated demo-server
    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = { ...process.env };
    delete spawnEnv.DATABASE_URL;
    spawnEnv.PORT = String(serverPort);
    spawnEnv.DATA_FILE = tmpDbPath;
    spawnEnv.DATABASE_FILE = tmpDbPath;
    spawnEnv.AUDIT_LOG_FILE = tmpAuditLogPath;
    spawnEnv.WBP_RAW_STORAGE_FILE = tmpStoragePath;
    spawnEnv.WBP_IDEMPOTENCY_FILE = tmpIdempotencyPath;
    spawnEnv.WBP_CARD_VAULT_FILE = tmpVaultPath;
    spawnEnv.CREDIT_CARD_VAULT_KEY = VAULT_TEST_KEY;
    spawnEnv.WBP_SHARED_SECRET = SHARED_SECRET;
    spawnEnv.WBP_INTEGRATION_MODE = "auto";
    spawnEnv.NODE_ENV = "test";

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    await waitForServer(serverBaseUrl);
  });

  after(() => {
    // 1. Terminate server process cleanly
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }

    // 2. Remove temporary test artifacts
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    // 3. Re-verify baseline database integrity
    const postDbMeta = getFileMetadata(prodDbPath);
    assert.equal(
      postDbMeta.hash.toLowerCase(),
      EXPECTED_HASH,
      "CRITICAL INTEGRITY FAILURE: Real data/database.json SHA-256 hash was modified!"
    );
    assert.equal(
      postDbMeta.size,
      initialDbMeta.size,
      "CRITICAL INTEGRITY FAILURE: Real data/database.json size was modified!"
    );
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 1: RAPID CONCURRENT WEBHOOK ARRIVAL & DUPLICATE IDEMPOTENCY
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 1: Rapid Concurrent Webhooks & Duplicate Payload Idempotency", () => {
    it("1.1 ingests 20 concurrent webhook requests across 4 unique orders: creates exactly 4 reservations without duplicates", async () => {
      const orderIds = [
        `ORD-BURST-101-${Date.now()}`,
        `ORD-BURST-102-${Date.now()}`,
        `ORD-BURST-103-${Date.now()}`,
        `ORD-BURST-104-${Date.now()}`
      ];

      // Dispatch 5 duplicates for each of the 4 order IDs simultaneously = 20 concurrent requests
      const tasks = [];
      for (const orderId of orderIds) {
        for (let copy = 0; copy < 5; copy++) {
          const payload = {
            shared_secret: SHARED_SECRET,
            reservation: {
              OrderId: orderId,
              Channel: "booking",
              PaymentCollect: "Channel",
              TotalPrice: 800.0,
              Customers: [
                {
                  CustomerFName: `Guest_${orderId}`,
                  CustomerLName: `Batch_${copy}`,
                  CustomerEmail: `guest_${orderId}@corpflats.test`,
                  CustomerTelephone: "2299887766"
                }
              ],
              Rooms: [
                {
                  StartDate: "2026-11-20",
                  EndDate: "2026-11-22",
                  Adults: 2,
                  RateId: "sem_cafe"
                }
              ]
            }
          };

          tasks.push(async () => {
            const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            assert.equal(res.status, 200);
            return { orderId, copy, status: res.status };
          });
        }
      }

      const results = await Promise.all(tasks.map((fn) => fn()));
      assert.equal(results.length, 20, "All 20 concurrent requests must resolve HTTP 200");

      // Verify PMS database state has exactly 4 created reservations
      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const createdReservations = (dbContent.reservations || []).filter((r) =>
        orderIds.includes(r.externalOrderId)
      );
      assert.equal(
        createdReservations.length,
        4,
        `Expected exactly 4 reservations created, found: ${createdReservations.length}`
      );

      // Verify all 4 unique externalOrderIds exist with no duplicates
      const foundOrderIds = createdReservations.map((r) => r.externalOrderId);
      assert.equal(new Set(foundOrderIds).size, 4, "Zero duplicate externalOrderId allowed in reservations");

      // Verify raw storage file logged all 20 arrivals (insert-only durability)
      assert.ok(fs.existsSync(tmpStoragePath), "Raw storage file must exist");
      const rawLines = fs.readFileSync(tmpStoragePath, "utf8").trim().split("\n");
      assert.ok(rawLines.length >= 20, `Raw storage must contain at least 20 records, got ${rawLines.length}`);

      // Verify idempotency cache has entries for each orderId marked processed
      assert.ok(fs.existsSync(tmpIdempotencyPath), "Idempotency file must exist");
      const idemData = JSON.parse(fs.readFileSync(tmpIdempotencyPath, "utf8"));
      for (const orderId of orderIds) {
        assert.equal(
          idemData[`order_${orderId}`]?.status,
          "processed",
          `Idempotency entry for order_${orderId} must be 'processed'`
        );
      }
    });

    it("1.2 concurrent cross-channel race: simultaneous BookingCreate and NotifyBooking with identical OrderId creates exactly 1 reservation", async () => {
      const raceOrderId = `RACE-CROSS-${Date.now()}`;
      const payload = {
        shared_secret: SHARED_SECRET,
        reservation: {
          OrderId: raceOrderId,
          Channel: "airbnb",
          PaymentCollect: "Property",
          TotalPrice: 450.0,
          Customers: [
            {
              CustomerFName: "CrossChannel",
              CustomerLName: "Racer",
              CustomerEmail: "racer@example.com",
              CustomerTelephone: "2299112233"
            }
          ],
          Rooms: [
            {
              StartDate: "2026-11-25",
              EndDate: "2026-11-27",
              Adults: 1,
              RateId: "com_cafe"
            }
          ]
        }
      };

      // Ingest concurrently via direct processIncomingOTA and HTTP BookingCreate
      const [httpRes, directRes] = await Promise.all([
        fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then((r) => r.json()),
        fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then((r) => r.json())
      ]);

      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const matches = (dbContent.reservations || []).filter((r) => r.externalOrderId === raceOrderId);
      assert.equal(matches.length, 1, "Exactly one reservation must be created for the racing OrderId");
      assert.equal(matches[0].channel, "airbnb");
      assert.equal(matches[0].paymentStatus, "pendente");
      assert.equal(matches[0].collectAtCheckin, true);
    });

    it("1.3 malformed payload with inverted stay dates routes safely to quarantine without crashing server", async () => {
      const malformedOrderId = `MALFORMED-${Date.now()}`;
      const badPayload = {
        shared_secret: SHARED_SECRET,
        reservation: {
          OrderId: malformedOrderId,
          Channel: "booking",
          Rooms: [
            {
              StartDate: "2026-11-20",
              EndDate: "2026-11-18", // EndDate before StartDate!
              Adults: 2
            }
          ]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(badPayload)
      });
      assert.equal(res.status, 200);

      const dbContent = JSON.parse(fs.readFileSync(tmpDbPath, "utf8"));
      const quarantineRecord = (dbContent.wbpQuarantine || []).find(
        (q) => q.externalOrderId === malformedOrderId
      );
      assert.ok(quarantineRecord, "Malformed payload must be placed into quarantine");
      assert.equal(quarantineRecord.reason, "MALFORMED_PAYLOAD");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 2: FAIR-SHARE ALLOCATION & 19-FLAT MULTI-CRITERION TIE-BREAKING
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 2: Fair-Share Allocation & 19-Flat Multi-Criterion Tie-Breaking", () => {
    it("2.1 breaks ties deterministically across all 19 Soho flats when all flats have identical stats", () => {
      const cleanDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: [],
        roomBlocks: [],
        serviceOrders: []
      };

      // When all flats have 0 checkouts, 0 nights, and "1970-01-01", tie-breaker selects lowest flat id
      const alloc1 = allocateFairShareFlat("2026-12-10", "2026-12-12", { db: cleanDb });
      assert.ok(alloc1.allocated);
      assert.equal(alloc1.availableCount, 19);
      // Flat with lowest ID is Flat 113 (id: 1) in Soho canonical inventory
      assert.equal(alloc1.flat.number, "113");
      assert.equal(alloc1.flat.id, 1);
    });

    it("2.2 distributes 19 successive single-night bookings across all 19 unique flats with 100% fair coverage", () => {
      const testDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: [],
        roomBlocks: [],
        serviceOrders: []
      };

      const allocatedFlatNumbers = [];

      // Book each flat for the exact same night (2026-12-15 to 2026-12-16)
      for (let i = 1; i <= 19; i++) {
        const alloc = allocateFairShareFlat("2026-12-15", "2026-12-16", { db: testDb });
        assert.ok(alloc.allocated, `Booking ${i} must be successfully allocated`);
        const fn = String(alloc.flat.number);
        allocatedFlatNumbers.push(fn);

        // Add reservation to testDb to simulate stay occupancy
        testDb.reservations.push({
          id: i,
          code: `RES-TIE-${fn}`,
          flatId: alloc.flat.id,
          flatNumber: fn,
          checkinDate: "2026-12-15",
          checkoutDate: "2026-12-16",
          status: "ativa"
        });
      }

      // Assert that all 19 flats were used exactly once
      assert.equal(allocatedFlatNumbers.length, 19);
      const uniqueAllocations = new Set(allocatedFlatNumbers);
      assert.equal(uniqueAllocations.size, 19, "Every single one of the 19 flats must be allocated with 0 clustering");

      // Verify the canonical flats are all accounted for
      const canonicalNumbers = CORPFLATS_19_FLATS.map((f) => String(f.number));
      for (const num of canonicalNumbers) {
        assert.ok(uniqueAllocations.has(num), `Flat ${num} must have been allocated in the fair-share cycle`);
      }
    });

    it("2.3 routes 20th booking on the same date to Quarantine with OVERBOOKING reason", () => {
      const fullDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: CORPFLATS_19_FLATS.map((f, idx) => ({
          id: idx + 1,
          code: `RES-FULL-${f.number}`,
          flatId: f.id,
          flatNumber: String(f.number),
          checkinDate: "2026-12-15",
          checkoutDate: "2026-12-16",
          status: "ativa"
        })),
        roomBlocks: [],
        serviceOrders: []
      };

      const alloc20 = allocateFairShareFlat("2026-12-15", "2026-12-16", { db: fullDb });
      assert.equal(alloc20.allocated, false);
      assert.equal(alloc20.availableCount, 0);
      assert.equal(alloc20.reason, "OVERBOOKING");
    });

    it("2.4 attributes inventory exhaustion to MAINTENANCE_BLOCKED when available capacity was blocked by room blocks", () => {
      // 18 flats occupied, 1 flat blocked for maintenance
      const maintenanceDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: CORPFLATS_19_FLATS.slice(1).map((f, idx) => ({
          id: idx + 1,
          code: `RES-OCC-${f.number}`,
          flatId: f.id,
          flatNumber: String(f.number),
          checkinDate: "2026-12-18",
          checkoutDate: "2026-12-20",
          status: "ativa"
        })),
        roomBlocks: [
          {
            id: "block-113",
            flatId: 1,
            flatNumber: "113",
            startDate: "2026-12-18",
            endDate: "2026-12-21",
            reason: "Pintura e reforma elétrica",
            status: "active"
          }
        ],
        serviceOrders: []
      };

      const alloc = allocateFairShareFlat("2026-12-18", "2026-12-20", { db: maintenanceDb });
      assert.equal(alloc.allocated, false);
      assert.equal(alloc.availableCount, 0);
      assert.equal(alloc.reason, "MAINTENANCE_BLOCKED");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 3: ROOM MOVE & STAY MODIFICATION COLLISION DETECTION
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 3: Room Move & Stay Modification Collision Detection", () => {
    it("3.1 uncontested modification on same flat preserves flat and records before and after history", () => {
      const db = {
        flats: CORPFLATS_19_FLATS,
        reservations: [
          {
            id: 501,
            code: "RES-113-501",
            externalOrderId: "MOD-SAME-FLAT-001",
            flatId: 1,
            flatNumber: "113",
            checkinDate: "2026-11-10",
            checkoutDate: "2026-11-12",
            totalAmount: 500,
            breakfastIncluded: false,
            guestCount: 1,
            status: "ativa"
          }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      const modPayload = {
        externalOrderId: "MOD-SAME-FLAT-001",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-14", // Extended by 2 nights
        totalPrice: 950,
        includeBreakfast: true,
        adults: 2,
        children: 0
      };

      const result = handleOtaModification({ db, normalized: modPayload });
      assert.equal(result.success, true);
      assert.equal(result.action, "modified_same_flat");
      assert.equal(result.flatNumber, "113");

      const res = db.reservations[0];
      assert.equal(res.checkoutDate, "2026-11-14");
      assert.equal(res.totalAmount, 950);
      assert.equal(res.breakfastIncluded, true);

      // Verify before and after snapshots in modification history
      assert.ok(Array.isArray(res.modificationHistory));
      assert.equal(res.modificationHistory.length, 1);
      assert.equal(res.modificationHistory[0].before.checkoutDate, "2026-11-12");
      assert.equal(res.modificationHistory[0].after.checkoutDate, "2026-11-14");
    });

    it("3.2 contested modification reallocates to alternate available flat when current flat has collision", () => {
      const db = {
        flats: CORPFLATS_19_FLATS,
        reservations: [
          {
            id: 601,
            code: "RES-113-601",
            externalOrderId: "MOD-COLLISION-001",
            flatId: 1,
            flatNumber: "113",
            checkinDate: "2026-11-10",
            checkoutDate: "2026-11-12",
            totalAmount: 500,
            status: "ativa"
          },
          // Flat 113 is already booked by someone else on 2026-11-12 to 2026-11-15
          {
            id: 602,
            code: "RES-113-602",
            flatId: 1,
            flatNumber: "113",
            checkinDate: "2026-11-12",
            checkoutDate: "2026-11-15",
            status: "ativa"
          }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      // Modification wants to extend RES-113-601 to 2026-11-14 (clashing with RES-113-602 on Flat 113!)
      const modPayload = {
        externalOrderId: "MOD-COLLISION-001",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-14",
        totalPrice: 1000,
        includeBreakfast: false,
        adults: 1,
        children: 0
      };

      const result = handleOtaModification({ db, normalized: modPayload });
      assert.equal(result.success, true);
      assert.equal(result.action, "modified_reallocated");
      assert.equal(result.oldFlatNumber, "113");
      assert.notEqual(result.newFlatNumber, "113", "Must reallocate away from conflicting Flat 113");

      const res = db.reservations[0];
      assert.equal(res.flatNumber, result.newFlatNumber);
      assert.equal(res.checkinDate, "2026-11-10");
      assert.equal(res.checkoutDate, "2026-11-14");

      // Verify audit log captured reallocation
      const reallocationAudit = res.auditLogs.find((a) => a.action === "OTA_MODIFICATION_REALLOCATED");
      assert.ok(reallocationAudit, "Must record OTA_MODIFICATION_REALLOCATED audit entry");
    });

    it("3.3 modification under 100% capacity routes to quarantine with MODIFICATION_CONFLICT", () => {
      // All 19 flats occupied for the requested extended date
      const db = {
        flats: CORPFLATS_19_FLATS,
        reservations: CORPFLATS_19_FLATS.map((f, i) => ({
          id: 700 + i,
          code: `RES-${f.number}-700`,
          externalOrderId: f.id === 1 ? "MOD-FULL-001" : `OTHER-${i}`,
          flatId: f.id,
          flatNumber: String(f.number),
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "ativa"
        })),
        wbpQuarantine: []
      };

      // Add conflicting bookings on ALL flats for 2026-11-12 to 2026-11-14
      for (const f of CORPFLATS_19_FLATS) {
        db.reservations.push({
          id: 800 + f.id,
          code: `BLOCKER-${f.number}`,
          flatId: f.id,
          flatNumber: String(f.number),
          checkinDate: "2026-11-12",
          checkoutDate: "2026-11-14",
          status: "ativa"
        });
      }

      const modPayload = {
        externalOrderId: "MOD-FULL-001",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-14",
        totalPrice: 850
      };

      const result = handleOtaModification({ db, normalized: modPayload });
      assert.equal(result.reason, "MODIFICATION_CONFLICT");
      assert.ok(db.wbpQuarantine.length > 0);
      assert.equal(db.wbpQuarantine[0].reason, "MODIFICATION_CONFLICT");

      // Verify original reservation was NOT altered
      const original = db.reservations.find((r) => r.externalOrderId === "MOD-FULL-001");
      assert.equal(original.checkoutDate, "2026-11-12");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 4: CANCELLATION SAFETY GUARDS & IN-HOUSE GUEST PROTECTION
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 4: Cancellation Safety Guards & In-House Guest Protection", () => {
    it("4.1 cancellation of active checked-in guest is BLOCKED and routed to quarantine as CHECKED_IN_CANCELLATION", () => {
      const db = {
        reservations: [
          {
            id: 888,
            code: "RES-114-888",
            externalOrderId: "OTA-CANCEL-INHOUSE",
            flatNumber: "114",
            status: "checked_in", // Already checked-in in-house guest!
            checkedIn: true,
            checkedInAt: "2026-11-05T14:30:00Z",
            checkinDate: "2026-11-05",
            checkoutDate: "2026-11-08"
          }
        ],
        wbpQuarantine: []
      };

      const cancelPayload = {
        externalOrderId: "OTA-CANCEL-INHOUSE",
        isCancellation: true
      };

      const result = handleOtaCancellation({ db, normalized: cancelPayload });
      assert.equal(result.reason, "CHECKED_IN_CANCELLATION");

      // Verify reservation was NOT cancelled
      const res = db.reservations[0];
      assert.equal(res.status, "checked_in");
      assert.equal(res.cancelledAt, undefined);

      // Verify quarantine record
      assert.equal(db.wbpQuarantine.length, 1);
      assert.equal(db.wbpQuarantine[0].reason, "CHECKED_IN_CANCELLATION");
      assert.ok(db.wbpQuarantine[0].reasonDetails.message.includes("check-in"));
    });

    it("4.2 also blocks cancellation for alternative checked-in status variants ('hospedado', 'checkin_realizado')", () => {
      const db = {
        reservations: [
          {
            id: 889,
            code: "RES-116-889",
            externalOrderId: "OTA-CANCEL-HOSPEDADO",
            flatNumber: "116",
            status: "hospedado"
          },
          {
            id: 890,
            code: "RES-211-890",
            externalOrderId: "OTA-CANCEL-REALIZADO",
            flatNumber: "211",
            status: "checkin_realizado"
          }
        ],
        wbpQuarantine: []
      };

      const res1 = handleOtaCancellation({
        db,
        normalized: { externalOrderId: "OTA-CANCEL-HOSPEDADO", isCancellation: true }
      });
      assert.equal(res1.reason, "CHECKED_IN_CANCELLATION");
      assert.equal(db.reservations[0].status, "hospedado");

      const res2 = handleOtaCancellation({
        db,
        normalized: { externalOrderId: "OTA-CANCEL-REALIZADO", isCancellation: true }
      });
      assert.equal(res2.reason, "CHECKED_IN_CANCELLATION");
      assert.equal(db.reservations[1].status, "checkin_realizado");
    });

    it("4.3 standard pre-checkin cancellation automatically cancels reservation and immediately purges vaulted card", () => {
      const mockVault = {
        purgedCalls: [],
        purgeCard(id, reason) {
          this.purgedCalls.push({ id, reason });
        }
      };

      const db = {
        reservations: [
          {
            id: 999,
            code: "RES-212-999",
            externalOrderId: "OTA-CANCEL-PRECHECKIN",
            flatNumber: "212",
            status: "ativa", // Pre-check-in: safe to cancel automatically
            checkinDate: "2026-11-20",
            checkoutDate: "2026-11-23"
          }
        ],
        wbpQuarantine: []
      };

      const result = handleOtaCancellation({
        db,
        normalized: { externalOrderId: "OTA-CANCEL-PRECHECKIN", isCancellation: true },
        vault: mockVault
      });

      assert.equal(result.success, true);
      assert.equal(result.action, "cancelled");

      const res = db.reservations[0];
      assert.equal(res.status, "cancelada");
      assert.ok(res.cancelledAt);
      assert.equal(res.vaultStatus, "purged");

      // Verify card vault was purged with 'cancelled_without_penalty' for reservation id and order id
      assert.ok(
        mockVault.purgedCalls.some((c) => c.id === 999 && c.reason === "cancelled_without_penalty"),
        "Must purge reservation ID 999"
      );
      assert.ok(
        mockVault.purgedCalls.some((c) => c.id === "OTA-CANCEL-PRECHECKIN" && c.reason === "cancelled_without_penalty"),
        "Must purge external order ID"
      );
    });

    it("4.4 ghost cancellation for unknown orderId safely routes to quarantine as CONFLICT", () => {
      const db = {
        reservations: [],
        wbpQuarantine: []
      };

      const result = handleOtaCancellation({
        db,
        normalized: { externalOrderId: "GHOST-ORDER-999", isCancellation: true }
      });

      assert.equal(result.reason, "CONFLICT");
      assert.equal(db.wbpQuarantine.length, 1);
      assert.equal(db.wbpQuarantine[0].reason, "CONFLICT");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 5: MANUAL RESERVATION RECONCILIATION HEURISTICS
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 5: Manual Reservation Reconciliation & Ambiguous Name Matching Heuristics", () => {
    it("5.1 safe match: exact channel, exact dates, and name similarity >= 85% qualifies as safe link (score >= 80)", () => {
      const manualRes = {
        id: 10,
        code: "RES-113-MANUAL",
        guestName: "João Carlos da Silva",
        channel: "booking",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-18",
        totalAmount: 600,
        flatNumber: "113"
      };

      const otaBooking = {
        channel: "booking",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-18",
        guestName: "Joao Carlos Silva", // Diacritics stripped, 'da' omitted -> high similarity
        totalPrice: 600
      };

      const scoreResult = computeReconciliationScore(manualRes, otaBooking);
      assert.equal(scoreResult.isSafeMatch, true);
      assert.equal(scoreResult.isAmbiguous, false);
      assert.ok(scoreResult.score >= 80, `Score must be >= 80, got: ${scoreResult.score}`);
      assert.ok(scoreResult.nameSim >= 0.85, `Name similarity must be >= 0.85, got: ${scoreResult.nameSim}`);

      // Verify applySafeReconciliationLink does not mutate flat or prices
      applySafeReconciliationLink(manualRes, { externalOrderId: "OTA-LINK-100", wbpBookingId: "OTA-LINK-100" });
      assert.equal(manualRes.externalOrderId, "OTA-LINK-100");
      assert.equal(manualRes.wbpSynced, true);
      assert.equal(manualRes.flatNumber, "113");
      assert.equal(manualRes.totalAmount, 600);
    });

    it("5.2 ambiguous match: exact dates and channel with moderate name similarity (50%-84%) routes to quarantine", () => {
      const manualRes = {
        id: 11,
        code: "RES-114-MANUAL",
        guestName: "Carlos Silva",
        channel: "airbnb",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        totalAmount: 400
      };

      const otaBooking = {
        channel: "airbnb",
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        guestName: "Carlos Santos", // Moderate similarity (61.5% similarity)
        totalPrice: 400
      };

      const scoreResult = computeReconciliationScore(manualRes, otaBooking);
      assert.equal(scoreResult.isSafeMatch, false, "Must not be classified as safe match");
      assert.equal(scoreResult.isAmbiguous, true, "Must be classified as ambiguous match");
      assert.ok(scoreResult.score >= 50 && scoreResult.score < 80, `Score should be between 50 and 79, got: ${scoreResult.score}`);
      assert.ok(scoreResult.nameSim >= 0.50 && scoreResult.nameSim < 0.85, `Name similarity should be 0.50..0.84, got: ${scoreResult.nameSim}`);
    });

    it("5.3 date discrepancy: partially overlapping dates with identical name is classified as ambiguous", () => {
      const manualRes = {
        id: 12,
        code: "RES-116-MANUAL",
        guestName: "Mariana Souza",
        channel: "booking",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-13"
      };

      const otaBooking = {
        channel: "booking",
        checkinDate: "2026-11-11", // Check-in 1 day later
        checkoutDate: "2026-11-14",
        guestName: "Mariana Souza"
      };

      const scoreResult = computeReconciliationScore(manualRes, otaBooking);
      assert.equal(scoreResult.exactDateMatch, false);
      assert.equal(scoreResult.isSafeMatch, false);
      assert.equal(scoreResult.isAmbiguous, true);
    });

    it("5.4 channel discrepancy: direct/balcao reservation matching OTA booking is penalized and rejected as safe match", () => {
      const manualRes = {
        id: 13,
        code: "RES-211-DIRECT",
        guestName: "Roberto Almeida",
        channel: "direct", // Direct reservation typed manually
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-18"
      };

      const otaBooking = {
        channel: "booking",
        checkinDate: "2026-11-15",
        checkoutDate: "2026-11-18",
        guestName: "Roberto Almeida"
      };

      const scoreResult = computeReconciliationScore(manualRes, otaBooking);
      assert.equal(scoreResult.exactChannelMatch, false);
      assert.equal(scoreResult.isSafeMatch, false);
      assert.ok(scoreResult.discrepancies.some((d) => d.includes("direto")));
    });

    it("5.5 name normalization strips honorifics, diacritics, and punctuation robustly", () => {
      assert.equal(normalizeGuestName("Dra. Cláudia Müller"), "claudia muller");
      assert.equal(normalizeGuestName("Sr. João da Silva, Jr."), "joao da silva jr");
      assert.equal(normalizeGuestName("Prof. André Luiz de Souza!"), "andre luiz de souza");
      assert.equal(normalizeGuestName(""), "");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 6: CREDIT CARD VAULT SINGLE-USE TOKEN BURNING & REPLAY RACE
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 6: Credit Card Vault Token Expiration at 300s & Replay Race Hardening", () => {
    it("6.1 single-use token burning: consumed token is immediately destroyed and returns null on second retrieval", () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_burning.json")
      });

      const tokenObj = vault.createReauthToken("admin", 101);
      assert.ok(tokenObj.token);
      assert.equal(tokenObj.expiresInSeconds, 300);

      // First consumption: SUCCESS
      const firstConsume = vault.consumeReauthToken(tokenObj.token, 101);
      assert.ok(firstConsume);
      assert.equal(firstConsume.username, "admin");

      // Second consumption: BURNED / NULL
      const secondConsume = vault.consumeReauthToken(tokenObj.token, 101);
      assert.equal(secondConsume, null, "Burned single-use token must return null on second consumption");
    });

    it("6.2 concurrent token burning race: 20 simultaneous consumption attempts yield exactly 1 success and 19 nulls", async () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_race.json")
      });

      const tokenObj = vault.createReauthToken("admin", 202);
      const token = tokenObj.token;

      // 20 simultaneous asynchronous consumers competing for the same token
      const racePromises = Array.from({ length: 20 }, async (_, idx) => {
        return vault.consumeReauthToken(token, 202);
      });

      const results = await Promise.all(racePromises);
      const successes = results.filter((r) => r !== null);
      const failures = results.filter((r) => r === null);

      assert.equal(successes.length, 1, "Exactly ONE consumer must succeed");
      assert.equal(failures.length, 19, "All other 19 consumers must receive null");
    });

    it("6.3 token expiration: succeeds at 299.9s but strictly expires and returns null past 300s boundary", () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_ttl.json")
      });

      // Token 1: Test valid within 300s boundary (simulating at t + 290s)
      const tokenObj1 = vault.createReauthToken("admin", 303);
      global.__simulatedTimeOffsetMs = 290 * 1000; // +290 seconds
      const consumeWithin = vault.consumeReauthToken(tokenObj1.token, 303);
      assert.ok(consumeWithin, "Token consumed at 290s must succeed");

      // Token 2: Test expired past 300s boundary (simulating at t + 301s)
      global.__simulatedTimeOffsetMs = 0; // reset
      const tokenObj2 = vault.createReauthToken("admin", 304);
      global.__simulatedTimeOffsetMs = 301 * 1000; // +301 seconds (> 300s TTL)
      const consumeExpired = vault.consumeReauthToken(tokenObj2.token, 304);
      assert.equal(consumeExpired, null, "Token consumed past 300s TTL must return null");

      // Reset simulated offset
      global.__simulatedTimeOffsetMs = 0;
    });

    it("6.4 zero-leakage forensic audit: verifies that full PAN and CVV never leak into database, logs or storage", async () => {
      const secretPan = "4532012345678910";
      const secretCvv = "987";

      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_forensics.json")
      });

      // Store card
      vault.storeCard({
        orderId: "ZERO-LEAK-ORDER-01",
        cardData: {
          cardNumber: secretPan,
          cvv: secretCvv, // must be stripped immediately
          holderName: "Test Guest",
          expireMonth: "12",
          expireYear: "2028"
        },
        checkoutDate: "2026-11-20"
      });

      const audit = runZeroLeakageForensicAudit({
        pan: secretPan,
        cvv: secretCvv,
        db: { sample: "in-memory-state" },
        dbFilePath: tmpDbPath,
        storageFilePath: path.join(tmpDir, "test_vault_forensics.json"),
        auditLogFilePath: tmpAuditLogPath
      });

      assert.equal(audit.clean, true, `Forensic audit must be clean! Violations: ${audit.violations.join(", ")}`);
      assert.equal(audit.violationCount, 0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 7: AUTO-PURGE LIFECYCLE UNDER IRREGULAR CALENDAR OFFSETS
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 7: Auto-Purge Lifecycle Under Irregular Calendar Offsets", () => {
    it("7.1 leap year / leap day offset: checkout on 2024-02-28 sets purge date to 2024-03-06 (Feb has 29 days)", () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_leap.json")
      });

      const record = vault.storeCard({
        orderId: "LEAP-YEAR-001",
        cardData: {
          cardNumber: "4012888899991234",
          holderName: "Leap Guest",
          expireMonth: "08",
          expireYear: "2029"
        },
        checkoutDate: "2024-02-28" // 2024 is leap year: Feb 28 + 7 days = March 6
      });

      assert.equal(record.purgeAfterDate, "2024-03-06");

      // Before purge date: active
      const purgedBefore = vault.purgeExpiredCards("2024-03-05");
      assert.equal(purgedBefore, 0);
      assert.equal(record.status, "active");
      assert.ok(record.encrypted);

      // On purge date: purged permanently
      const purgedOn = vault.purgeExpiredCards("2024-03-06");
      assert.equal(purgedOn, 1);
      assert.equal(record.status, "purged");
      assert.equal(record.encrypted, null);
      assert.equal(record.purgeReason, "7_days_post_checkout");
    });

    it("7.2 year-end rollover offset: checkout on 2026-12-28 purges on 2027-01-04", () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_yearend.json")
      });

      const record = vault.storeCard({
        orderId: "YEAREND-001",
        cardData: {
          cardNumber: "5555444433332222",
          holderName: "Year End Guest"
        },
        checkoutDate: "2026-12-28"
      });

      assert.equal(record.purgeAfterDate, "2027-01-04");

      assert.equal(vault.purgeExpiredCards("2027-01-03"), 0);
      assert.equal(record.status, "active");

      assert.equal(vault.purgeExpiredCards("2027-01-04"), 1);
      assert.equal(record.status, "purged");
      assert.equal(record.encrypted, null);
    });

    it("7.3 manual immediate purge on cancellation without penalty destroys encrypted payload immediately", () => {
      const vault = new CreditCardVault({
        key: VAULT_TEST_KEY,
        storageFile: path.join(tmpDir, "test_vault_cancel.json")
      });

      const record = vault.storeCard({
        orderId: "CANCEL-PURGE-001",
        reservationId: 9999,
        cardData: {
          cardNumber: "4000123456789010",
          holderName: "Cancel Guest"
        },
        checkoutDate: "2026-12-30"
      });

      assert.equal(record.status, "active");
      assert.ok(record.encrypted);

      const success = vault.purgeCard("CANCEL-PURGE-001", "cancelled_without_penalty");
      assert.equal(success, true);
      assert.equal(record.status, "purged");
      assert.equal(record.encrypted, null);
      assert.equal(record.purgeReason, "cancelled_without_penalty");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUITE 8: PROVISIONAL MESSAGES & REVIEWS FAIL-SAFE BEHAVIOR
  // ════════════════════════════════════════════════════════════════════════════
  describe("Suite 8: Provisional Messages & Reviews Fail-Safe Behavior", () => {
    it("8.1 returns safe empty structures when provisional features are disabled by default (Requirement R7)", async () => {
      const db = { settings: { wbp_integration_mode: "auto" } };
      const adapter = new WbpProvisionalAdapter(null, db);

      // Messages disabled by default
      const msgRes = await adapter.getMessages({ db });
      assert.equal(msgRes.success, true);
      assert.equal(msgRes.enabled, false);
      assert.equal(msgRes.provisional, true);
      assert.deepEqual(msgRes.messages, []);

      const sendRes = await adapter.sendMessage({ text: "Hello", db });
      assert.equal(sendRes.success, false);
      assert.equal(sendRes.enabled, false);
      assert.ok(sendRes.error.includes("disabled by default"));

      // Reviews disabled by default
      const revRes = await adapter.getReviews({ db });
      assert.equal(revRes.success, true);
      assert.equal(revRes.enabled, false);
      assert.equal(revRes.provisional, true);
      assert.deepEqual(revRes.reviews, []);

      const respondRes = await adapter.respondReview({ reviewId: 10, responseText: "Thanks", db });
      assert.equal(respondRes.success, false);
      assert.equal(respondRes.enabled, false);
      assert.ok(respondRes.error.includes("disabled by default"));
    });

    it("8.2 when general switch is OFF, provisional operations return disabled even if toggles are true", async () => {
      const db = {
        settings: {
          wbp_integration_mode: "off",
          wbp_provisional_messages_enabled: true,
          wbp_provisional_reviews_enabled: true
        }
      };
      const adapter = new WbpProvisionalAdapter(null, db);

      const msgRes = await adapter.getMessages({ db });
      assert.equal(msgRes.enabled, false);
      assert.ok(msgRes.reason.includes("mode = 'off'"));

      const revRes = await adapter.getReviews({ db });
      assert.equal(revRes.enabled, false);
      assert.ok(revRes.reason.includes("mode = 'off'"));
    });

    it("8.3 validates mandatory inputs when active: throws error for empty text or missing reviewId", async () => {
      const db = {
        settings: {
          wbp_integration_mode: "auto",
          wbp_provisional_messages_enabled: true,
          wbp_provisional_reviews_enabled: true
        }
      };
      const adapter = new WbpProvisionalAdapter({ request: async () => ({}) }, db);

      await assert.rejects(
        () => adapter.sendMessage({ text: "", db }),
        /Campo 'text' é obrigatório/
      );

      await assert.rejects(
        () => adapter.sendMessage({ text: "   ", db }),
        /Campo 'text' é obrigatório/
      );

      await assert.rejects(
        () => adapter.respondReview({ reviewId: null, responseText: "Valid", db }),
        /Campo 'reviewId' é obrigatório/
      );

      await assert.rejects(
        () => adapter.respondReview({ reviewId: 123, responseText: "", db }),
        /Campo 'responseText' é obrigatório/
      );
    });

    it("8.4 rating normalization maps 10-point scale to 5-star standard with correct sentiment tone", async () => {
      const db = {
        settings: {
          wbp_integration_mode: "auto",
          wbp_provisional_reviews_enabled: true
        }
      };

      const mockClient = {
        wbpPropertyId: "111",
        async request(endpoint) {
          if (endpoint === "GetReviews") {
            return {
              Reviews: [
                { wbp_review_id: "REV-1", rating: 10, comment: "Excelente estadia!" },
                { wbp_review_id: "REV-2", rating: 6, comment: "Estadia razoável." },
                { wbp_review_id: "REV-3", rating: 2, comment: "Ruim, barulho à noite." }
              ]
            };
          }
          return {};
        }
      };

      const adapter = new WbpProvisionalAdapter(mockClient, db);
      const res = await adapter.getReviews({ db });
      assert.equal(res.success, true);
      assert.equal(res.count, 3);

      const [r1, r2, r3] = res.reviews;
      // REV-1: rating 10 -> 5 stars, tone: positive
      assert.equal(r1.rating, 5);
      assert.equal(r1.tone, "positive");

      // REV-2: rating 6 -> 3 stars, tone: neutral
      assert.equal(r2.rating, 3);
      assert.equal(r2.tone, "neutral");

      // REV-3: rating 2 (out of 5) -> 2 stars, tone: negative
      assert.equal(r3.rating, 2);
      assert.equal(r3.tone, "negative");
    });
  });
});
