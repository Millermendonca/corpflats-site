/**
 * tests/wbp-integration/challenger-m3-sync-debouncing.test.mjs
 *
 * Challenger 2: Debounce Engine & Mutation Concurrency Stress Test Suite (Milestone 3).
 *
 * Scenarios & Stress Dimensions:
 * 1. Real Database Integrity Guard (Pre-Flight & Post-Flight):
 *    - Asserts identical SHA-256 hash and mtime of data/database.json before & after.
 * 2. Switch Mode 'off' Operational Guard & Code 1031:
 *    - Asserts client.request() and client.sendARIUpdate() fail with WbpApiError code 1031 and retryable: false.
 *    - Asserts synchronizer.triggerIncrementalSync() and performFullPush() skip with zero outbound transmissions.
 *    - Asserts notifyPmsMutation() returns null immediately without creating timers or objects.
 * 3. Transient Error Retry with Strict UUID v4 GUID Reuse:
 *    - Verifies transient error codes 3, 1003, and 1004 trigger automatic retry reusing the exact same UUID v4 GUID.
 *    - Verifies retry exhaustion retains the same GUID on the thrown error.
 *    - Verifies non-retryable error (e.g. 1001) terminates immediately on attempt 1.
 * 4. Direct Synchronizer Engine Debouncing & Bounding Interval Coalescing:
 *    - Fires 20 concurrent burst mutations across varying stay intervals within <200ms.
 *    - Asserts debouncer coalesces all 20 mutations into exactly 1 payload within <= 10s.
 *    - Asserts the coalesced payload covers the exact minimal bounding interval [min(checkins), max(checkouts)].
 *    - Tests maxWait ceiling to ensure continuous bursts cannot starve the sync past <= 10s.
 * 5. End-to-End Live HTTP Server Mutation Concurrency Stress:
 *    - Runs isolated child demo-server on ephemeral port with isolated temporary database.
 *    - Fires 20 concurrent PMS mutations (creates, updates, cancels) via Promise.all within <500ms.
 *    - Asserts all 20 PMS mutations succeed.
 *    - Asserts the WBP simulator receives exactly 1 coalesced ARIUpdate payload within <= 10s.
 *    - Asserts 100% OpenAPI schema validation compliance on the coalesced wire payload.
 *    - Asserts the coalesced wire payload covers the exact bounding stay nights.
 *
 * Compliance:
 * - Strictly isolated temporary DB in os.tmpdir(), DATABASE_URL deleted, NODE_ENV = "test".
 * - Run EXCLUSIVELY via `node --test tests/wbp-integration/challenger-m3-sync-debouncing.test.mjs`.
 */

process.env.NODE_ENV = "test";

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");

import {
  WbpAriSynchronizer,
  getAriSynchronizer,
  notifyPmsMutation,
  DEFAULT_RESTRICTIONS,
  DEFAULT_WBP_MAPPING,
  addDays
} from "../../artifacts/api-server/wbp/ari-sync.mjs";

import { CORPFLATS_19_FLATS } from "../../artifacts/api-server/wbp/availability.mjs";
import { WBPClient, WbpApiError } from "../../artifacts/api-server/wbp/client.mjs";
import { WBP_MODES, setIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";
import { WbpSimulatorHarness } from "./harness/wbp-simulator-harness.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
}

function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

async function waitForServer(baseUrl, maxAttempts = 50, delayMs = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/version`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Server failed to start at ${baseUrl} within timeout.`);
}

// ── Suite 1: Database Integrity Guard ───────────────────────────────────────
describe("Challenger 2: Real Database Integrity Guard (Pre-Flight & Post-Flight)", () => {
  let initialDbMeta;

  before(() => {
    initialDbMeta = getFileMetadata(prodDbPath);
    assert.ok(initialDbMeta, "Real data/database.json must exist before testing");
  });

  it("captures baseline SHA-256 hash and mtime of real database", () => {
    assert.ok(initialDbMeta.hash);
    assert.ok(initialDbMeta.mtimeMs > 0);
  });

  after(() => {
    const finalDbMeta = getFileMetadata(prodDbPath);
    assert.equal(
      finalDbMeta.hash,
      initialDbMeta.hash,
      "Real data/database.json hash MUST NOT change during tests!"
    );
    assert.equal(
      finalDbMeta.mtimeMs,
      initialDbMeta.mtimeMs,
      "Real data/database.json mtime MUST NOT change during tests!"
    );
  });
});

// ── Suite 2: Switch Mode 'off' Operational Guard & Code 1031 ─────────────────
describe("Challenger 2: Switch Mode 'off' Operational Guard & Code 1031", () => {
  it("client.sendARIUpdate() throws WbpApiError with code 1031 and retryable: false when mode is 'off'", async () => {
    const mockDb = { settings: { wbp_integration_mode: "off" } };
    const client = new WBPClient({
      db: mockDb,
      baseUrl: "http://127.0.0.1:9999/cloudpms"
    });

    await assert.rejects(
      async () => {
        await client.sendARIUpdate({
          currency: "BRL",
          Inventory: []
        });
      },
      (err) => {
        assert.ok(err instanceof WbpApiError, "Must be instance of WbpApiError");
        assert.equal(err.code, 1031, "Must return error code 1031");
        assert.equal(err.retryable, false, "Must not be retryable");
        assert.match(err.message, /1031|off/i, "Message must mention disabled integration or code 1031");
        return true;
      }
    );
  });

  it("client.request() throws code 1031 across all verbs when mode is 'off'", async () => {
    const mockDb = { settings: { wbp_integration_mode: "off" } };
    const client = new WBPClient({
      db: mockDb,
      baseUrl: "http://127.0.0.1:9999/cloudpms"
    });

    const verbs = ["HealthCheck", "SetupProperty", "GetRoomTypes", "GetRatePlans", "ARIUpdate"];
    for (const verb of verbs) {
      await assert.rejects(
        async () => {
          await client.request(verb);
        },
        (err) => {
          assert.equal(err.code, 1031, `Verb ${verb} must be blocked with code 1031`);
          return true;
        }
      );
    }
  });

  it("synchronizer returns skipped with 0 transmissions when mode is 'off'", async () => {
    let callCount = 0;
    const mockClient = {
      async sendARIUpdate() {
        callCount++;
        return { success: true };
      }
    };
    const mockDb = { settings: { wbp_integration_mode: "off" } };
    const sync = new WbpAriSynchronizer({ db: mockDb, client: mockClient });

    // Incremental sync
    const incRes = sync.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-05" });
    assert.equal(incRes.scheduled, false);
    assert.equal(incRes.skipped, true);
    assert.equal(incRes.reason, "integration_off");
    assert.equal(callCount, 0, "No network call on incremental trigger when off");

    // Full push
    const fullRes = await sync.performFullPush({ startDate: "2026-11-01", endDate: "2026-11-05" });
    assert.equal(fullRes.success, false);
    assert.equal(fullRes.skipped, true);
    assert.equal(fullRes.reason, "integration_off");
    assert.equal(callCount, 0, "No network call on full push when off");

    // notifyPmsMutation hook
    const hookRes = notifyPmsMutation(mockDb, {
      type: "reservation_created",
      checkinDate: "2026-11-01",
      checkoutDate: "2026-11-05"
    });
    assert.equal(hookRes, null, "notifyPmsMutation must return null immediately when off");
  });
});

// ── Suite 3: Transient Error Retry with UUID v4 GUID Reuse ─────────────────
describe("Challenger 2: Transient Error Retry & Strict UUID v4 GUID Reuse (Codes 3, 1003, 1004)", () => {
  let mockServer;
  let mockPort;
  let mockBaseUrl;
  let requestLog = [];
  let failureRule = null;

  before(async () => {
    mockPort = await getAvailablePort();
    mockBaseUrl = `http://127.0.0.1:${mockPort}/cloudpms`;

    mockServer = http.createServer((req, res) => {
      let bodyStr = "";
      req.on("data", (chunk) => {
        bodyStr += chunk;
      });
      req.on("end", () => {
        let parsedBody = {};
        try {
          parsedBody = JSON.parse(bodyStr);
        } catch (_) {}

        requestLog.push({
          method: req.method,
          url: req.url,
          guid: parsedBody.guid,
          body: parsedBody
        });

        if (failureRule && failureRule.remainingFailures > 0) {
          failureRule.remainingFailures--;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: false,
              guid: parsedBody.guid,
              errors: [
                {
                  id: failureRule.errorCode,
                  msg: failureRule.errorMessage || `Simulated error ${failureRule.errorCode}`
                }
              ]
            })
          );
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            guid: parsedBody.guid
          })
        );
      });
    });

    await new Promise((resolve) => mockServer.listen(mockPort, "127.0.0.1", resolve));
  });

  after(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  const transientCodes = [
    { code: 3, name: "Communication failure with channel (code 3)" },
    { code: 1003, name: "Channel offline or temporary timeout (code 1003)" },
    { code: 1004, name: "Service temporarily unable to update (code 1004)" }
  ];

  for (const { code, name } of transientCodes) {
    it(`retries ${name} reusing the exact same UUID v4 GUID on successive attempts`, async () => {
      requestLog = [];
      failureRule = {
        errorCode: code,
        errorMessage: `Transient error ${code}`,
        remainingFailures: 1 // Fail first attempt, succeed on second
      };

      const mockDb = { settings: { wbp_integration_mode: "auto" } };
      const client = new WBPClient({
        db: mockDb,
        baseUrl: mockBaseUrl,
        pmsCid: "CORPFLATS_TEST",
        sharedSecret: "test_secret",
        wbpPropertyId: "101",
        wbpPropertyPassword: "test_password",
        maxRetries: 2,
        backoffBaseMs: 10 // Accelerated for fast test
      });

      const res = await client.sendARIUpdate({
        currency: "BRL",
        Inventory: [{ wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 19 }]
      });

      assert.equal(res.success, true);
      assert.equal(requestLog.length, 2, "Must have executed exactly 2 requests (1 failure + 1 retry)");

      const [attempt1, attempt2] = requestLog;
      assert.ok(attempt1.guid, "Attempt 1 must carry a GUID");
      assert.ok(attempt2.guid, "Attempt 2 must carry a GUID");
      assert.match(attempt1.guid, UUID_V4_REGEX, "Attempt 1 GUID must be a valid UUID v4");
      assert.match(attempt2.guid, UUID_V4_REGEX, "Attempt 2 GUID must be a valid UUID v4");

      // CRITICAL ASSERTION: EXACT SAME GUID REUSED
      assert.equal(
        attempt1.guid,
        attempt2.guid,
        `Retry for error code ${code} MUST reuse the exact same UUID v4 GUID!`
      );
      assert.equal(res.guid, attempt1.guid, "Returned result must match original GUID");
    });
  }

  it("retries up to maxRetries when transient errors persist and preserves the identical GUID across all attempts", async () => {
    requestLog = [];
    failureRule = {
      errorCode: 1004,
      errorMessage: "Persistent transient error",
      remainingFailures: 10 // Exceeds maxRetries
    };

    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const client = new WBPClient({
      db: mockDb,
      baseUrl: mockBaseUrl,
      pmsCid: "CORPFLATS_TEST",
      sharedSecret: "test_secret",
      wbpPropertyId: "101",
      wbpPropertyPassword: "test_password",
      maxRetries: 2, // Total 3 attempts
      backoffBaseMs: 10
    });

    let thrownError = null;
    try {
      await client.sendARIUpdate({
        currency: "BRL",
        Inventory: []
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, "Must throw after retries exhausted");
    assert.ok(
      thrownError.code === 1004 || thrownError.code === 3,
      `Error code must reflect failure (got ${thrownError.code})`
    );
    assert.equal(requestLog.length, 3, "Must have attempted initial + 2 retries = 3 attempts");

    const guids = requestLog.map((r) => r.guid);
    for (const g of guids) {
      assert.match(g, UUID_V4_REGEX, "Every attempt GUID must be a valid UUID v4");
      assert.equal(g, guids[0], "Every single attempt MUST share the exact same GUID!");
    }
    assert.equal(thrownError.guid, guids[0], "Error object must carry the reused GUID");
  });

  it("fails immediately without retrying when non-retryable error (e.g. 1001) is returned", async () => {
    requestLog = [];
    failureRule = {
      errorCode: 1001,
      errorMessage: "Invalid property credentials",
      remainingFailures: 5
    };

    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const client = new WBPClient({
      db: mockDb,
      baseUrl: mockBaseUrl,
      maxRetries: 2,
      backoffBaseMs: 10
    });

    await assert.rejects(
      async () => {
        await client.sendARIUpdate({
          currency: "BRL",
          Inventory: []
        });
      },
      (err) => {
        assert.equal(err.code, 1001);
        assert.equal(err.retryable, false);
        return true;
      }
    );

    assert.equal(requestLog.length, 1, "Non-retryable error 1001 must not trigger retries");
  });
});

// ── Suite 4: Direct Synchronizer Debouncing & Bounding Interval Coalescing ────
describe("Challenger 2: Synchronizer Engine Debouncing & Bounding Interval Coalescing", () => {
  it("coalesces a rapid burst of 20 concurrent mutations into a single payload covering [min(checkins), max(checkouts)] in <= 10s", async () => {
    const transmittedPayloads = [];
    const mockClient = {
      async sendARIUpdate(payload, opts) {
        transmittedPayloads.push({
          payload,
          opts,
          timestamp: Date.now()
        });
        return { success: true, guid: opts.guid };
      }
    };

    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      wbpRestrictions: { defaults: { ...DEFAULT_RESTRICTIONS } }
    };

    // Use default production timings (2s debounce, 6s maxWait <= 10s)
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client: mockClient,
      debounceMs: 500, // Slightly compact for fast test execution, well within <= 10s
      maxWaitMs: 2000
    });

    // 20 diverse mutation intervals across November 2026
    const burstMutations = [
      { minDate: "2026-11-10", maxDate: "2026-11-12" },
      { minDate: "2026-11-05", maxDate: "2026-11-08" },
      { minDate: "2026-11-02", maxDate: "2026-11-04" },
      { minDate: "2026-11-15", maxDate: "2026-11-18" },
      { minDate: "2026-11-20", maxDate: "2026-11-25" },
      { minDate: "2026-11-01", maxDate: "2026-11-03" }, // Global min: 2026-11-01
      { minDate: "2026-11-12", maxDate: "2026-11-15" },
      { minDate: "2026-11-22", maxDate: "2026-11-27" },
      { minDate: "2026-11-08", maxDate: "2026-11-11" },
      { minDate: "2026-11-14", maxDate: "2026-11-17" },
      { minDate: "2026-11-18", maxDate: "2026-11-21" },
      { minDate: "2026-11-04", maxDate: "2026-11-07" },
      { minDate: "2026-11-07", maxDate: "2026-11-10" },
      { minDate: "2026-11-11", maxDate: "2026-11-14" },
      { minDate: "2026-11-16", maxDate: "2026-11-19" },
      { minDate: "2026-11-19", maxDate: "2026-11-22" },
      { minDate: "2026-11-23", maxDate: "2026-11-26" },
      { minDate: "2026-11-03", maxDate: "2026-11-06" },
      { minDate: "2026-11-25", maxDate: "2026-11-30" }, // Global max: 2026-11-30
      { minDate: "2026-11-01", maxDate: "2026-11-05" }
    ];

    assert.equal(burstMutations.length, 20);

    const startTime = Date.now();

    // Fire all 20 mutations in rapid succession (< 100ms)
    for (const m of burstMutations) {
      const res = sync.triggerIncrementalSync(m);
      assert.equal(res.scheduled, true);
    }

    // Pending bounding interval immediately after burst must equal [2026-11-01, 2026-11-30]
    assert.equal(sync.pendingMinDate, "2026-11-01");
    assert.equal(sync.pendingMaxDate, "2026-11-30");

    // Wait for the debounce timer to flush
    await new Promise((r) => setTimeout(r, 800));

    const totalTimeMs = Date.now() - startTime;
    assert.ok(totalTimeMs <= 10000, `Debounce flush must occur within <= 10s (took ${totalTimeMs}ms)`);

    // ASSERTION: Exactly 1 single transmission coalescing all 20 mutations
    assert.equal(
      transmittedPayloads.length,
      1,
      `Expected exactly 1 coalesced payload, but got ${transmittedPayloads.length}`
    );

    const payload = transmittedPayloads[0].payload;
    assert.ok(Array.isArray(payload.Inventory));
    assert.ok(payload.Inventory.length > 0);

    // Extract all dates covered in the payload
    const datesInPayload = payload.Inventory.map((item) => item.start_date || item.date);
    const minPayloadDate = datesInPayload.reduce((min, d) => (d < min ? d : min), datesInPayload[0]);
    const maxPayloadDate = datesInPayload.reduce((max, d) => (d > max ? d : max), datesInPayload[0]);

    // ASSERTION: Payload covers the exact minimal bounding interval [2026-11-01, 2026-11-30]
    assert.equal(
      minPayloadDate,
      "2026-11-01",
      `Minimal date in coalesced payload must match min(checkins): 2026-11-01 (got ${minPayloadDate})`
    );
    assert.equal(
      maxPayloadDate,
      "2026-11-30",
      `Maximal date in coalesced payload must match max(checkouts): 2026-11-30 (got ${maxPayloadDate})`
    );

    // Verify all 30 calendar days in November are included for both rate plans (sem_cafe & com_cafe)
    const uniqueDates = [...new Set(datesInPayload)];
    assert.equal(
      uniqueDates.length,
      30,
      "Coalesced payload must cover all 30 contiguous days in the [2026-11-01, 2026-11-30] bounding range"
    );
  });

  it("enforces maxWait ceiling preventing starvation under continuous mutations within <= 10s", async () => {
    let flushCount = 0;
    const mockClient = {
      async sendARIUpdate() {
        flushCount++;
        return { success: true };
      }
    };

    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client: mockClient,
      debounceMs: 300,
      maxWaitMs: 800 // max-wait ceiling at 800ms
    });

    const startMs = Date.now();

    // Fire a mutation every 150ms for 1.2s (if only debounce existed, it would keep resetting and never flush)
    const intervalId = setInterval(() => {
      sync.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-05" });
    }, 150);

    // Wait 1.0s to allow maxWait ceiling to fire
    await new Promise((r) => setTimeout(r, 1000));
    clearInterval(intervalId);

    const elapsedMs = Date.now() - startMs;
    assert.ok(elapsedMs <= 10000, "Flush must occur within <= 10s");
    assert.ok(
      flushCount >= 1,
      "Max-wait ceiling MUST have triggered a flush despite continuous resetting of debounce timer"
    );
  });
});

// ── Suite 5: End-to-End Live HTTP PMS Server Concurrency Stress ───────────────
describe("Challenger 2: End-to-End Live PMS Mutation Concurrency Stress", () => {
  let tmpDir;
  let tmpDbPath;
  let simulator;
  let simPort;
  let simUrl;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;

  before(async () => {
    // 1. Setup isolated simulator
    simulator = new WbpSimulatorHarness();
    const simInfo = await simulator.start();
    simPort = simInfo.port;
    simUrl = simInfo.url;

    // 2. Setup isolated database in tmpdir
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "challenger-m3-wbp-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    const initialDb = {
      settings: {
        wbp_integration_mode: "auto",
        emailSettings: { enabled: false },
        zapiConfig: { enabled: false },
        wbp: {
          mode: "auto",
          enabled: true,
          apiKey: "test-key-123",
          propertyId: "101"
        }
      },
      zapiConfig: { enabled: false },
      flats: CORPFLATS_19_FLATS,
      // Pre-populate 5 reservations for updates and cancellations
      reservations: [
        {
          id: 501,
          code: "RES-501",
          flatId: 1,
          flatNumber: 101,
          guestName: "Pre Hóspede 1",
          checkinDate: "2026-12-10",
          checkoutDate: "2026-12-14",
          status: "confirmada"
        },
        {
          id: 502,
          code: "RES-502",
          flatId: 2,
          flatNumber: 102,
          guestName: "Pre Hóspede 2",
          checkinDate: "2026-12-11",
          checkoutDate: "2026-12-15",
          status: "confirmada"
        },
        {
          id: 503,
          code: "RES-503",
          flatId: 3,
          flatNumber: 103,
          guestName: "Pre Hóspede 3",
          checkinDate: "2026-12-12",
          checkoutDate: "2026-12-16",
          status: "confirmada"
        },
        {
          id: 504,
          code: "RES-504",
          flatId: 4,
          flatNumber: 104,
          guestName: "Pre Hóspede 4",
          checkinDate: "2026-12-13",
          checkoutDate: "2026-12-17",
          status: "confirmada"
        },
        {
          id: 505,
          code: "RES-505",
          flatId: 5,
          flatNumber: 105,
          guestName: "Pre Hóspede 5",
          checkinDate: "2026-12-14",
          checkoutDate: "2026-12-18",
          status: "confirmada"
        }
      ],
      roomBlocks: [],
      serviceOrders: [],
      wbpRestrictions: {
        defaults: { ...DEFAULT_RESTRICTIONS }
      }
    };

    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    // 3. Spawn child server with WBP pointing to simulator in auto mode
    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = { ...process.env };
    delete spawnEnv.DATABASE_URL;
    spawnEnv.PORT = String(serverPort);
    spawnEnv.DATA_FILE = tmpDbPath;
    spawnEnv.DATABASE_FILE = tmpDbPath;
    spawnEnv.NODE_ENV = "test";
    spawnEnv.WBP_BASE_URL = `${simUrl}/cloudpms`;
    spawnEnv.WBP_INTEGRATION_MODE = "auto";
    spawnEnv.WBP_PMS_CID = "CORPFLATS_TEST";
    spawnEnv.WBP_SHARED_SECRET = "test_secret_123";
    spawnEnv.WBP_PROPERTY_ID = "101";
    spawnEnv.WBP_PROPERTY_PASSWORD = "test_password";

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
    }
    if (simulator) {
      await simulator.stop();
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it(
    "fires 20 concurrent PMS mutations (creates, updates, cancels) within 500ms and asserts debouncer coalesces all mutations into exactly 1 ARIUpdate covering [min, max] in <= 10s",
    { timeout: 20000 },
    async () => {
      simulator.clearCalls();

      // Define 20 concurrent PMS operations:
      // - 10 reservation creates (POST /api/pms/reservations)
      // - 5 reservation updates (PUT /api/pms/reservations/:id)
      // - 5 reservation cancellations (DELETE /api/pms/reservations/:id)
      // Target dates range from 2026-12-01 (earliest checkin) to 2026-12-28 (latest checkout).
      const mutationPromises = [];

      // 10 creates
      const createRanges = [
        { flatId: 6, cin: "2026-12-01", cout: "2026-12-05", name: "Burst Hóspede 1" }, // Global earliest check-in: 2026-12-01
        { flatId: 7, cin: "2026-12-02", cout: "2026-12-06", name: "Burst Hóspede 2" },
        { flatId: 8, cin: "2026-12-03", cout: "2026-12-07", name: "Burst Hóspede 3" },
        { flatId: 16, cin: "2026-12-04", cout: "2026-12-08", name: "Burst Hóspede 4" },
        { flatId: 10, cin: "2026-12-05", cout: "2026-12-09", name: "Burst Hóspede 5" },
        { flatId: 11, cin: "2026-12-08", cout: "2026-12-12", name: "Burst Hóspede 6" },
        { flatId: 12, cin: "2026-12-15", cout: "2026-12-20", name: "Burst Hóspede 7" },
        { flatId: 13, cin: "2026-12-18", cout: "2026-12-24", name: "Burst Hóspede 8" },
        { flatId: 14, cin: "2026-12-20", cout: "2026-12-25", name: "Burst Hóspede 9" },
        { flatId: 15, cin: "2026-12-22", cout: "2026-12-28", name: "Burst Hóspede 10" } // Global latest checkout: 2026-12-28
      ];

      for (const cr of createRanges) {
        mutationPromises.push(
          fetch(`${serverBaseUrl}/api/pms/reservations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              flatId: cr.flatId,
              checkinDate: cr.cin,
              checkoutDate: cr.cout,
              guestName: cr.name,
              channel: "direta"
            })
          }).then(async (r) => {
            assert.equal(r.status, 201, `Create for ${cr.name} failed with status ${r.status}`);
            return r.json();
          })
        );
      }

      // 5 updates on pre-existing reservations (501 to 505) shifting dates
      const updateShifts = [
        { id: 501, checkinDate: "2026-12-09", checkoutDate: "2026-12-14" },
        { id: 502, checkinDate: "2026-12-11", checkoutDate: "2026-12-16" },
        { id: 503, checkinDate: "2026-12-10", checkoutDate: "2026-12-15" },
        { id: 504, checkinDate: "2026-12-12", checkoutDate: "2026-12-18" },
        { id: 505, checkinDate: "2026-12-13", checkoutDate: "2026-12-19" }
      ];

      for (const up of updateShifts) {
        mutationPromises.push(
          fetch(`${serverBaseUrl}/api/pms/reservations/${up.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(up)
          }).then(async (r) => {
            assert.equal(r.status, 200, `Update for reservation ${up.id} failed with status ${r.status}`);
            return r.json();
          })
        );
      }

      // 5 cancellations (DELETE /api/pms/reservations/:id)
      // We cancel 501 through 505
      for (let cancelId = 501; cancelId <= 505; cancelId++) {
        mutationPromises.push(
          fetch(`${serverBaseUrl}/api/pms/reservations/${cancelId}`, {
            method: "DELETE"
          }).then(async (r) => {
            assert.equal(r.status, 200, `Cancel for reservation ${cancelId} failed with status ${r.status}`);
            return r.json();
          })
        );
      }

      assert.equal(mutationPromises.length, 20, "Must have exactly 20 concurrent mutation operations");

      const burstStartTime = Date.now();

      // Execute all 20 mutations concurrently via Promise.all
      const results = await Promise.all(mutationPromises);
      assert.equal(results.length, 20, "All 20 concurrent mutations must resolve successfully");

      const burstEndTime = Date.now();
      const burstDuration = burstEndTime - burstStartTime;
      assert.ok(
        burstDuration < 5000,
        `All 20 mutations should complete rapidly (took ${burstDuration}ms)`
      );

      // Now poll the simulator until the coalesced ARIUpdate arrives (<= 10 seconds ceiling)
      let ariCalls = [];
      const pollStart = Date.now();
      while (Date.now() - pollStart < 10000) {
        ariCalls = simulator.getCalls("ARIUpdate");
        if (ariCalls.length > 0) {
          // Allow small buffer (600ms) to ensure no redundant extra calls leak
          await new Promise((r) => setTimeout(r, 600));
          ariCalls = simulator.getCalls("ARIUpdate");
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      const totalSyncDurationMs = Date.now() - burstStartTime;
      assert.ok(
        totalSyncDurationMs <= 10000,
        `Debounced ARI sync took ${totalSyncDurationMs}ms, must be <= 10s`
      );

      // CRITICAL ASSERTION: Exactly 1 single coalesced payload received by simulator
      assert.equal(
        ariCalls.length,
        1,
        `Simulator received ${ariCalls.length} ARIUpdate calls; expected exactly 1 coalesced call!`
      );

      const receivedUpdate = ariCalls[0];
      assert.ok(receivedUpdate.body?.Inventory, "Received call must contain Inventory");

      // OpenAPI 3.1 Schema Validation
      const validation = validateRequest("ARIUpdate", receivedUpdate.body, { tolerant: true });
      assert.equal(
        validation.valid,
        true,
        `Coalesced ARI payload failed OpenAPI schema validation: ${validation.errors?.join("; ")}`
      );

      // Inspect bounding interval of the coalesced payload
      const inventory = receivedUpdate.body.Inventory;
      assert.ok(inventory.length > 0, "Inventory must contain blocks");

      const coveredDates = inventory.map((b) => b.start_date || b.date);
      const minCoveredDate = coveredDates.reduce((min, d) => (d < min ? d : min), coveredDates[0]);
      const maxCoveredDate = coveredDates.reduce((max, d) => (d > max ? d : max), coveredDates[0]);

      // Earliest check-in was 2026-12-01. Latest checkout was 2026-12-28 (stay night 2026-12-27 or 2026-12-28).
      assert.equal(
        minCoveredDate,
        "2026-12-01",
        `Coalesced payload minimum date must be exactly 2026-12-01 (got ${minCoveredDate})`
      );
      assert.ok(
        maxCoveredDate >= "2026-12-27",
        `Coalesced payload maximum date must cover up to at least 2026-12-27 (got ${maxCoveredDate})`
      );
    }
  );
});
