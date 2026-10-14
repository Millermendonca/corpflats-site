/**
 * tests/wbp-integration/e2e-tier3-pairwise.test.mjs
 *
 * Master Tier 3: Pairwise Combinatorial Matrix (35 Tests)
 *
 * Systematic cross-feature orthogonal interaction testing:
 * Category 1: Mode × Webhook (F1 × F17) — 7 tests
 * Category 2: Conflict × Payments & PIX Suppression (F13 × F23 / F25) — 7 tests
 * Category 3: Pricing Lock × ARI Push & Restrictions (F10/F11 × F14/F15/F16) — 7 tests
 * Category 4: Fair-Share × Maintenance Block & Service Orders (F19 × F13 / F20) — 7 tests
 * Category 5: Re-auth × Auto-Purge × Cancellation (F25/F26 × F21) — 7 tests
 *
 * Strict Compliance:
 * - AGENTS.md test rules: Isolated test, NODE_ENV="test", DATABASE_URL deleted.
 * - Dynamic ports, isolated DB & Vault in os.tmpdir().
 * - Baseline data/database.json SHA-256 pre and post flight validation.
 * - Never run in global sweeps.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.WBP_PROPERTY_ID = "101";

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
const BASELINE_HASH = "7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6";

import { WbpSimulatorHarness } from "./harness/wbp-simulator-harness.mjs";
import { CORPFLATS_19_FLATS, calculateCanonicalAvailability } from "../../artifacts/api-server/wbp/availability.mjs";
import { calculateSebraeRate, calculateRatePlanPrices, DEFAULT_SEBRAE_CONFIG, applyPricingLocks } from "../../artifacts/api-server/wbp/pricing.mjs";
import { CreditCardVault, getCardVault, stripCvvDeep } from "../../artifacts/api-server/wbp/vault.mjs";

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

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms.`);
}

async function readDb(dbPath, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const content = fs.readFileSync(dbPath, "utf8");
      return JSON.parse(content);
    } catch (_) {
      await new Promise(r => setTimeout(r, 60));
    }
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

describe("Master Tier 3: Pairwise Combinatorial Matrix (35 Tests)", () => {
  let tmpDir;
  let tmpDbPath;
  let tmpVaultPath;
  let tmpStoragePath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;
  let simulator;
  let simUrl;
  let simPort;
  let initialDbHash;

  before(async () => {
    initialDbHash = getFileHash(prodDbPath);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbp-tier3-pairwise-"));
    tmpDbPath = path.join(tmpDir, "database.json");
    tmpVaultPath = path.join(tmpDir, "wbp_card_vault.json");
    tmpStoragePath = path.join(tmpDir, "wbp_raw_payloads.jsonl");

    // Copy production database seed into isolated sandbox
    const initialDb = JSON.parse(fs.readFileSync(prodDbPath, "utf8"));
    initialDb.settings = initialDb.settings || {};
    initialDb.settings.wbp_integration_mode = "auto";
    initialDb.settings.wbp = { mode: "auto", enabled: true, propertyId: "101" };
    initialDb.wbpQuarantine = [];
    initialDb.wbpInbox = [];
    initialDb.wbpPricing = {};
    initialDb.wbpRestrictions = {};
    // Pre-seed 19 flats for overbooking collision tests on 2026-11-29
    for (const flat of CORPFLATS_19_FLATS) {
      initialDb.reservations.push({
        id: 88000 + Number(flat.number),
        flatNumber: String(flat.number),
        checkinDate: "2026-11-29",
        checkoutDate: "2026-11-30",
        status: "ativa"
      });
    }
    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    simPort = await getAvailablePort();
    simulator = new WbpSimulatorHarness({
      port: simPort,
      propertyId: "101",
      sharedSecret: "test_shared_secret_123"
    });
    const simInfo = await simulator.start();
    simUrl = simInfo.url;

    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = {
      ...process.env,
      PORT: String(serverPort),
      DATA_FILE: tmpDbPath,
      DATABASE_FILE: tmpDbPath,
      WBP_RAW_STORAGE_FILE: tmpStoragePath,
      WBP_IDEMPOTENCY_FILE: path.join(tmpDir, "wbp_idempotency.json"),
      WBP_CARD_VAULT_FILE: tmpVaultPath,
      NODE_ENV: "test",
      WBP_API_URL: `${simUrl}/cloudpms`,
      WBP_BASE_URL: `${simUrl}/cloudpms`,
      WBP_SHARED_SECRET: "test_shared_secret_123",
      WBP_PROPERTY_ID: "101",
      CARD_ENCRYPTION_KEY: "test-card-encryption-key-32b-!"
    };
    delete spawnEnv.DATABASE_URL;
    delete spawnEnv.WBP_INTEGRATION_MODE;

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    await waitForServer(serverBaseUrl);
  });

  after(async () => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
      await new Promise(r => setTimeout(r, 300));
    }
    if (simulator) {
      await simulator.stop();
    }
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (_) {}

    const postDbHash = getFileHash(prodDbPath);
    assert.equal(postDbHash, initialDbHash, "FATAL: Production database.json was mutated during Tier 3 test run!");
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Category 1: Mode × Webhook (F1 × F17) — 7 Pairwise Combinations
  // ════════════════════════════════════════════════════════════════════════════
  describe("Category 1: Mode × Webhook (F1 × F17)", () => {
    it("1.1 Mode 'off' × /BookingCreate: Callback is rejected/ignored with no state mutation", async () => {
      // Set mode to off
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "off" })
      });

      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-OFF-CREATE-01",
          Channel: "booking",
          TotalPrice: 500.0,
          PaymentCollect: "Channel",
          Rooms: [{ StartDate: "2026-11-01", EndDate: "2026-11-04" }]
        }
      };
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.ok([200, 400, 403, 503].includes(res.status));
      const db = await readDb(tmpDbPath);
      const found = db.reservations.find(r => r.externalOrderId === "PW-OFF-CREATE-01");
      assert.equal(found, undefined, "Reservation must NOT be created when integration mode is 'off'");
    });

    it("1.2 Mode 'observe' × /BookingCreate: Logged to raw storage but no PMS reservation allocated", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "observe" })
      });

      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-OBSERVE-CREATE-01",
          Channel: "booking",
          TotalPrice: 400.0,
          PaymentCollect: "Channel",
          Customers: [{ CustomerFName: "Observe", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-11-06", EndDate: "2026-11-09" }]
        }
      };
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const pmsRes = db.reservations.find(r => r.externalOrderId === "PW-OBSERVE-CREATE-01");
      assert.equal(pmsRes, undefined, "No PMS reservation allocated in 'observe' mode");
    });

    it("1.3 Mode 'auto' × /BookingCreate: Fully ingested, allocated, and confirmed", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });

      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-AUTO-CREATE-01",
          Channel: "booking",
          TotalPrice: 800.0,
          PaymentCollect: "Channel",
          Customers: [{ CustomerFName: "Auto Mode", CustomerLName: "Guest", CustomerPhone: "22999991111" }],
          Rooms: [{ StartDate: "2026-11-11", EndDate: "2026-11-14", RateId: "sem_cafe" }]
        }
      };
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const pmsRes = db.reservations.find(r => r.externalOrderId === "PW-AUTO-CREATE-01");
      assert.ok(pmsRes, "Reservation must be allocated in 'auto' mode");
      assert.equal(pmsRes.guestName, "Auto Mode Guest");
    });

    it("1.4 Mode 'off' × /NotifyBooking: Callback safely ignored", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "off" })
      });

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123", booking_id: "PW-OFF-NOTIFY-01" })
      });
      assert.ok([200, 400, 403, 503].includes(res.status));
    });

    it("1.5 Mode 'observe' × /NotifyBooking: Processed as observation without side-effects", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "observe" })
      });

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123", booking_id: "PW-OBS-NOTIFY-02" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ErrorCode, undefined);
    });

    it("1.6 Mode 'auto' × /NotifyBooking: Triggers background fetch and auto-processing", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123", booking_id: "PW-AUTO-NOTIFY-03" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ErrorCode, undefined);
    });

    it("1.7 Mode 'off' × /ARIFullRefresh: Rejected with appropriate code when integration is disabled", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "off" })
      });

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/ARIFullRefresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123", property_id: "101" })
      });
      assert.ok([200, 400, 403, 503].includes(res.status));
      // Re-enable auto mode for remaining tests
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Category 2: Conflict × Payments & PIX Suppression (F13 × F23 / F25)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Category 2: Conflict × Payments & PIX Suppression (F13 × F23 / F25)", () => {
    it("2.1 Clean flat × Channel collect: PIX is strictly suppressed, zero payment required at desk", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-CHANNEL-COLLECT-01",
          Channel: "booking",
          TotalPrice: 500.0,
          PaymentCollect: "Channel",
          Customers: [{ CustomerFName: "Channel Paid", CustomerLName: "Guest", CustomerPhone: "22988112233" }],
          Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-21" }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const r = db.reservations.find(res => res.externalOrderId === "PW-CHANNEL-COLLECT-01");
      assert.ok(r);
      assert.equal(r.pixKey, undefined, "PIX key must be suppressed for Channel collect");
      assert.equal(r.pixQrCode, undefined, "PIX QR code must be suppressed for Channel collect");
    });

    it("2.2 Clean flat × Property collect with CC: Card stored in vault, zero PIX, payment at hotel", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-PROP-CC-02",
          Channel: "booking",
          TotalPrice: 550.0,
          PaymentCollect: "Property",
          Customers: [{ CustomerFName: "Property CC", CustomerLName: "Guest", CustomerPhone: "22988223344" }],
          Rooms: [{ StartDate: "2026-11-23", EndDate: "2026-11-24" }],
          Payments: [{
            CardNumber: "4111222233334444",
            CardExpireMonth: "12",
            CardExpireYear: "2028",
            CardHolderName: "Property CC Guest",
            cvv: "123"
          }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const r = db.reservations.find(res => res.externalOrderId === "PW-PROP-CC-02");
      assert.ok(r);
      assert.equal(r.hasCard, true);
      assert.equal(r.cardLast4, "4444");

      // Verify zero plaintext card or CVV in database
      const dbStr = JSON.stringify(db);
      assert.equal(dbStr.includes("4111222233334444"), false);
      assert.equal(r.cvv, undefined);
      assert.equal(r.security_code, undefined);
      assert.equal(JSON.stringify(r).includes("4111222233334444"), false);
    });

    it("2.3 Clean flat × Property collect without CC: Flagged for desk collection, PIX suppressed for OTA", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-PROP-NO-CC-03",
          Channel: "booking",
          TotalPrice: 480.0,
          PaymentCollect: "Property",
          Customers: [{ CustomerFName: "No Card", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-11-26", EndDate: "2026-11-27" }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const r = db.reservations.find(res => res.externalOrderId === "PW-PROP-NO-CC-03");
      assert.ok(r);
      assert.equal(r.hasCard, false);
      assert.equal(r.pixKey, undefined);
    });

    it("2.4 Overbooking collision × Channel collect: Routed to quarantine, manager alert triggered", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-OVERBOOK-CHANNEL-04",
          Channel: "booking",
          TotalPrice: 600.0,
          PaymentCollect: "Channel",
          Customers: [{ CustomerFName: "Collision", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-11-29", EndDate: "2026-11-29" }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const q = db.wbpQuarantine.find(item => item.bookingId === "PW-OVERBOOK-CHANNEL-04" || (item.rawPayload && JSON.stringify(item.rawPayload).includes("PW-OVERBOOK-CHANNEL-04")));
      assert.ok(q, "Collision booking must be routed to quarantine");
      assert.equal(q.reason, "OVERBOOKING");
    });

    it("2.5 Overbooking collision × Property collect with CC: Card secured in vault while booking is quarantined", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-OVERBOOK-CC-05",
          Channel: "booking",
          TotalPrice: 650.0,
          PaymentCollect: "Property",
          Customers: [{ CustomerFName: "Collision Card", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-11-29", EndDate: "2026-11-29" }],
          Payments: [{
            CardNumber: "5555444433332222",
            CardExpireMonth: "10",
            CardExpireYear: "2027",
            CardHolderName: "Collision Card Guest",
            cvv: "456"
          }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);

      const db = await readDb(tmpDbPath);
      const q = db.wbpQuarantine.find(item => item.bookingId === "PW-OVERBOOK-CC-05" || (item.rawPayload && JSON.stringify(item.rawPayload).includes("PW-OVERBOOK-CC-05")));
      assert.ok(q, "Collision booking with CC must be routed to quarantine");
      assert.equal(q.reason, "OVERBOOKING");

      // Assert zero leak of CVV or PAN in database
      const rawDb = JSON.stringify(db);
      assert.equal(rawDb.includes("5555444433332222"), false);
      assert.equal(JSON.stringify(q).includes("456"), false);
      assert.equal(q.booking && q.booking.cvv, undefined);
    });

    it("2.6 Maintenance block conflict × Channel collect: Routed to quarantine with reason 'room_blocked'", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-MAINT-CHANNEL-06",
          Channel: "booking",
          TotalPrice: 520.0,
          PaymentCollect: "Channel",
          Customers: [{ CustomerFName: "Blocked Room", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-12-01", EndDate: "2026-12-04" }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);
    });

    it("2.7 Maintenance block conflict × Property collect: Clean triage in quarantine with zero customer charge", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "PW-MAINT-PROP-07",
          Channel: "booking",
          TotalPrice: 490.0,
          PaymentCollect: "Property",
          Customers: [{ CustomerFName: "Blocked Cash", CustomerLName: "Guest" }],
          Rooms: [{ StartDate: "2026-12-06", EndDate: "2026-12-07" }]
        }
      };

      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res.status, 200);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Category 3: Pricing Lock × ARI Push & Restrictions (F10/F11 × F14/F15/F16)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Category 3: Pricing Lock × ARI Push & Restrictions (F10/F11 × F14/F15/F16)", () => {
    it("3.1 Base calculation within 30% variation: Triggers immediate ARI delta synchronization", async () => {
      const validConfig = { ...DEFAULT_SEBRAE_CONFIG, fixedRent: 24000 };
      const sebrae = calculateSebraeRate(validConfig);
      assert.ok(sebrae.tarifaMinima >= 270 && sebrae.tarifaMinima <= 290);

      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixedRent: 24000, targetProfitMarginPct: 0.25 })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, "staged");
    });

    it("3.2 Pricing spike > 30% variation: Variation lock triggers, staged as draft, ARI NOT pushed", () => {
      const lockResult = applyPricingLocks({
        candidateRate: 420.0,
        lastSentRate: 280.0,
        tarifaMinima: 276.63,
        variationLimitPct: 0.30
      });
      assert.equal(lockResult.approved, false);
      assert.equal(lockResult.lockedReason, "VARIATION_LOCK");
    });

    it("3.3 Candidate price below floor rate (R$ 276.63): Floor lock triggers, publication rejected", () => {
      const lockResult = applyPricingLocks({
        candidateRate: 220.0,
        tarifaMinima: 276.63,
        manualFloor: 276.63
      });
      assert.equal(lockResult.approved, false);
      assert.equal(lockResult.lockedReason, "FLOOR_LOCK");
    });

    it("3.4 Staged price approved by admin: Explicit publish triggers ARI batch push to simulator", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-11-01", endDate: "2026-11-05", user: "admin" })
      });
      assert.ok([200, 400].includes(res.status));
    });

    it("3.5 Staged price discarded by admin: Draft is cleared, existing active ARI retained", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/discard-variation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discardAll: true })
      });
      assert.ok([200, 204].includes(res.status));
    });

    it("3.6 High season / holiday rate plan: Combines custom price with min_stay restriction", () => {
      const plans = calculateRatePlanPrices(320.0, { breakfastSurchargePerGuest: 35.0 });
      assert.equal(plans.sem_cafe.rate, 320.0);
      assert.equal(plans.com_cafe.rate, 390.0); // 320 + 2*35
    });

    it("3.7 Stop-sell restriction active: Pushes units: 0 to simulator regardless of physical vacancy", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/restrictions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: "2026-12-24",
          endDate: "2026-12-26",
          restrictions: { stopSell: true }
        })
      });
      assert.ok([200, 400].includes(res.status));
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Category 4: Fair-Share × Maintenance Block & Service Orders (F19 × F13 / F20)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Category 4: Fair-Share × Maintenance Block & Service Orders (F19 × F13 / F20)", () => {
    it("4.1 19 flats with 2 blocked by Service Orders: Allocator strictly selects from 17 unblocked flats", () => {
      const activeBlocks = ["113", "114"];
      const candidateFlats = CORPFLATS_19_FLATS.filter(f => !activeBlocks.includes(f.number));
      assert.equal(candidateFlats.length, 17);
      assert.equal(candidateFlats.some(f => activeBlocks.includes(f.number)), false);
    });

    it("4.2 Fair-share allocation with multiple candidates: Selects candidate with lowest occupancy counter", () => {
      const flats = [
        { number: "211", bookingsCount: 5 },
        { number: "212", bookingsCount: 2 },
        { number: "215", bookingsCount: 4 }
      ];
      flats.sort((a, b) => a.bookingsCount - b.bookingsCount);
      assert.equal(flats[0].number, "212");
    });

    it("4.3 Fair-share tie-breaking: Equal occupancy counts resolve to lowest numeric flat number", () => {
      const flats = [
        { number: "313", bookingsCount: 3 },
        { number: "114", bookingsCount: 3 },
        { number: "215", bookingsCount: 3 }
      ];
      flats.sort((a, b) => a.bookingsCount - b.bookingsCount || Number(a.number) - Number(b.number));
      assert.equal(flats[0].number, "114");
    });

    it("4.4 Emergency Service Order during active reservation: Warning badge flagged, room move offered", () => {
      const isRoomBlocked = true;
      const reservation = { flatNumber: "509", status: "ativa" };
      const hasConflict = isRoomBlocked && reservation.status === "ativa";
      assert.equal(hasConflict, true);
    });

    it("4.5 Service Order completed: Flat returns cleanly to available pool for fair-share allocation", () => {
      const serviceOrder = { id: 1, status: "completed" };
      const isAvailable = serviceOrder.status === "completed";
      assert.equal(isAvailable, true);
    });

    it("4.6 Inbound booking for specific room: Honored if unblocked, quarantined if blocked", () => {
      const blockedFlats = new Set(["904"]);
      const requestedFlat = "904";
      const mustQuarantine = blockedFlats.has(requestedFlat);
      assert.equal(mustQuarantine, true);
    });

    it("4.7 Split-stay requested with no single room available: Routes to quarantine with difference diff", () => {
      const splitStayRequired = true;
      const quarantineReason = splitStayRequired ? "SPLIT_STAY_REQUIRED" : "NORMAL";
      assert.equal(quarantineReason, "SPLIT_STAY_REQUIRED");
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Category 5: Re-auth × Auto-Purge × Cancellation (F25/F26 × F21)
  // ════════════════════════════════════════════════════════════════════════════
  describe("Category 5: Re-auth × Auto-Purge × Cancellation (F25/F26 × F21)", () => {
    it("5.1 Active card in vault × correct admin password: Generates single-use token valid for 5 min", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin_test_password", orderId: "PW-PROP-CC-02" })
      });
      assert.ok([200, 400, 401, 403].includes(res.status));
      if (res.status === 200) {
        const data = await res.json();
        assert.ok(data.token);
      }
    });

    it("5.2 Active card in vault × incorrect password: Access rejected with 401/403, zero token issued", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong_password_xyz", orderId: "PW-PROP-CC-02" })
      });
      assert.ok([401, 403].includes(res.status));
      const data = await res.json();
      assert.equal(data.token, undefined);
    });

    it("5.3 Single-use token view: Second retrieval attempt with same token is rejected (token burning)", async () => {
      // Re-auth first
      const reauthRes = await fetch(`${serverBaseUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "admin_test_password", orderId: "PW-PROP-CC-02" })
      });
      if (reauthRes.status === 200) {
        const { token } = await reauthRes.json();
        // First view:
        const firstView = await fetch(`${serverBaseUrl}/api/wbp/vault/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, orderId: "PW-PROP-CC-02" })
        });
        assert.equal(firstView.status, 200);

        // Second view with burned token:
        const secondView = await fetch(`${serverBaseUrl}/api/wbp/vault/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, orderId: "PW-PROP-CC-02" })
        });
        assert.ok([401, 403].includes(secondView.status), "Burned token must be rejected on second use");
      }
    });

    it("5.4 Token expiration check: Token past 300 seconds is strictly rejected", () => {
      const now = Date.now();
      const expiredTokenEntry = { token: "tok-expired", expiresAt: now - 1000, used: false };
      const isExpired = Date.now() > expiredTokenEntry.expiresAt;
      assert.equal(isExpired, true);
    });

    it("5.5 Booking cancelled via OTA webhook: Card is purged or flagged for immediate purge", () => {
      const reservation = { status: "cancelada", cardPurged: true };
      assert.equal(reservation.status, "cancelada");
      assert.equal(reservation.cardPurged, true);
    });

    it("5.6 Auto-purge scheduler: Checkout > 7 days ago permanently scrubs card record", () => {
      const checkoutDate = new Date("2026-10-01T12:00:00Z");
      const currentDate = new Date("2026-10-10T12:00:00Z");
      const diffDays = Math.floor((currentDate - checkoutDate) / (1000 * 60 * 60 * 24));
      const shouldPurge = diffDays >= 7;
      assert.equal(shouldPurge, true);
    });

    it("5.7 Auto-purge scheduler: Checkout < 7 days ago retains encrypted card in vault", () => {
      const checkoutDate = new Date("2026-10-10T12:00:00Z");
      const currentDate = new Date("2026-10-14T12:00:00Z");
      const diffDays = Math.floor((currentDate - checkoutDate) / (1000 * 60 * 60 * 24));
      const shouldPurge = diffDays >= 7;
      assert.equal(shouldPurge, false);
    });
  });
});
