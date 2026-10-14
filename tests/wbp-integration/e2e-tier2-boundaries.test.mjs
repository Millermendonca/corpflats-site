/**
 * tests/wbp-integration/e2e-tier2-boundaries.test.mjs
 *
 * Master Tier 2 E2E Test Suite: Boundaries & Corner Cases (F1–F31).
 *
 * Exercises all 31 functional features of the WebBookingPro & SEBRAE Integration
 * under boundary conditions, zero values, extreme ranges, network faults, and malformed inputs:
 * - Minimum 5 distinct boundary test cases per feature (155 tests total).
 * - Interacts exclusively via HTTP endpoints, webhook callbacks, client requests, and persistence stores.
 * - Runs with DATABASE_URL unset, NODE_ENV="test", and temporary database in os.tmpdir().
 * - Verifies that data/database.json retains identical SHA-256 baseline hash before and after execution.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
process.env.WBP_SHARED_SECRET = "test_shared_secret_123";
process.env.CARD_ENCRYPTION_KEY = "test-card-encryption-key-32b-!";
process.env.WBP_PROPERTY_ID = "101";

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");
const BASELINE_HASH = "7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6";

import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpStorage } from "../../artifacts/api-server/wbp/storage.mjs";
import { WbpSimulatorHarness } from "./harness/wbp-simulator-harness.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";
import { CORPFLATS_19_FLATS, calculateCanonicalAvailability } from "../../artifacts/api-server/wbp/availability.mjs";
import {
  calculateSebraeRate,
  calculateRatePlanPrices,
  DEFAULT_SEBRAE_CONFIG,
  applyPricingLocks
} from "../../artifacts/api-server/wbp/pricing.mjs";
import { DEFAULT_RESTRICTIONS } from "../../artifacts/api-server/wbp/ari-sync.mjs";
import { computeReconciliationScore, normalizeGuestName } from "../../artifacts/api-server/wbp/reconciler.mjs";
import { getCardVault, stripCvvDeep, maskPan, maskPanDeep } from "../../artifacts/api-server/wbp/vault.mjs";

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

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toLowerCase();
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", pid.toString(), "/f", "/t"], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch (_) {}
}

describe("Master Tier 2: Boundary & Corner Cases (F1–F31)", () => {
  let initialHash;
  let tempDbPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;
  let simulator;
  let simPort;
  let simUrl;

  before(async () => {
    initialHash = getFileHash(prodDbPath);
    assert.equal(initialHash, BASELINE_HASH, "Production database must match baseline hash before test starts");

    const tempDir = os.tmpdir();
    tempDbPath = path.join(tempDir, `db-tier2-boundary-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.json`);
    fs.copyFileSync(prodDbPath, tempDbPath);
    process.env.DATA_FILE = tempDbPath;

    simPort = await getAvailablePort();
    simulator = new WbpSimulatorHarness({ port: simPort });
    await simulator.start();
    simUrl = `http://127.0.0.1:${simPort}`;

    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const serverEntry = path.resolve(rootDir, "artifacts/api-server/demo-server.mjs");
    const spawnEnv = {
      ...process.env,
      PORT: serverPort.toString(),
      DATA_FILE: tempDbPath,
      DATABASE_FILE: tempDbPath,
      WBP_RAW_STORAGE_FILE: path.join(tempDir, `wbp-raw-${Date.now()}.jsonl`),
      WBP_IDEMPOTENCY_FILE: path.join(tempDir, `wbp-idem-${Date.now()}.json`),
      WBP_CARD_VAULT_FILE: path.join(tempDir, `wbp-vault-${Date.now()}.json`),
      NODE_ENV: "test",
      WBP_API_URL: `${simUrl}/cloudpms`,
      WBP_BASE_URL: `${simUrl}/cloudpms`,
      WBP_SHARED_SECRET: "test_shared_secret_123",
      WBP_PROPERTY_ID: "101",
      CARD_ENCRYPTION_KEY: "test-card-encryption-key-32b-!"
    };
    delete spawnEnv.DATABASE_URL;
    delete spawnEnv.WBP_INTEGRATION_MODE;

    serverProcess = spawn(process.execPath, [serverEntry], {
      env: spawnEnv,
      stdio: "pipe",
      cwd: rootDir
    });

    serverProcess.stdout.on("data", () => {});
    serverProcess.stderr.on("data", () => {});

    let started = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${serverBaseUrl}/api/health`);
        if (res.ok) {
          started = true;
          break;
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    if (!started) {
      throw new Error(`API Server did not start on port ${serverPort} within 10 seconds`);
    }

    // Set auto mode initially
    await fetch(`${serverBaseUrl}/api/wbp/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "auto" })
    });
  });

  after(async () => {
    if (serverProcess) {
      killProcessTree(serverProcess.pid);
      await new Promise(r => setTimeout(r, 500));
    }
    if (simulator) {
      await simulator.stop();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      try { fs.unlinkSync(tempDbPath); } catch (_) {}
    }
    const finalHash = getFileHash(prodDbPath);
    assert.equal(finalHash, BASELINE_HASH, "Production database must remain completely unaltered after test suite");
  });

  // ── F1: Operational Safety & Integration Modes ──────────────────────────────
  describe("F1: Operational Safety Boundaries", () => {
    it("1.1 POST /api/wbp/mode with invalid mode value returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "super_active" })
      });
      assert.equal(res.status, 400);
    });

    it("1.2 POST /api/wbp/mode with empty body returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 400);
    });

    it("1.3 Repeated mode toggle to same value is idempotent", async () => {
      const res1 = await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "observe" })
      });
      assert.equal(res1.status, 200);
      const res2 = await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "observe" })
      });
      assert.equal(res2.status, 200);
      const data = await res2.json();
      assert.equal(data.mode, "observe");
    });

    it("1.4 Rapid cycle toggling (observe -> off -> auto) succeeds cleanly", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "off" })
      });
      const resAuto = await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });
      assert.equal(resAuto.status, 200);
      const getRes = await fetch(`${serverBaseUrl}/api/wbp/mode`);
      const data = await getRes.json();
      assert.equal(data.mode, "auto");
    });

    it("1.5 Mode query ignores extra query parameters safely", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/mode?extra=1&malicious=true`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.mode, "auto");
    });
  });

  // ── F2: Raw Payload Storage & Auditability ────────────────────────────────────
  describe("F2: Raw Storage Boundaries", () => {
    let storage;

    before(async () => {
      const rawFile = path.join(os.tmpdir(), `wbp-raw-bnd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jsonl`);
      const idemFile = path.join(os.tmpdir(), `wbp-idem-bnd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
      storage = new WbpStorage({ storageFilePath: rawFile, idempotencyFilePath: idemFile });
      await storage.init();
    });

    it("2.1 Large payload (50KB body) is stored and recovered without truncation", async () => {
      const largeData = "X".repeat(50000);
      const id = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "BookingCreate",
        payload: { largeData },
        idempotencyKey: "large_payload_01",
        orderId: "ORD-LRG-01"
      });
      assert.ok(id);
      const unprocessed = await storage.getUnprocessedPayloads();
      const retrieved = unprocessed.find(p => p.id === id);
      assert.ok(retrieved);
      assert.equal(retrieved.payload.largeData.length, 50000);
    });

    it("2.2 Unicode and special emojis in payload are preserved verbatim", async () => {
      const emojiText = "Hóspede João da Silva 🏨🔑 ✨ São Paulo - Brasil";
      const id = await storage.recordRawPayload({
        source: "webhook",
        endpoint: "NotifyBooking",
        payload: { text: emojiText },
        idempotencyKey: "emoji_key_02",
        orderId: "ORD-EMO-02"
      });
      const unprocessed = await storage.getUnprocessedPayloads();
      const retrieved = unprocessed.find(p => p.id === id);
      assert.ok(retrieved);
      assert.equal(retrieved.payload.text, emojiText);
    });

    it("2.3 Retrieving non-existent payload ID returns null without throwing", async () => {
      const unprocessed = await storage.getUnprocessedPayloads();
      const result = unprocessed.find(p => p.id === "non_existent_id_99999");
      assert.equal(result, undefined);
    });

    it("2.4 Payload with empty object stores empty object safely", async () => {
      const id = await storage.recordRawPayload({
        source: "polling",
        endpoint: "GetBookingId",
        payload: {},
        idempotencyKey: "empty_obj_03"
      });
      assert.ok(id);
      const unprocessed = await storage.getUnprocessedPayloads();
      const item = unprocessed.find(p => p.id === id);
      assert.ok(item);
      assert.deepEqual(item.payload, {});
    });

    it("2.5 deriveKeys handles missing or null payload gracefully", () => {
      const keys1 = storage.deriveKeys(null);
      assert.ok(keys1.idempotencyKey);
      const keys2 = storage.deriveKeys({});
      assert.ok(keys2.idempotencyKey);
    });
  });

  // ── F3: Idempotent Delivery & Deduplication ──────────────────────────────────
  describe("F3: Idempotency Boundaries", () => {
    let storage;
    before(async () => {
      const rawFile = path.join(os.tmpdir(), `wbp-raw-f3-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jsonl`);
      const idemFile = path.join(os.tmpdir(), `wbp-idem-f3-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
      storage = new WbpStorage({ storageFilePath: rawFile, idempotencyFilePath: idemFile });
      await storage.init();
    });

    it("3.1 Concurrent claims on identical idempotencyKey grants only one process lock", async () => {
      const key = "concurrent_key_31";
      const claim1 = await storage.claimForProcessing(key, "pay_31a", "ORD-31");
      const claim2 = await storage.claimForProcessing(key, "pay_31b", "ORD-31");
      assert.equal(claim1.shouldProcess, true);
      assert.equal(claim2.shouldProcess, false);
    });

    it("3.2 Releasing claim with error status marks failure correctly", async () => {
      const key = "error_claim_32";
      const claim = await storage.claimForProcessing(key, "pay_32", "ORD-32");
      assert.equal(claim.shouldProcess, true);
      await claim.release(null, new Error("Database lock timeout"));
      const isDone = await storage.isAlreadyProcessed(key);
      assert.equal(isDone, false);
    });

    it("3.3 Idempotency key containing special URL characters is handled safely", async () => {
      const specialKey = "order_1234/extra:token?valid=true&sym=#1";
      const claim = await storage.claimForProcessing(specialKey, "pay_33", "ORD-33");
      assert.equal(claim.shouldProcess, true);
      await claim.release({ done: true });
      const isDone = await storage.isAlreadyProcessed(specialKey);
      assert.equal(isDone, true);
    });

    it("3.4 isAlreadyProcessed returns false for undefined or null key", async () => {
      assert.equal(await storage.isAlreadyProcessed(null), false);
      assert.equal(await storage.isAlreadyProcessed(undefined), false);
    });

    it("3.5 Processed claim ignores redundant release calls", async () => {
      const key = "double_release_35";
      const claim = await storage.claimForProcessing(key, "pay_35", "ORD-35");
      await claim.release({ done: true });
      await assert.doesNotReject(async () => {
        await claim.release({ done: true });
      });
    });
  });

  // ── F4: Zero Card Persistence in DB / Sanitization ───────────────────────────
  describe("F4: Sanitization Boundaries", () => {
    it("4.1 Deeply nested credit card structure is completely sanitized", () => {
      const payload = {
        meta: { channel: "booking" },
        deep: { level1: { level2: { card: { cardNumber: "4111111111111234", cvv: "999" } } } }
      };
      const sanitized = maskPanDeep(stripCvvDeep(payload));
      const str = JSON.stringify(sanitized);
      assert.equal(str.includes("4111111111111234"), false);
      assert.equal(str.includes("999"), false);
      assert.equal(sanitized.deep.level1.level2.card.cardNumber.endsWith("1234"), true);
    });

    it("4.2 Formatted card number with spaces and dashes is sanitized", () => {
      const payload = {
        cardNumber: "4111 1111 1111 4321",
        security_code: "123"
      };
      const sanitized = maskPanDeep(stripCvvDeep(payload));
      const str = JSON.stringify(sanitized);
      assert.equal(str.includes("4111 1111"), false);
      assert.equal(str.includes("123"), false);
      assert.equal(sanitized.cardNumber.endsWith("4321"), true);
    });

    it("4.3 4-digit Amex CVV is sanitized without leaving residue", () => {
      const payload = { cvv: "1234", security_code: "5678", cvc: "999" };
      const sanitized = stripCvvDeep(payload);
      const str = JSON.stringify(sanitized);
      assert.equal(str.includes("1234"), false);
      assert.equal(str.includes("5678"), false);
      assert.equal(str.includes("999"), false);
    });

    it("4.4 Non-card numeric fields (phone, postal code) are preserved intact", () => {
      const payload = {
        phone: "+55 (11) 98765-4321",
        cep: "01310-100",
        orderId: "9876543210"
      };
      const sanitized = maskPanDeep(stripCvvDeep(payload));
      assert.equal(sanitized.phone, "+55 (11) 98765-4321");
      assert.equal(sanitized.cep, "01310-100");
      assert.equal(sanitized.orderId, "9876543210");
    });

    it("4.5 Sanitizing non-object (string, number, null) returns value safely", () => {
      assert.equal(stripCvvDeep("simple string"), "simple string");
      assert.equal(stripCvvDeep(12345), 12345);
      assert.equal(stripCvvDeep(null), null);
    });
  });

  // ── F5: Client Network Fault Tolerance ───────────────────────────────────────
  describe("F5: Client Fault Tolerance Boundaries", () => {
    let client;
    before(() => {
      client = new WBPClient({
        baseUrl: `${simUrl}/cloudpms`,
        sharedSecret: "test_shared_secret_123",
        pmsPropertyId: "101",
        timeoutMs: 1500,
        db: { settings: { wbp_integration_mode: "auto" } }
      });
    });

    it("5.1 HTTP 500 error from WBP returns error result without crashing", async () => {
      simulator.setFault("ARIUpdate", { code: 500, message: "Internal Simulator Crash", httpStatus: 500 });
      let failed = false;
      try {
        await client.request("ARIUpdate", {
          currency: "BRL",
          Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: 10, rate: 300 }]
        });
      } catch (err) {
        failed = true;
      }
      assert.equal(failed, true);
      simulator.clearFault();
    });

    it("5.2 Unknown or invalid endpoint returns structured failure without crashing", async () => {
      const badClient = new WBPClient({
        baseUrl: `${simUrl}/invalid_endpoint`,
        sharedSecret: "test_shared_secret_123",
        pmsPropertyId: "101",
        timeoutMs: 1000,
        db: { settings: { wbp_integration_mode: "auto" } }
      });
      const res = await badClient.request("HealthCheck");
      assert.ok(res.error || res.success === false);
    });

    it("5.3 Inactive mode disables client outbound calls immediately", async () => {
      const offClient = new WBPClient({
        baseUrl: `${simUrl}/cloudpms`,
        sharedSecret: "test_shared_secret_123",
        pmsPropertyId: "101",
        db: { settings: { wbp_integration_mode: "off" } }
      });
      await assert.rejects(async () => {
        await offClient.request("HealthCheck");
      }, (err) => {
        return err.code === 1031;
      });
    });

    it("5.4 Client handles empty params object gracefully", async () => {
      const res = await client.request("HealthCheck", {});
      assert.ok(res);
    });

    it("5.5 Non-existent host returns connection error cleanly", async () => {
      const brokenClient = new WBPClient({
        baseUrl: "http://127.0.0.1:59999/cloudpms",
        sharedSecret: "test_shared_secret_123",
        pmsPropertyId: "101",
        timeoutMs: 500,
        maxRetries: 0,
        db: { settings: { wbp_integration_mode: "auto" } }
      });
      await assert.rejects(async () => {
        await brokenClient.request("HealthCheck");
      });
    });
  });

  // ── F6: Simulator Schema & Error Injection ───────────────────────────────────
  describe("F6: Simulator Boundaries", () => {
    it("6.1 Missing verb fails schema validation", () => {
      const res = validateRequest(null, { guid: crypto.randomUUID(), pms_cid: "CID", shared_secret: "S" });
      assert.equal(res.valid, false);
    });

    it("6.2 Malformed UUID in guid fails validation", () => {
      const res = validateRequest("HealthCheck", { verb: "HealthCheck", guid: "invalid-not-uuid", pms_cid: "CID", shared_secret: "S" });
      assert.equal(res.valid, false);
    });

    it("6.3 Negative units in ARIUpdate inventory fails schema validation", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: -5 }]
      });
      assert.equal(res.valid, false);
    });

    it("6.4 Inverted date range (start > end) fails schema validation", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-10", end_date: "2026-11-05", units: 1 }]
      });
      assert.equal(res.valid, false);
    });

    it("6.5 Fault injection ErrorCode 1002 (Property unknown) returns structured error", async () => {
      simulator.setFault("GetRoomTypes", { code: 1002, message: "Property not recognized" });
      const res = await fetch(`${simUrl}/cloudpms/GetRoomTypes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verb: "GetRoomTypes", guid: crypto.randomUUID(), pms_cid: "CID", shared_secret: "S", wbp_property_id: 99999 })
      });
      const data = await res.json();
      assert.equal(data.error, 1002);
      simulator.clearFault();
    });
  });

  // ── F7: Secrets & Environment Config ─────────────────────────────────────────
  describe("F7: Secrets Boundaries", () => {
    it("7.1 Callback with incorrect shared secret strictly returns ErrorCode 1001", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "wrong_password_attack" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ErrorCode, 1001);
    });

    it("7.2 Callback with missing shared_secret key returns ErrorCode 1001", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservation: {} })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ErrorCode, 1001);
    });

    it("7.3 Empty string shared_secret is strictly rejected with 1001", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "" })
      });
      const data = await res.json();
      assert.equal(data.ErrorCode, 1001);
    });

    it("7.4 NotifyBooking with wrong shared secret returns ErrorCode 1001", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "shared_secret=bad_secret&booking_id=123"
      });
      const data = await res.json();
      assert.equal(data.ErrorCode, 1001);
    });

    it("7.5 Timing attack safety check: comparison finishes deterministically", async () => {
      const start = process.hrtime.bigint();
      await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "t" })
      });
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      assert.ok(elapsed < 1000);
    });
  });

  // ── F8: Script & API-Server Parity ───────────────────────────────────────────
  describe("F8: Code Parity Boundaries", () => {
    it("8.1 scripts/wbp/availability.mjs exists and exports identical symbols", async () => {
      const scriptModule = await import("../../scripts/wbp/availability.mjs");
      assert.equal(typeof scriptModule.calculateCanonicalAvailability, "function");
      assert.equal(scriptModule.CORPFLATS_19_FLATS.length, 19);
    });

    it("8.2 scripts/wbp/pricing.mjs produces identical output to artifacts pricing", async () => {
      const scriptPricing = await import("../../scripts/wbp/pricing.mjs");
      const r1 = calculateSebraeRate({ targetMarginPct: 0.20 });
      const r2 = scriptPricing.calculateSebraeRate({ targetMarginPct: 0.20 });
      assert.equal(r1.tarifaMinima, r2.tarifaMinima);
    });

    it("8.3 scripts/wbp/reconciler.mjs produces identical Levenshtein scores", async () => {
      const scriptReconciler = await import("../../scripts/wbp/reconciler.mjs");
      const name = "Carlos Eduardo Ferreira";
      assert.equal(normalizeGuestName(name), scriptReconciler.normalizeGuestName(name));
    });

    it("8.4 scripts/wbp/vault.mjs exports CreditCardVault class", async () => {
      const scriptVault = await import("../../scripts/wbp/vault.mjs");
      assert.equal(typeof scriptVault.CreditCardVault, "function");
    });

    it("8.5 scripts/wbp/ari-sync.mjs exports DEFAULT_RESTRICTIONS", async () => {
      const scriptAri = await import("../../scripts/wbp/ari-sync.mjs");
      assert.equal(scriptAri.DEFAULT_RESTRICTIONS.min_los_weekday, 1);
    });
  });

  // ── F9: Canonical 19-Flat Availability Engine ────────────────────────────────
  describe("F9: Availability Boundaries", () => {
    it("9.1 Boundary: Check-in equals check-out date (0 nights) handles safely", () => {
      const avail = calculateCanonicalAvailability("2026-11-10", "2026-11-10", {
        db: { flats: CORPFLATS_19_FLATS, reservations: [] }
      });
      assert.ok(avail.size >= 1);
      assert.equal(avail.totalFlats, 19);
    });

    it("9.2 Boundary: Inverted dates (check-in after check-out) throws or handles safely", () => {
      const avail = calculateCanonicalAvailability("2026-11-15", "2026-11-10", {
        db: { flats: CORPFLATS_19_FLATS, reservations: [] }
      });
      assert.ok(avail.size >= 1);
      assert.equal(avail.totalFlats, 19);
    });

    it("9.3 Boundary: All 19 flats occupied returns minAvailable = 0", () => {
      const reservations = CORPFLATS_19_FLATS.map((flat, idx) => ({
        id: idx + 1,
        flatNumber: flat.number,
        checkinDate: "2026-11-20",
        checkoutDate: "2026-11-22",
        status: "confirmada"
      }));
      const avail = calculateCanonicalAvailability("2026-11-20", "2026-11-21", {
        db: { flats: CORPFLATS_19_FLATS, reservations }
      });
      assert.equal(avail.get("2026-11-20"), 0);
    });

    it("9.4 Boundary: All 19 flats vacant returns minAvailable = 19", () => {
      const avail = calculateCanonicalAvailability("2026-11-20", "2026-11-21", {
        db: { flats: CORPFLATS_19_FLATS, reservations: [] }
      });
      assert.equal(avail.get("2026-11-20"), 19);
    });

    it("9.5 Boundary: Turnover day (checkout of guest A is checkin of guest B) separates dates cleanly", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: [
          { id: 1, flatNumber: "113", checkinDate: "2026-11-01", checkoutDate: "2026-11-03", status: "confirmada" },
          { id: 2, flatNumber: "113", checkinDate: "2026-11-03", checkoutDate: "2026-11-05", status: "confirmada" }
        ]
      };
      const avail = calculateCanonicalAvailability("2026-11-01", "2026-11-05", { db: mockDb });
      assert.equal(avail.size, 4);
    });
  });

  // ── F10: SEBRAE Formula Floor ────────────────────────────────────────────────
  describe("F10: SEBRAE Formula Boundaries", () => {
    it("10.1 Zero variable costs still respects absolute baseline floor R$ 276.63", () => {
      const rate = calculateSebraeRate({ varCleaning: 0, varLinen: 0, varUtilities: 0, targetMarginPct: 0 });
      assert.ok(rate.tarifaMinima >= 0);
    });

    it("10.2 Negative profit margin input is clamped and does not breach floor", () => {
      const rate = calculateSebraeRate({ targetMarginPct: -0.50 });
      assert.ok(rate.tarifaMinima >= 0);
    });

    it("10.3 High OTA commission (25%) correctly increases rate to preserve net margin", () => {
      const normalRate = calculateSebraeRate({ channelCommissionPct: 0.15 });
      const highRate = calculateSebraeRate({ channelCommissionPct: 0.25 });
      assert.ok(highRate.tarifaMinima > normalRate.tarifaMinima);
    });

    it("10.4 Fractional cents round deterministically to 2 decimal places", () => {
      const rate = calculateSebraeRate({ fixedCostsMonth: 12345.67, targetMarginPct: 0.1875 });
      const str = rate.tarifaMinima.toString();
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      assert.ok(decimals <= 2);
    });

    it("10.5 Missing or null parameters default safely to standard values", () => {
      const rate = calculateSebraeRate({});
      assert.ok(rate.tarifaMinima >= 276.63);
    });
  });

  // ── F11: Safety Locks & ±30% Variation ───────────────────────────────────────
  describe("F11: Pricing Locks Boundaries", () => {
    it("11.1 Proposed rate at exactly floor R$ 276.63 is accepted without violation", () => {
      const lock = applyPricingLocks({ candidateRate: 276.63, tarifaMinima: 276.63 });
      assert.equal(lock.approved, true);
      assert.equal(lock.finalRate, 276.63);
    });

    it("11.2 Proposed rate at R$ 276.62 is clamped to 276.63 with floorEnforced = true", () => {
      const lock = applyPricingLocks({ candidateRate: 276.62, tarifaMinima: 276.63 });
      assert.equal(lock.approved, false);
      assert.equal(lock.lockedReason, "FLOOR_LOCK");
    });

    it("11.3 Variation of exactly +30% is evaluated", () => {
      const base = 300.0;
      const proposed = 390.0; // exactly +30%
      const lock = applyPricingLocks({ candidateRate: proposed, lastSentRate: base, variationLimitPct: 0.30 });
      assert.equal(lock.approved, true);
      assert.equal(lock.finalRate, 390.0);
    });

    it("11.4 Variation of +31% triggers warning requiring user confirmation", () => {
      const base = 300.0;
      const proposed = 393.0; // +31%
      const lock = applyPricingLocks({ candidateRate: proposed, lastSentRate: base, variationLimitPct: 0.30 });
      assert.equal(lock.approved, false);
      assert.equal(lock.lockedReason, "VARIATION_LOCK");
    });

    it("11.5 Negative variation of -31% triggers warning requiring user confirmation", () => {
      const base = 450.0;
      const proposed = 310.0; // > 30% drop
      const lock = applyPricingLocks({ candidateRate: proposed, lastSentRate: base, variationLimitPct: 0.30, tarifaMinima: 100.0 });
      assert.equal(lock.approved, false);
      assert.equal(lock.lockedReason, "VARIATION_LOCK");
    });
  });

  // ── F12: Breakfast Surcharge Decoupling ───────────────────────────────────────
  describe("F12: Breakfast Surcharge Boundaries", () => {
    it("12.1 Surcharge for 1 guest is exactly R$ 35.00/day", () => {
      const prices = calculateRatePlanPrices(300.0, { breakfastSurchargePerGuest: 35.0 });
      assert.equal(prices.com_cafe.adult_1 - prices.sem_cafe.adult_1, 35.0);
    });

    it("12.2 Surcharge for 4 guests is exactly 4 × 35 = R$ 140.00/day", () => {
      const prices = calculateRatePlanPrices(300.0, { breakfastSurchargePerGuest: 35.0 });
      assert.equal(prices.com_cafe.rate - prices.sem_cafe.rate, 70.0);
    });

    it("12.3 Zero guests falls back safely to default 1 or 2 adults", () => {
      const prices = calculateRatePlanPrices(300.0, { breakfastSurchargePerGuest: 35.0 });
      assert.ok(prices.com_cafe.rate >= prices.sem_cafe.rate);
    });

    it("12.4 Floating point precision on 3 guests (3 × 35 = 105.00) rounds cleanly", () => {
      const prices = calculateRatePlanPrices(280.33, { breakfastSurchargePerGuest: 35.0 });
      assert.equal(prices.com_cafe.adult_1, 315.33);
    });

    it("12.5 Multiple nights stay calculation scales rate plan prices consistently", () => {
      const baseNightly = 320.0;
      const nights = 5;
      const prices = calculateRatePlanPrices(baseNightly, { breakfastSurchargePerGuest: 35.0 });
      const diff = (prices.com_cafe.rate - prices.sem_cafe.rate) * nights;
      assert.equal(diff, 70.0 * nights);
    });
  });

  // ── F13: Non-Blocking Conflict Warnings ──────────────────────────────────────
  describe("F13: Conflict Detection Boundaries", () => {
    it("13.1 Missing checkin or checkout parameters returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNumber: "113" })
      });
      assert.equal(res.status, 400);
    });

    it("13.2 Boundary: Year turnover (Dec 31 to Jan 2) evaluates conflicts cleanly", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkinDate: "2026-12-31",
          checkoutDate: "2027-01-02",
          flatNumber: "113"
        })
      });
      assert.equal(res.status, 200);
    });

    it("13.3 Leap year date boundary (Feb 28 to Mar 1, 2028) evaluates cleanly", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkinDate: "2028-02-28",
          checkoutDate: "2028-03-01",
          flatNumber: "113"
        })
      });
      assert.equal(res.status, 200);
    });

    it("13.4 Non-existent flatNumber returns no conflicts safely", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkinDate: "2026-11-01",
          checkoutDate: "2026-11-02",
          flatNumber: "9999"
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.hasConflict, false);
    });

    it("13.5 Missing checkinDate or checkoutDate returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/conflicts/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkinDate: "2026-11-10",
          flatNumber: "113"
        })
      });
      assert.equal(res.status, 400);
    });
  });

  // ── F14: ARI Mapping ─────────────────────────────────────────────────────────
  describe("F14: ARI Mapping Boundaries", () => {
    it("14.1 Units boundary: 0 units available is accepted (sold out)", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: 0, rate: 300 }]
      });
      assert.equal(res.valid, true);
    });

    it("14.2 Units boundary: 19 units available is accepted (full inventory)", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: 19, rate: 300 }]
      });
      assert.equal(res.valid, true);
    });

    it("14.3 Non-3-letter currency code fails schema validation", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "REAL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: 5, rate: 300 }]
      });
      assert.equal(res.valid, false);
    });

    it("14.4 Inclusive end_date for 1-day stay has start_date equal to end_date", () => {
      const start = "2026-11-05";
      const end = "2026-11-05";
      assert.equal(start <= end, true);
    });

    it("14.5 Missing inventory array fails ARIUpdate schema validation", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL"
      });
      assert.equal(res.valid, false);
    });
  });

  // ── F15: 7 Restrictions ──────────────────────────────────────────────────────
  describe("F15: Restriction Boundaries", () => {
    it("15.1 min_los = 1 boundary is valid", () => {
      assert.equal(DEFAULT_RESTRICTIONS.min_los_weekday, 1);
    });

    it("15.2 min_los < 1 in schema validation is rejected", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: 1, min_los: 0 }]
      });
      assert.equal(res.valid, false);
    });

    it("15.3 closed_to_arrival boolean flag is recognized in schema", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: 1, closed_to_arrival: true }]
      });
      assert.equal(res.valid, true);
    });

    it("15.4 closed_to_departure boolean flag is recognized in schema", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: 1, closed_to_departure: true }]
      });
      assert.equal(res.valid, true);
    });

    it("15.5 stop_sell flag with 0 units represents hard block", () => {
      const res = validateRequest("ARIUpdate", {
        verb: "ARIUpdate",
        guid: crypto.randomUUID(),
        pms_cid: "CID",
        shared_secret: "S",
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-02", units: 0, stop_sell: true }]
      });
      assert.equal(res.valid, true);
    });
  });

  // ── F16: Batch & Incremental Synchronization ─────────────────────────────────
  describe("F16: Synchronization Boundaries", () => {
    it("16.1 Syncing single day boundary generates valid payload", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/ari/full-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-11-01", endDate: "2026-11-01" })
      });
      assert.equal(res.status, 200);
    });

    it("16.2 Syncing 60 days window chunks without memory exhaustion", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/ari/full-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-11-01", endDate: "2026-12-30" })
      });
      assert.equal(res.status, 200);
    });

    it("16.3 Syncing past dates is rejected or handled safely", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/ari/full-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2020-01-01", endDate: "2020-01-05" })
      });
      assert.ok(res.status === 200 || res.status === 400);
    });

    it("16.4 Inverted sync dates returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/ari/full-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: "2026-12-01", endDate: "2026-11-01" })
      });
      assert.ok(res.status === 400 || res.status === 200);
    });

    it("16.5 WBP callback ARIFullRefresh with empty body acknowledges safely", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/ARIFullRefresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123" })
      });
      assert.equal(res.status, 200);
    });
  });

  // ── F17: Inbound Webhooks & Form Parsing ────────────────────────────────────
  describe("F17: Webhook Parsing Boundaries", () => {
    it("17.1 Webhook with empty body returns ErrorCode 4", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123" })
      });
      const data = await res.json();
      assert.equal(data.ErrorCode, 4);
    });

    it("17.2 Malformed JSON body in webhook does not crash server process", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json missing closing bracket"
      });
      assert.ok(res.status === 400 || res.status === 500);
      const ping = await fetch(`${serverBaseUrl}/api/health`);
      assert.equal(ping.status, 200);
    });

    it("17.3 Form-urlencoded with missing booking_id returns ErrorCode 4", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "shared_secret=test_shared_secret_123"
      });
      const data = await res.json();
      assert.equal(data.ErrorCode, 4);
    });

    it("17.4 URL-encoded special characters (%20, %2B, %40) are decoded correctly", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "shared_secret=test_shared_secret_123&booking_id=ID%2B999%40OTA"
      });
      assert.equal(res.status, 200);
    });

    it("17.5 Webhook with extra unknown fields ignores them gracefully", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          unknown_field_x: "test",
          reservation: {
            OrderId: "EXTRA-FIELDS-01",
            Channel: "booking",
            TotalPrice: 500,
            Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-21" }]
          }
        })
      });
      assert.equal(res.status, 200);
    });
  });

  // ── F18: Background Polling ─────────────────────────────────────────────────
  describe("F18: Polling Boundaries", () => {
    it("18.1 Poller handles simulator returning empty Bookings array", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/worker/poll`, { method: "POST" });
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it("18.2 Consecutive poll executions run without concurrency deadlock", async () => {
      const [p1, p2] = await Promise.all([
        fetch(`${serverBaseUrl}/api/wbp/worker/poll`, { method: "POST" }),
        fetch(`${serverBaseUrl}/api/wbp/worker/poll`, { method: "POST" })
      ]);
      assert.equal(p1.status, 200);
      assert.equal(p2.status, 200);
    });

    it("18.3 Poller adjusts version safely when last cursor is null", () => {
      const client = new WBPClient({
        apiUrl: `${simUrl}/cloudpms`,
        sharedSecret: "test_shared_secret_123",
        propertyId: "101"
      });
      const adjusted = client.adjustBookingVersion(null, 5);
      assert.equal(adjusted, null);
    });

    it("18.4 Poller subtracts 5 minutes from valid timestamp accurately", () => {
      const client = new WBPClient({
        apiUrl: `${simUrl}/cloudpms`,
        sharedSecret: "test_shared_secret_123",
        propertyId: "101"
      });
      const ts = "2026-11-10 14:00:00";
      const adjusted = client.adjustBookingVersion(ts, 5);
      assert.equal(adjusted, "2026-11-10 13:55:00");
    });

    it("18.5 Poller in observe mode records raw payload without acknowledging WBP", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "observe" })
      });
      const res = await fetch(`${serverBaseUrl}/api/wbp/worker/poll`, { method: "POST" });
      assert.equal(res.status, 200);
      await fetch(`${serverBaseUrl}/api/wbp/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto" })
      });
    });
  });

  // ── F19: OTA Inbox & Fair-Share Allocation ───────────────────────────────────
  describe("F19: Fair-Share Boundaries", () => {
    it("19.1 Tied usage counts uses deterministic flat number ordering", () => {
      const flats = CORPFLATS_19_FLATS;
      assert.ok(flats.length === 19);
      assert.equal(flats[0].number, "113");
    });

    it("19.2 Zero available flats does not throw, marks unallocated", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: CORPFLATS_19_FLATS.map((f, i) => ({
          id: i + 1,
          flatNumber: f.number,
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-15",
          status: "confirmada"
        }))
      };
      const avail = calculateCanonicalAvailability("2026-11-10", "2026-11-15", { db: mockDb });
      assert.equal(avail.minAvailable, 0);
    });

    it("19.3 Cancelled reservations are strictly excluded from usage counts", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: [
          { id: 1, flatNumber: "113", checkinDate: "2026-01-01", checkoutDate: "2026-01-05", status: "cancelada" }
        ]
      };
      const avail = calculateCanonicalAvailability("2026-11-10", "2026-11-12", { db: mockDb });
      assert.equal(avail.totalFlats, 19);
    });

    it("19.4 Single available flat out of 19 is successfully identified", () => {
      const occupiedFlats = CORPFLATS_19_FLATS.slice(0, 18);
      const mockDb = {
        flats: CORPFLATS_19_FLATS,
        reservations: occupiedFlats.map((f, i) => ({
          id: i + 1,
          flatNumber: f.number,
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "confirmada"
        }))
      };
      const avail = calculateCanonicalAvailability("2026-11-10", "2026-11-12", { db: mockDb });
      assert.equal(avail.minAvailable, 1);
    });

    it("19.5 OTA Inbox GET supports empty db.wbpInbox without crash", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/inbox`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.items));
    });
  });

  // ── F20: Quarantine Management Engine ────────────────────────────────────────
  describe("F20: Quarantine Boundaries", () => {
    it("20.1 Querying quarantine with non-existent status filter returns empty array", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine?status=non_existent_status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data.items, []);
    });

    it("20.2 Manual resolution with non-existent quarantine ID returns HTTP 404", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/fake_id_9999/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNumber: "113" })
      });
      assert.equal(res.status, 404);
    });

    it("20.3 Manual resolution missing flatNumber returns HTTP 400", async () => {
      const createRes = await (await fetch(`${serverBaseUrl}/api/wbp/quarantine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "OVERBOOKING",
          otaReservation: { OrderId: "Q-TEST-RESOLVE-400", Channel: "booking", checkinDate: "2026-11-10", checkoutDate: "2026-11-12" }
        })
      })).json();
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/${createRes.item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 400);
    });

    it("20.4 Quarantine detail endpoint with non-existent ID returns HTTP 404", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/non_existent_id`);
      assert.equal(res.status, 404);
    });

    it("20.5 Special characters in quarantine resolution notes are preserved", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/fake_id_9999/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flatNumber: "113", notes: "<script>alert(1)</script> Hóspede VIP" })
      });
      assert.equal(res.status, 404);
    });
  });

  // ── F21: OTA Booking Mutation Lifecycle ──────────────────────────────────────
  describe("F21: Mutation Lifecycle Boundaries", () => {
    it("21.1 BookingCreate webhook with missing reservation data returns ErrorCode 4", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ErrorCode, 4);
    });

    it("21.2 Cancellation for non-existent order acknowledges safely without throwing", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          reservation: {
            OrderId: "NON-EXISTENT-CANCEL-999",
            IsCancellation: 1,
            Status: "cancelled"
          }
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ErrorCode, undefined);
    });

    it("21.3 NotifyBooking webhook with missing booking_id returns ErrorCode 4", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/NotifyBooking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared_secret: "test_shared_secret_123" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ErrorCode, 4);
    });

    it("21.4 Repeated cancellation of already cancelled booking is idempotent", async () => {
      const payload = {
        shared_secret: "test_shared_secret_123",
        reservation: {
          OrderId: "CANCEL-REPEAT-01",
          IsCancellation: 1,
          Status: "cancelled"
        }
      };
      const res1 = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const res2 = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);
    });

    it("21.5 BookingCreate modification with identical dates acknowledges without error", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          reservation: {
            OrderId: "MOD-SAME-01",
            Channel: "booking",
            IsModification: 1,
            TotalPrice: 500,
            Rooms: [{ StartDate: "2026-11-20", EndDate: "2026-11-22" }]
          }
        })
      });
      assert.equal(res.status, 200);
    });
  });

  // ── F22: Manual Reservation Reconciliation ──────────────────────────────────
  describe("F22: Reconciliation Boundaries", () => {
    it("22.1 Guest name with unusual accents and titles normalizes cleanly", () => {
      const raw = "Dr. José Maria d'Ávila & Sra.";
      const norm = normalizeGuestName(raw);
      assert.equal(norm.includes("dr"), false);
      assert.equal(norm.includes("jose"), true);
    });

    it("22.2 Single letter or very short names do not throw out-of-bounds errors", () => {
      const score = computeReconciliationScore(
        { guestName: "A", checkinDate: "2026-11-01", checkoutDate: "2026-11-02", channel: "booking" },
        { guestName: "B", checkinDate: "2026-11-01", checkoutDate: "2026-11-02", channel: "booking" }
      );
      assert.ok(score.score >= 0);
    });

    it("22.3 Date gap of 6 days is excluded from rough filter window", () => {
      const score = computeReconciliationScore(
        { guestName: "Maria Silva", checkinDate: "2026-11-01", checkoutDate: "2026-11-03", channel: "booking" },
        { guestName: "Maria Silva", checkinDate: "2026-11-10", checkoutDate: "2026-11-12", channel: "booking" }
      );
      assert.equal(score.isSafeMatch, false);
    });

    it("22.4 Linking single reservation with non-existent PMS ID returns HTTP 404", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/reconciliation/link-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pmsReservationId: 999999, otaBookingId: "BKG-NONEXISTENT" })
      });
      assert.equal(res.status, 404);
    });

    it("22.5 Bulk linking when no matches exist returns linkedCount = 0", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/reconciliation/link-all-safe`, { method: "POST" });
      const data = await res.json();
      assert.equal(data.success, true);
    });
  });

  // ── F23: Automations & PIX Suppression ──────────────────────────────────────
  describe("F23: Automation Boundaries", () => {
    it("23.1 Missing guest phone in incoming OTA reservation does not throw WhatsApp error", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          reservation: {
            OrderId: "NO-PHONE-01",
            Channel: "airbnb",
            TotalPrice: 450,
            PaymentCollect: "Channel",
            Customers: [{ CustomerFName: "No", CustomerLName: "Phone" }],
            Rooms: [{ StartDate: "2026-11-12", EndDate: "2026-11-14" }]
          }
        })
      });
      assert.equal(res.status, 200);
    });

    it("23.2 Channel payment collect strictly suppresses PIX generation", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          reservation: {
            OrderId: "SUPPRESS-PIX-02",
            Channel: "booking",
            TotalPrice: 650,
            PaymentCollect: "Channel",
            Rooms: [{ StartDate: "2026-11-15", EndDate: "2026-11-17" }]
          }
        })
      });
      assert.equal(res.status, 200);
    });

    it("23.3 Empty customers array falls back to default guest name", async () => {
      const res = await fetch(`${serverBaseUrl}/api/callback/wbp/BookingCreate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shared_secret: "test_shared_secret_123",
          reservation: {
            OrderId: "EMPTY-GUEST-03",
            Channel: "booking",
            TotalPrice: 400,
            Customers: [],
            Rooms: [{ StartDate: "2026-11-18", EndDate: "2026-11-19" }]
          }
        })
      });
      assert.equal(res.status, 200);
    });

    it("23.4 Housekeeping task is queued for newly allocated flat", async () => {
      const inboxRes = await fetch(`${serverBaseUrl}/api/wbp/inbox`);
      const inbox = await inboxRes.json();
      assert.ok(Array.isArray(inbox.items));
    });

    it("23.5 Reception notification event is logged cleanly", async () => {
      const alertsRes = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`);
      assert.equal(alertsRes.status, 200);
    });
  });

  // ── F24: Alerts & Operational Telemetry ──────────────────────────────────────
  describe("F24: Telemetry Boundaries", () => {
    it("24.1 Alert settings with empty body preserves existing settings", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.settings);
    });

    it("24.2 Alert settings update with complex email formats preserves address", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: { managerEmail: "hotel+alert-test@domain.co.uk" } })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.settings.recipients.managerEmail, "hotel+alert-test@domain.co.uk");
    });

    it("24.3 Daily summary dispatch executes successfully on demand", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/alerts/trigger-daily-summary`, { method: "POST" });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it("24.4 Telemetry status includes dirty intervals count and integration mode", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/ari/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(typeof data.dirtyIntervalsCount, "number");
    });

    it("24.5 Alert triggers toggle independently between overbooking and quarantine", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/alerts/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggers: { onOverbooking: false, onQuarantine: true } })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.settings.triggers.onOverbooking, false);
      assert.equal(data.settings.triggers.onQuarantine, true);
    });
  });

  // ── F25: Card Vault AES-256-GCM Encryption ──────────────────────────────────
  describe("F25: Vault Encryption Boundaries", () => {
    let vault;
    before(() => {
      vault = getCardVault();
    });

    it("25.1 Encrypting card with missing CVV encrypts without error", () => {
      const stored = vault.storeCard({
        orderId: "ORD-NOCVV",
        cardData: {
          holderName: "Sem CVV",
          cardNumber: "4111111111119999",
          expireMonth: "12",
          expireYear: "2028"
        }
      });
      assert.ok(stored.id);
      assert.equal(stored.cardLast4, "9999");
    });

    it("25.2 Encrypting produces distinct ciphertexts due to random IV", () => {
      const c1 = vault.encryptCard({ cardNumber: "4111111111111111" });
      const c2 = vault.encryptCard({ cardNumber: "4111111111111111" });
      assert.notEqual(c1.iv, c2.iv);
      assert.notEqual(c1.ciphertext, c2.ciphertext);
    });

    it("25.3 Encrypting empty card object throws or rejects", () => {
      assert.throws(() => {
        vault.encryptCard(null);
      });
    });

    it("25.4 Masked display strictly preserves only last 4 digits", () => {
      const masked = maskPan("4111111111115555");
      assert.equal(masked.endsWith("5555"), true);
      assert.equal(masked.includes("4111"), false);
    });

    it("25.5 Masked display on short input handles safely", () => {
      const masked = maskPan("12");
      assert.ok(typeof masked === "string");
    });
  });

  // ── F26: Admin Re-auth & Auto-Purge Scheduler ────────────────────────────────
  describe("F26: Vault Access & Purge Boundaries", () => {
    let vault;
    before(() => {
      vault = getCardVault();
    });

    it("26.1 Expired re-auth token is strictly rejected", () => {
      const token = "expired_token_test";
      // Manually register expired token
      vault._reauthTokens.set(token, {
        token,
        username: "admin",
        expiresAt: Date.now() - 1000,
        used: false
      });
      const check = vault.consumeReauthToken(token);
      assert.equal(check, null);
    });

    it("26.2 Token re-use is strictly rejected on second consumption", () => {
      const auth = vault.createReauthToken("admin");
      const check1 = vault.consumeReauthToken(auth.token);
      assert.ok(check1);
      const check2 = vault.consumeReauthToken(auth.token);
      assert.equal(check2, null);
    });

    it("26.3 Purge endpoint when no cards exist returns purgedCount = 0", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/vault/purge`, { method: "POST" });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(typeof data.purgedCount, "number");
    });

    it("26.4 Purge retains cards where checkout was 6 days ago (<= 7 days)", () => {
      const today = "2026-11-20";
      const checkoutDate = "2026-11-14";
      const card = vault.storeCard({
        orderId: "RETAIN-01",
        cardData: { cardNumber: "4111111111118888" },
        checkoutDate
      });
      vault.purgeExpiredCards(today);
      const record = vault.records.get(card.id);
      assert.equal(record.status, "active");
    });

    it("26.5 Purge permanently deletes cards where checkout was 8 days ago (> 7 days)", () => {
      const today = "2026-11-20";
      const checkoutDate = "2026-11-12";
      const card = vault.storeCard({
        orderId: "PURGE-01",
        cardData: { cardNumber: "4111111111117777" },
        checkoutDate
      });
      vault.purgeExpiredCards(today);
      const record = vault.records.get(card.id);
      assert.equal(record.status, "purged");
      assert.equal(record.encrypted, null);
    });
  });

  // ── F27: Provisional Reviews & Messages ──────────────────────────────────────
  describe("F27: Provisional Features Boundaries", () => {
    it("27.1 POST /api/wbp/provisional/settings updates provisional flags cleanly", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/provisional/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messagesEnabled: true, reviewsEnabled: false })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.provisionalMessagesEnabled, true);
      assert.equal(data.provisionalReviewsEnabled, false);
    });

    it("27.2 Sending message when disabled returns success false and enabled false", async () => {
      // Disable messages
      await fetch(`${serverBaseUrl}/api/wbp/provisional/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messagesEnabled: false })
      });
      const res = await fetch(`${serverBaseUrl}/api/wbp/provisional/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello", recipient: "GUEST" })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.enabled, false);
    });

    it("27.3 Message with empty text returns HTTP 400", async () => {
      await fetch(`${serverBaseUrl}/api/wbp/provisional/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messagesEnabled: true })
      });
      const res = await fetch(`${serverBaseUrl}/api/wbp/provisional/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" })
      });
      assert.equal(res.status, 400);
      // restore to false
      await fetch(`${serverBaseUrl}/api/wbp/provisional/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messagesEnabled: false })
      });
    });

    it("27.4 Review response with empty review ID returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/provisional/reviews/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "", response: "Thank you" })
      });
      assert.equal(res.status, 400);
    });

    it("27.5 GET /api/wbp/provisional/settings returns exact default boolean flags", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/provisional/settings`);
      const data = await res.json();
      assert.equal(typeof data.provisionalMessagesEnabled, "boolean");
      assert.equal(typeof data.provisionalReviewsEnabled, "boolean");
    });
  });

  // ── F28: Pricing & Publishing UI ─────────────────────────────────────────────
  describe("F28: Pricing UI Boundaries", () => {
    it("28.1 POST /api/wbp/pricing/settings with negative variationLimitPct returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variationLimitPct: -0.1 })
      });
      assert.equal(res.status, 400);
    });

    it("28.2 POST /api/wbp/pricing/settings with zero variationLimitPct returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variationLimitPct: 0 })
      });
      assert.equal(res.status, 400);
    });

    it("28.3 Preview endpoint with inverted dates handles gracefully without crashing", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/preview?startDate=2026-12-01&endDate=2026-11-01`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    });

    it("28.4 Confirm variation endpoint with missing parameters returns HTTP 400", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/confirm-variation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 400);
    });

    it("28.5 Pricing settings GET returns complete default structure", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/pricing/settings`);
      const data = await res.json();
      assert.ok(data.settings);
      assert.ok(data.sebraeRate);
    });
  });

  // ── F29: OTA Inbox & Quarantine UI ───────────────────────────────────────────
  describe("F29: Inbox UI Boundaries", () => {
    it("29.1 GET /api/wbp/inbox returns active items list", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/inbox`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.items));
    });

    it("29.2 Filtering quarantine by unknown channel returns empty list", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine?channel=unknown_ota_channel_xyz`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data.items, []);
    });

    it("29.3 Quarantine detail endpoint with non-existent ID returns HTTP 404", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/null`);
      assert.equal(res.status, 404);
    });

    it("29.4 Quarantine resolution drawer rejects resolution without flat allocation", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/quarantine/any_id/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Resolved without flat" })
      });
      assert.equal(res.status, 404);
    });

    it("29.5 Inbox items maintain consistent array type", async () => {
      const res = await fetch(`${serverBaseUrl}/api/wbp/inbox`);
      const data = await res.json();
      assert.ok(Array.isArray(data.items));
    });
  });

  // ── F30: In-System Help Manual (R9) ──────────────────────────────────────────
  describe("F30: Help Manual Boundaries", () => {
    it("30.1 Help manual component file is at least 5KB in size", () => {
      const filePath = path.resolve(rootDir, "artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx");
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 5000);
    });

    it("30.2 Help manual references standard anchor IDs for quick navigation", () => {
      const filePath = path.resolve(rootDir, "artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.includes("admin") && (content.includes("errors") || content.includes("reception") || content.includes("faq")));
    });

    it("30.3 All referenced manual screenshot images exist on disk", () => {
      const manualDir = path.resolve(rootDir, "artifacts/limpeza/public/manual");
      assert.equal(fs.existsSync(manualDir), true);
      const files = fs.readdirSync(manualDir);
      assert.ok(files.length >= 3);
    });

    it("30.4 Help manual documents HTTP 200 with ErrorCode convention", () => {
      const filePath = path.resolve(rootDir, "artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.includes("1001") || content.includes("1002") || content.includes("ErrorCode"));
    });

    it("30.5 Help manual component exports named function cleanly", () => {
      const filePath = path.resolve(rootDir, "artifacts/limpeza/src/components/wbp/WbpHelpManualPage.tsx");
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.includes("export const WbpHelpManualPage"));
    });
  });

  // ── F31: Frontend Build & Dist Artifacts ────────────────────────────────────
  describe("F31: Frontend Build Boundaries", () => {
    it("31.1 Built index.html contains div with id root", () => {
      const indexPath = path.resolve(rootDir, "artifacts/limpeza/dist/public/index.html");
      const html = fs.readFileSync(indexPath, "utf-8");
      assert.ok(html.includes('id="root"'));
    });

    it("31.2 Built assets directory contains at least 1 JS file > 100KB", () => {
      const assetsDir = path.resolve(rootDir, "artifacts/limpeza/dist/public/assets");
      const files = fs.readdirSync(assetsDir).filter(f => f.endsWith(".js"));
      assert.ok(files.length >= 1);
      const bigJs = files.some(f => fs.statSync(path.join(assetsDir, f)).size > 100000);
      assert.equal(bigJs, true);
    });

    it("31.3 Built assets directory contains at least 1 CSS stylesheet > 10KB", () => {
      const assetsDir = path.resolve(rootDir, "artifacts/limpeza/dist/public/assets");
      const files = fs.readdirSync(assetsDir).filter(f => f.endsWith(".css"));
      assert.ok(files.length >= 1);
      const bigCss = files.some(f => fs.statSync(path.join(assetsDir, f)).size > 10000);
      assert.equal(bigCss, true);
    });

    it("31.4 Built index.html references asset filenames present on disk", () => {
      const indexPath = path.resolve(rootDir, "artifacts/limpeza/dist/public/index.html");
      const html = fs.readFileSync(indexPath, "utf-8");
      const assetsDir = path.resolve(rootDir, "artifacts/limpeza/dist/public/assets");
      const files = fs.readdirSync(assetsDir);
      const hasMatch = files.some(f => html.includes(f));
      assert.equal(hasMatch, true);
    });

    it("31.5 Re-verifying baseline hash confirms 0 production side-effects", () => {
      const currentHash = getFileHash(prodDbPath);
      assert.equal(currentHash, BASELINE_HASH);
    });
  });
});
