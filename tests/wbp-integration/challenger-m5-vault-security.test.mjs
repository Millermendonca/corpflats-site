/**
 * tests/wbp-integration/challenger-m5-vault-security.test.mjs
 *
 * Milestone 5 Challenger Test Suite:
 * Adversarial stress-testing of Credit Card Encrypted Vault, Admin Reauthentication,
 * Single-Use Token Burning, Time-Travel Auto-Purge, and Zero-Leakage Forensics.
 *
 * Strict Compliance:
 * - AGENTS.md test rules: Isolated test, NODE_ENV="test", DATABASE_URL deleted.
 * - Dynamic ports, isolated DB & Vault in os.tmpdir().
 * - Baseline data/database.json SHA-256 pre and post validation.
 * - Never run in global sweeps.
 */

process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

const VAULT_TEST_KEY = "challenger_card_vault_key_2026_test";
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

import {
  CreditCardVault,
  getCardVault,
  stripCvvDeep,
  maskPan,
  detectCardBrand,
  maskPanDeep,
  addDays,
  runZeroLeakageForensicAudit
} from "../../artifacts/api-server/wbp/vault.mjs";

import {
  processIncomingOTA,
  handleOtaCancellation,
  normalizeOtaBooking
} from "../../artifacts/api-server/wbp/inbox.mjs";

import { WbpSimulatorServer } from "../../e2e/wbp-simulator/server.mjs";

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

async function waitForServer(url, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server at ${url} failed to start within ${timeoutMs}ms.`);
}

describe("Milestone 5 Challenger: Vault Security, Reauth & Auto-Purge Stress", () => {
  let initialDbHash;
  let tmpDir;
  let tmpDbPath;
  let tmpVaultPath;
  let tmpStoragePath;
  let tmpAuditLogPath;
  let serverProcess;
  let serverPort;
  let serverUrl;
  let simulator;
  let simulatorPort;

  const EXPECTED_DB_HASH = "7E94A217681EA595DC10681EC3D1AD0964E6B2DBCE828ACD8F6D8633B87E71C6";
  const TEST_RESERVATION_ID = 901;
  const TEST_ORDER_ID = "WBP-CHALLENGER-RES-901";
  const TEST_PAN = "4111222233334444";
  const TEST_CVV = "842";

  before(async () => {
    // 1. Verify baseline production DB
    const dbBuffer = fs.readFileSync(prodDbPath);
    initialDbHash = crypto.createHash("sha256").update(dbBuffer).digest("hex").toUpperCase();
    assert.equal(
      initialDbHash,
      EXPECTED_DB_HASH,
      "Baseline data/database.json must match canonical SHA-256 hash before test suite."
    );

    // 2. Setup isolated temp directory and files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gfm-challenger-m5-"));
    tmpDbPath = path.join(tmpDir, "database.json");
    tmpVaultPath = path.join(tmpDir, "wbp_card_vault.json");
    tmpStoragePath = path.join(tmpDir, "wbp_storage_state.json");
    tmpAuditLogPath = path.join(tmpDir, "audit_logs.jsonl");

    // Copy production database seed into tmp
    const prodContent = JSON.parse(fs.readFileSync(prodDbPath, "utf-8"));
    prodContent.settings = prodContent.settings || {};
    prodContent.settings.wbp_integration_mode = "auto";
    prodContent.settings.wbp_provisional_messages_enabled = false;
    prodContent.settings.wbp_provisional_reviews_enabled = false;

    // Seed test reservation with card
    const seededReservation = {
      id: TEST_RESERVATION_ID,
      code: "RES-101-9001",
      flatId: 1,
      flatNumber: "101",
      guestName: "Carlos Challenger",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-06",
      totalAmount: 1800.0,
      paidAmount: 0,
      paymentCollect: "Property",
      status: "ativa",
      hasCard: true,
      cardLast4: "4444",
      cardBrand: "Visa",
      vaultStatus: "active",
      externalOrderId: TEST_ORDER_ID,
      wbpBookingId: TEST_ORDER_ID
    };

    prodContent.reservations = prodContent.reservations || [];
    prodContent.reservations.push(seededReservation);
    fs.writeFileSync(tmpDbPath, JSON.stringify(prodContent, null, 2), "utf-8");

    // Pre-populate card in vault
    process.env.WBP_CARD_VAULT_FILE = tmpVaultPath;
    process.env.DATA_FILE = tmpDbPath;
    process.env.CREDIT_CARD_VAULT_KEY = VAULT_TEST_KEY;

    const testVault = new CreditCardVault({ storageFile: tmpVaultPath, key: VAULT_TEST_KEY });
    testVault.storeCard({
      orderId: TEST_ORDER_ID,
      reservationId: TEST_RESERVATION_ID,
      cardData: {
        cardNumber: TEST_PAN,
        holderName: "Carlos Challenger",
        expireMonth: "11",
        expireYear: "2029",
        brand: "Visa"
      },
      checkoutDate: "2026-11-06"
    });

    // 3. Start WBP Simulator
    simulatorPort = await getAvailablePort();
    simulator = new WbpSimulatorServer({ port: simulatorPort });
    await simulator.start();

    // 4. Start Demo Server
    serverPort = await getAvailablePort();
    serverUrl = `http://127.0.0.1:${serverPort}`;

    const serverScript = path.resolve(rootDir, "artifacts/api-server/demo-server.mjs");
    const childEnv = {
      ...process.env,
      PORT: String(serverPort),
      DATA_FILE: tmpDbPath,
      NODE_ENV: "test",
      WBP_CARD_VAULT_FILE: tmpVaultPath,
      WBP_BASE_URL: `${simulator.url}/api/cloudpms`,
      WBP_PMS_CID: "gfm1",
      WBP_SHARED_SECRET: "challenger_secret_m5",
      CREDIT_CARD_VAULT_KEY: VAULT_TEST_KEY
    };
    delete childEnv.DATABASE_URL;

    serverProcess = spawn("node", [serverScript], {
      env: childEnv,
      stdio: "pipe",
      cwd: rootDir
    });

    serverProcess.stdout.on("data", (d) => {
      if (process.env.DEBUG_TEST) console.log("[Server stdout]", d.toString().trim());
    });
    serverProcess.stderr.on("data", (d) => {
      if (process.env.DEBUG_TEST) console.error("[Server stderr]", d.toString().trim());
    });

    await waitForServer(serverUrl);
  });

  after(async () => {
    delete process.env.WBP_CARD_VAULT_FILE;
    delete process.env.DATA_FILE;
    delete process.env.CREDIT_CARD_VAULT_KEY;

    if (serverProcess) {
      killProcessTree(serverProcess.pid);
    }
    if (simulator) {
      await simulator.stop();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}

    // Assert baseline database SHA-256 untouched
    const postDbBuffer = fs.readFileSync(prodDbPath);
    const postDbHash = crypto.createHash("sha256").update(postDbBuffer).digest("hex").toUpperCase();
    assert.equal(
      postDbHash,
      initialDbHash,
      "CRITICAL: data/database.json baseline SHA-256 hash must be 100% UNCHANGED after test run."
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 1: Single-Use Token Burning Stress & Replay Flooding
  // ──────────────────────────────────────────────────────────────────────────
  describe("Challenge 1: Single-Use Token Burning Stress & Replay Flooding", () => {
    it("1.1 Single-use token burning: 1st view succeeds, 10 concurrent replays 100% fail 403 Forbidden", async () => {
      // Step 1: Issue a valid token
      const reauthRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "admin123",
          reservationId: TEST_RESERVATION_ID
        })
      });

      assert.equal(reauthRes.status, 200, "Reauth should succeed for admin.");
      const reauthData = await reauthRes.json();
      const token = reauthData.token;
      assert.ok(token, "A single-use token must be issued.");

      // Step 2: First view attempt MUST succeed
      const view1 = await fetch(`${serverUrl}/api/wbp/vault/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reservationId: TEST_RESERVATION_ID
        })
      });

      assert.equal(view1.status, 200, "First view with valid token must succeed.");
      const viewData1 = await view1.json();
      assert.equal(viewData1.success, true);
      assert.equal(viewData1.card.cardNumber, TEST_PAN);
      assert.equal(viewData1.card.cvv, undefined, "CVV must never be returned.");

      // Step 3: Fire 10 concurrent requests reusing the EXACT same burned token
      const replayPromises = Array.from({ length: 10 }, () =>
        fetch(`${serverUrl}/api/wbp/vault/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            reservationId: TEST_RESERVATION_ID
          })
        })
      );

      const replayResponses = await Promise.all(replayPromises);

      // Step 4: Assert 100% of replay requests fail with HTTP 403 Forbidden
      let forbiddenCount = 0;
      for (const res of replayResponses) {
        if (res.status === 403) {
          forbiddenCount++;
          const body = await res.json();
          assert.equal(body.success, false);
          assert.match(body.error, /inválido, expirado ou já utilizado/i);
        }
      }

      assert.equal(
        forbiddenCount,
        10,
        `Expected 100% of replay requests (10/10) to fail with HTTP 403 Forbidden. Got ${forbiddenCount}/10.`
      );
    });

    it("1.2 Concurrent race condition flooding: 10 simultaneous requests with fresh token -> exactly 1 succeeds, 9 fail 403", async () => {
      // Issue another fresh token
      const reauthRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "admin123",
          reservationId: TEST_RESERVATION_ID
        })
      });
      const { token } = await reauthRes.json();
      assert.ok(token);

      // Fire 10 simultaneous requests to consume the token concurrently
      const racePromises = Array.from({ length: 10 }, () =>
        fetch(`${serverUrl}/api/wbp/vault/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            reservationId: TEST_RESERVATION_ID
          })
        })
      );

      const raceResponses = await Promise.all(racePromises);
      const statuses = raceResponses.map(r => r.status);
      const successes = statuses.filter(s => s === 200);
      const failures = statuses.filter(s => s === 403);

      assert.equal(
        successes.length,
        1,
        `Race condition stress: Exactly 1 request must win and consume token. Got ${successes.length} successes.`
      );
      assert.equal(
        failures.length,
        9,
        `Race condition stress: 9 requests must lose and receive 403 Forbidden. Got ${failures.length} failures.`
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 2: Token Expiration Stress & Time Advance
  // ──────────────────────────────────────────────────────────────────────────
  describe("Challenge 2: Token Expiration Stress & Time Advance", () => {
    it("2.1 Token expiration stress: simulated time advance past 5 minutes (301 seconds) is rejected with 403", async () => {
      // Step 1: Issue a valid token
      const reauthRes = await fetch(`${serverUrl}/api/wbp/vault/reauth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "admin123",
          reservationId: TEST_RESERVATION_ID
        })
      });
      const reauthData = await reauthRes.json();
      const token = reauthData.token;
      assert.ok(token, "Token must be issued.");

      // Step 2: Simulate time advance past 5 minutes (301 seconds = 301000 ms)
      const timeTravelRes = await fetch(`${serverUrl}/api/test/time-travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offsetMs: 301 * 1000 })
      });
      assert.equal(timeTravelRes.status, 200, "Time-travel endpoint must accept time offset.");

      // Step 3: Attempt viewing with the expired token
      const viewRes = await fetch(`${serverUrl}/api/wbp/vault/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          reservationId: TEST_RESERVATION_ID
        })
      });

      // Reset time travel immediately
      await fetch(`${serverUrl}/api/test/time-travel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true })
      });

      // Step 4: Assert token is rejected with HTTP 403 Forbidden
      assert.equal(
        viewRes.status,
        403,
        `Expired token past 5 minutes MUST be rejected with HTTP 403 Forbidden. Got ${viewRes.status}.`
      );
      const viewBody = await viewRes.json();
      assert.equal(viewBody.success, false);
      assert.match(viewBody.error, /inválido, expirado ou já utilizado/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 3: Time-Travel Auto-Purge Stress (D+6 vs D+7 and Cancellation)
  // ──────────────────────────────────────────────────────────────────────────
  describe("Challenge 3: Time-Travel Auto-Purge Stress", () => {
    it("3.1 D+6 days card remains active; D+7 days card payload is permanently purged", () => {
      const vaultFile = path.join(tmpDir, `vault_test_purge_${Date.now()}.json`);
      const isolatedVault = new CreditCardVault({ storageFile: vaultFile, key: VAULT_TEST_KEY });

      const checkoutDate = "2026-11-10";
      const orderId = "PURGE-D7-TEST";
      const resId = 555;

      isolatedVault.storeCard({
        orderId,
        reservationId: resId,
        cardData: {
          cardNumber: "4000123456789999",
          holderName: "Purge Test User",
          expireMonth: "10",
          expireYear: "2028",
          brand: "Visa"
        },
        checkoutDate
      });

      const initialRecord = isolatedVault.getCardRecordByIdentifier(resId);
      assert.equal(initialRecord.status, "active");
      assert.ok(initialRecord.encrypted, "Encrypted payload must exist initially.");
      assert.equal(initialRecord.purgeAfterDate, "2026-11-17", "Purge after date must be checkout + 7 days.");

      // Run purge at D+6 days ("2026-11-16")
      const purgedD6 = isolatedVault.purgeExpiredCards("2026-11-16");
      assert.equal(purgedD6, 0, "Zero cards must be purged at D+6 days.");

      const recordD6 = isolatedVault.getCardRecordByIdentifier(resId);
      assert.equal(recordD6.status, "active", "Card must remain active at D+6 days.");
      assert.ok(recordD6.encrypted, "Ciphertext must remain intact at D+6 days.");

      // Run purge at D+7 days ("2026-11-17")
      const purgedD7 = isolatedVault.purgeExpiredCards("2026-11-17");
      assert.equal(purgedD7, 1, "Exactly 1 card must be purged at D+7 days.");

      const recordD7 = isolatedVault.getCardRecordByIdentifier(resId);
      assert.equal(recordD7.status, "purged", "Card status must be permanently set to 'purged'.");
      assert.equal(recordD7.encrypted, null, "Ciphertext payload must be permanently null/deleted.");
      assert.equal(recordD7.purgeReason, "7_days_post_checkout");
      assert.ok(recordD7.purgedAt);

      // Decryption must return null
      const decrypted = isolatedVault.decryptCardByIdentifier(resId);
      assert.equal(decrypted, null, "Decryption of purged card must return null.");
    });

    it("3.2 Reservation cancellation without penalty immediately purges card payload", () => {
      const vaultFile = path.join(tmpDir, `vault_test_cancel_${Date.now()}.json`);
      const isolatedVault = new CreditCardVault({ storageFile: vaultFile, key: VAULT_TEST_KEY });

      const cancelOrderId = "CANCEL-IMMEDIATE-001";
      const cancelResId = 666;
      isolatedVault.storeCard({
        orderId: cancelOrderId,
        reservationId: cancelResId,
        cardData: {
          cardNumber: "5500111122223333",
          holderName: "Cancel User",
          expireMonth: "08",
          expireYear: "2030",
          brand: "Mastercard"
        },
        checkoutDate: "2027-01-15" // Far future
      });

      const before = isolatedVault.getCardRecordByIdentifier(cancelResId);
      assert.equal(before.status, "active");

      // Trigger handleOtaCancellation
      const mockDb = {
        reservations: [
          {
            id: cancelResId,
            code: "RES-102-6666",
            externalOrderId: cancelOrderId,
            wbpBookingId: cancelOrderId,
            status: "ativa",
            flatId: 2,
            flatNumber: "102",
            checkinDate: "2027-01-10",
            checkoutDate: "2027-01-15",
            vaultStatus: "active"
          }
        ],
        quarantineBookings: []
      };

      const cancelResult = handleOtaCancellation({
        db: mockDb,
        normalized: {
          externalOrderId: cancelOrderId,
          wbpBookingId: cancelOrderId,
          isCancellation: true
        },
        vault: isolatedVault
      });

      assert.equal(cancelResult.success, true);
      assert.equal(cancelResult.action, "cancelled");

      const afterRecord = isolatedVault.getCardRecordByIdentifier(cancelResId);
      assert.equal(afterRecord.status, "purged", "Card must be purged immediately on cancellation.");
      assert.equal(afterRecord.encrypted, null, "Encrypted payload must be permanently destroyed.");
      assert.equal(afterRecord.purgeReason, "cancelled_without_penalty");
      assert.equal(mockDb.reservations[0].vaultStatus, "purged");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Challenge 4: Zero-Leakage Forensics (Adversarial Recursive Regex Scan)
  // ──────────────────────────────────────────────────────────────────────────
  describe("Challenge 4: Zero-Leakage Forensics & Anti-Exfiltration", () => {
    it("4.1 Ingestion with known card & CVV produces ZERO plaintext occurrences across DB, state, logs and API", async () => {
      const forensicPan = "4929888877776666";
      const forensicCvv = "973";
      const forensicOrderId = "OTA-FORENSIC-LEAK-TEST";

      const rawOtaPayload = {
        orderId: forensicOrderId,
        reservation: {
          OrderId: forensicOrderId,
          StartDate: "2026-11-20",
          EndDate: "2026-11-22",
          TotalPrice: 950.0,
          PaymentCollect: "Property",
          guestName: "Forensic Investigator",
          CustomerFName: "Forensic",
          CustomerLName: "Investigator",
          email: "forensic@corpflats.test",
          phone: "22999990000",
          Rooms: [
            {
              RoomId: "flat",
              RateId: "sem_cafe",
              Adults: 2,
              Children: 0,
              StartDate: "2026-11-20",
              EndDate: "2026-11-22"
            }
          ],
          Cards: [
            {
              CardNumber: forensicPan,
              CardHolderName: "Forensic Investigator",
              CardExpireMonth: "07",
              CardExpireYear: "2029",
              CardCvv: forensicCvv,
              cvv: forensicCvv,
              security_code: forensicCvv
            }
          ]
        }
      };

      // 1. Ingest via normalizeOtaBooking & processIncomingOTA
      const mockDb = {
        settings: { wbp_integration_mode: "auto" },
        reservations: [],
        quarantineBookings: [],
        flats: [{ id: 1, number: "101" }, { id: 2, number: "102" }]
      };

      const normalized = normalizeOtaBooking(rawOtaPayload);
      const forensicVault = new CreditCardVault({
        storageFile: path.join(tmpDir, "forensic_vault.json"),
        key: VAULT_TEST_KEY
      });

      const processResult = await processIncomingOTA(normalized, {
        db: mockDb,
        vault: forensicVault
      });

      assert.equal(processResult.success, true);

      // Write mockDb to disk to simulate persistence
      const forensicDbFile = path.join(tmpDir, "forensic_db.json");
      fs.writeFileSync(forensicDbFile, JSON.stringify(mockDb, null, 2), "utf-8");

      // Write raw storage
      const forensicStorageFile = path.join(tmpDir, "wbp_storage_state.json");
      fs.writeFileSync(forensicStorageFile, JSON.stringify(normalized.rawPayload, null, 2), "utf-8");

      // 2. Perform exhaustive recursive regex search for PAN and CVV
      const auditResult = runZeroLeakageForensicAudit({
        pan: forensicPan,
        cvv: forensicCvv,
        db: mockDb,
        dbFilePath: forensicDbFile,
        storageFilePath: forensicStorageFile,
        auditLogFilePath: tmpAuditLogPath,
        apiResponses: [processResult, normalized]
      });

      assert.equal(auditResult.clean, true, `Leaked data found: ${auditResult.violations.join("; ")}`);
      assert.equal(auditResult.violationCount, 0, "Violation count must be strictly ZERO.");

      // 3. Independent rigorous regex scan over file contents
      const dbText = fs.readFileSync(forensicDbFile, "utf-8");
      const storageText = fs.readFileSync(forensicStorageFile, "utf-8");

      assert.equal(dbText.includes(forensicPan), false, "database.json must NOT contain unencrypted PAN.");
      assert.equal(
        new RegExp(`(?:"cvv"|"cvc"|"security_code"|CardCvv)\\s*:\\s*["']?${forensicCvv}["']?`, "i").test(dbText),
        false,
        "database.json must NOT contain CVV property."
      );
      assert.equal(storageText.includes(forensicPan), false, "storage state must NOT contain unencrypted PAN.");
      assert.equal(
        new RegExp(`(?:"cvv"|"cvc"|"security_code"|CardCvv)\\s*:\\s*["']?${forensicCvv}["']?`, "i").test(storageText),
        false,
        "storage state must NOT contain CVV property."
      );
    });
  });
});
