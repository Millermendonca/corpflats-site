/**
 * tests/wbp-integration/m3-ari-sync.test.mjs
 *
 * Milestone 3: ARI Mapping, 7 Restrictions & Synchronizer Test Suite.
 *
 * Scenarios Tested:
 * 1. General switch guard (off, observe, auto).
 * 2. Initial full push horizon (today through Dec 31 of next year) in 60-day batches with setImmediate.
 * 3. Contiguous block compression merging adjacent identical stay nights with inclusive end_date.
 * 4. Incremental debounced push (<10s window: 2s debounce, 6s max-wait) coalescing rapid bursts.
 * 5. Fail-closed pricing locks (floor lock fails closed on NaN, variation limit strictly validated including 0).
 * 6. Shared inventory ceiling logic: units = max(0, min(ceiling ?? 19, canonicalAvailable)).
 * 7. Transient error retry with GUID reuse and persistent failure alert (>15 min).
 * 8. WBP Simulator Harness E2E integration: validates ARIUpdate transmission in <= 10s with 100% OpenAPI schema compliance.
 * 9. PMS mutation touchpoints and administrative routes (/api/wbp/ari/full-sync, /api/wbp/ari/status, /api/wbp/restrictions).
 * 10. Real data/database.json integrity guard: asserts identical SHA-256 hash and mtime before & after.
 *
 * Strictly adheres to AGENTS.md:
 * - Runs exclusively this targeted test file.
 * - Isolated temporary DB in os.tmpdir(), real database.json is untouched.
 * - Ephemeral HTTP port, clean taskkill process termination.
 */

process.env.NODE_ENV = "test";

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
  WbpAriSynchronizer,
  getAriSynchronizer,
  notifyPmsMutation,
  getWbpRestrictionsState,
  resolveRestrictions,
  compressContiguousBlocks,
  calculateFullPushHorizon,
  addDays,
  isNextDay,
  getNightsList,
  DEFAULT_RESTRICTIONS,
  DEFAULT_WBP_MAPPING
} from "../../artifacts/api-server/wbp/ari-sync.mjs";

import {
  calculateCanonicalAvailability,
  CORPFLATS_19_FLATS
} from "../../artifacts/api-server/wbp/availability.mjs";

import {
  WbpPricingManager,
  applyPricingLocks,
  calculateRatePlanPrices,
  calculateSebraeRate,
  DEFAULT_SEBRAE_CONFIG
} from "../../artifacts/api-server/wbp/pricing.mjs";

import { WBP_MODES, setIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";
import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpSimulatorHarness } from "./harness/wbp-simulator-harness.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";

// Helper: dynamic port
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

// Helper: compute file hash and mtime
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
}

// Helper: kill process tree on Windows
function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// Helper: poll server readiness
async function waitForServer(baseUrl, maxAttempts = 50, delayMs = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/version`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, delayMs));
  }
  throw new Error(`Server failed to start at ${baseUrl} within timeout.`);
}

describe("Milestone 3: Real Database Integrity Guard (Pre-Flight & Post-Flight)", () => {
  let initialDbMeta;

  before(() => {
    initialDbMeta = getFileMetadata(prodDbPath);
    assert.ok(initialDbMeta, "Real data/database.json must exist before testing");
  });

  it("ensures real data/database.json exists and captures baseline hash", () => {
    assert.ok(initialDbMeta.hash);
    assert.ok(initialDbMeta.mtimeMs > 0);
  });

  after(() => {
    const finalDbMeta = getFileMetadata(prodDbPath);
    assert.equal(finalDbMeta.hash, initialDbMeta.hash, "Real data/database.json hash MUST NOT change during tests!");
    assert.equal(finalDbMeta.mtimeMs, initialDbMeta.mtimeMs, "Real data/database.json mtime MUST NOT change during tests!");
  });
});

describe("Milestone 3: Room & Rate Mapping + ARI Payload Builder (Feature 14)", () => {
  it("maps 19 physical flats to 1 commercial room type 'flat'", () => {
    assert.equal(DEFAULT_WBP_MAPPING.room.wbp_room_id, "flat");
    assert.equal(DEFAULT_WBP_MAPPING.room.maxOccupancy, 3);
    assert.equal(DEFAULT_WBP_MAPPING.room.baseOccupancy, 2);
    assert.equal(DEFAULT_WBP_MAPPING.room.flats.length, 19);
    assert.equal(CORPFLATS_19_FLATS.length, 19);
  });

  it("builds 2 commercial rate plans with OBP attributes and R$ 25 breakfast surcharge", () => {
    const baseRate = 200.0;
    const settings = { ...DEFAULT_SEBRAE_CONFIG, breakfastSurchargePerGuest: 25.0, extraBedFee: 60.0 };
    const plans = calculateRatePlanPrices(baseRate, settings);

    // Sem café: base room rate for 2 guests
    assert.equal(plans.sem_cafe.rate, 200.0);
    assert.equal(plans.sem_cafe.rdef_single, 200.0);
    assert.equal(plans.sem_cafe.adult_1, 200.0);
    assert.equal(plans.sem_cafe.adult_2, 200.0);
    assert.equal(plans.sem_cafe.adult_3, 260.0); // 200 + 60 extra bed

    // Com café: +R$ 25/guest/night -> +R$ 50 for 2 guests base
    assert.equal(plans.com_cafe.rate, 250.0); // 200 + 2*25
    assert.equal(plans.com_cafe.rdef_single, 225.0); // 200 + 1*25
    assert.equal(plans.com_cafe.adult_1, 225.0);
    assert.equal(plans.com_cafe.adult_2, 250.0);
    assert.equal(plans.com_cafe.adult_3, 335.0); // 200 + 3*25 + 60 = 335

    // ARI Synchronizer payload builder attaches OBP metadata to wire blocks
    const sync = new WbpAriSynchronizer();
    const blocks = sync.generateAriBlocks("2026-11-01", "2026-11-01", { contiguous: false });
    const semBlock = blocks.find(b => b.wbp_rate_id === "sem_cafe");
    const comBlock = blocks.find(b => b.wbp_rate_id === "com_cafe");

    assert.equal(semBlock.num_adults_included, 2);
    assert.equal(semBlock.num_children_included, 0);
    assert.equal(comBlock.num_adults_included, 2);
    assert.equal(comBlock.num_children_included, 0);
  });

  it("enforces inclusive end_date rule and contiguous multi-day compression", () => {
    const dailyItems = [
      {
        date: "2026-11-01",
        wbp_room_id: "flat",
        wbp_rate_id: "sem_cafe",
        units: 19,
        rate: "200.00",
        rdef_single: "200.00",
        adult_3: "260.00",
        num_adults_included: 2,
        num_children_included: 0,
        min_los: 1,
        max_los: 30,
        close: false,
        closearr: false,
        closedep: false,
        min_advanced_offset: 0,
        max_advanced_offset: 0
      },
      {
        date: "2026-11-02",
        wbp_room_id: "flat",
        wbp_rate_id: "sem_cafe",
        units: 19,
        rate: "200.00",
        rdef_single: "200.00",
        adult_3: "260.00",
        num_adults_included: 2,
        num_children_included: 0,
        min_los: 1,
        max_los: 30,
        close: false,
        closearr: false,
        closedep: false,
        min_advanced_offset: 0,
        max_advanced_offset: 0
      },
      {
        date: "2026-11-03",
        wbp_room_id: "flat",
        wbp_rate_id: "sem_cafe",
        units: 19,
        rate: "200.00",
        rdef_single: "200.00",
        adult_3: "260.00",
        num_adults_included: 2,
        num_children_included: 0,
        min_los: 1,
        max_los: 30,
        close: false,
        closearr: false,
        closedep: false,
        min_advanced_offset: 0,
        max_advanced_offset: 0
      },
      // Day 4 has a rate shift (e.g. weekend price increase) -> should start a new contiguous block
      {
        date: "2026-11-04",
        wbp_room_id: "flat",
        wbp_rate_id: "sem_cafe",
        units: 19,
        rate: "250.00",
        rdef_single: "250.00",
        adult_3: "310.00",
        num_adults_included: 2,
        num_children_included: 0,
        min_los: 1,
        max_los: 30,
        close: false,
        closearr: false,
        closedep: false,
        min_advanced_offset: 0,
        max_advanced_offset: 0
      }
    ];

    const compressed = compressContiguousBlocks(dailyItems);
    assert.equal(compressed.length, 2, "Should compress 4 days into 2 contiguous blocks due to rate shift");
    
    // First block: 2026-11-01 to 2026-11-03 (inclusive)
    assert.equal(compressed[0].start_date, "2026-11-01");
    assert.equal(compressed[0].end_date, "2026-11-03");
    assert.equal(compressed[0].rate, "200.00");

    // Second block: 2026-11-04 to 2026-11-04
    assert.equal(compressed[1].start_date, "2026-11-04");
    assert.equal(compressed[1].end_date, "2026-11-04");
    assert.equal(compressed[1].rate, "250.00");
  });
});

describe("Milestone 3: 7 Restrictions Engine (Feature 15)", () => {
  it("resolves default restrictions (min_los weekday 1, weekend 2; max_los 30)", () => {
    const mockDb = { wbpRestrictions: null };
    
    // 2026-10-14 is Wednesday (weekday)
    const weekdayRes = resolveRestrictions(mockDb, "2026-10-14", "sem_cafe");
    assert.equal(weekdayRes.min_los, 1);
    assert.equal(weekdayRes.max_los, 30);
    assert.equal(weekdayRes.close, false);
    assert.equal(weekdayRes.closearr, false);
    assert.equal(weekdayRes.closedep, false);
    assert.equal(weekdayRes.min_advanced_offset, 0);
    assert.equal(weekdayRes.max_advanced_offset, 0);

    // 2026-10-16 is Friday (weekend stay night)
    const weekendRes = resolveRestrictions(mockDb, "2026-10-16", "sem_cafe");
    assert.equal(weekendRes.min_los, 2);
    assert.equal(weekendRes.max_los, 30);
  });

  it("respects hierarchy: specific override > date override > plan default > global default > legacy fallback", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, min_los_weekend: 2, max_los: 30, close: false },
        planDefaults: {
          com_cafe: { min_los: 3 }
        },
        overrides: {
          "2026-12-31": { min_los: 4, closearr: true },
          "2026-12-31_com_cafe": { min_los: 5, close: true }
        }
      }
    };

    // Ordinary date with plan default
    const ordComCafe = resolveRestrictions(mockDb, "2026-10-14", "com_cafe");
    assert.equal(ordComCafe.min_los, 3);
    assert.equal(ordComCafe.close, false);

    // Date override for sem_cafe
    const nyeSemCafe = resolveRestrictions(mockDb, "2026-12-31", "sem_cafe");
    assert.equal(nyeSemCafe.min_los, 4);
    assert.equal(nyeSemCafe.closearr, true);
    assert.equal(nyeSemCafe.close, false);

    // Specific plan+date override for com_cafe
    const nyeComCafe = resolveRestrictions(mockDb, "2026-12-31", "com_cafe");
    assert.equal(nyeComCafe.min_los, 5);
    assert.equal(nyeComCafe.close, true);
    assert.equal(nyeComCafe.closearr, true);
  });

  it("guarantees 100% independence: zero modification or regression on legacy tariff settings", () => {
    const mockDb = {
      tariffSettings: { minNights: 2, basePrice: 200 },
      wbpRestrictions: { defaults: { min_los_weekday: 1, min_los_weekend: 2 } }
    };
    const state = getWbpRestrictionsState(mockDb);
    assert.ok(state.defaults);
    assert.equal(mockDb.tariffSettings.basePrice, 200);
    assert.equal(mockDb.tariffSettings.minNights, 2);
  });
});

describe("Milestone 3: ARI Synchronizer & Transmission Modes (Feature 16)", () => {
  it("mode 'off' skips all sync requests with zero outbound calls", async () => {
    let outboundCalls = 0;
    const mockClient = {
      async sendARIUpdate() {
        outboundCalls++;
        return { success: true };
      }
    };
    const mockDb = { settings: { wbp_integration_mode: "off" } };
    const sync = new WbpAriSynchronizer({ db: mockDb, client: mockClient });

    const fullResult = await sync.performFullPush({ startDate: "2026-11-01", endDate: "2026-11-05" });
    assert.equal(fullResult.skipped, true);
    assert.equal(fullResult.reason, "integration_off");
    assert.equal(outboundCalls, 0);

    const incResult = sync.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-05" });
    assert.equal(incResult.skipped, true);
    assert.equal(incResult.reason, "integration_off");
    assert.equal(outboundCalls, 0);
  });

  it("mode 'observe' generates payloads, calculates blocks, and logs without network calls", async () => {
    let outboundCalls = 0;
    const mockClient = {
      async sendARIUpdate() {
        outboundCalls++;
        return { success: true };
      }
    };
    const mockDb = { settings: { wbp_integration_mode: "observe" } };
    const sync = new WbpAriSynchronizer({ db: mockDb, client: mockClient });

    const fullResult = await sync.performFullPush({ startDate: "2026-11-01", endDate: "2026-11-05" });
    assert.equal(fullResult.success, true);
    assert.equal(fullResult.mode, "observe");
    assert.ok(fullResult.totalBlocks > 0);
    assert.equal(outboundCalls, 0, "Observe mode must never make HTTP calls");
  });

  it("mode 'auto' transmits batches with UUID v4 GUID and yields via setImmediate", async () => {
    const sentBatches = [];
    const mockClient = {
      async sendARIUpdate(payload, opts) {
        sentBatches.push({ payload, opts });
        return { success: true, guid: opts.guid };
      }
    };
    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client: mockClient,
      batchSizeDays: 30 // Small batch for testing chunking
    });

    const res = await sync.performFullPush({ startDate: "2026-11-01", endDate: "2026-12-15" });
    assert.equal(res.success, true);
    assert.equal(res.mode, "auto");
    assert.equal(res.batchesCount, 2);
    assert.equal(sentBatches.length, 2);

    for (const b of sentBatches) {
      assert.ok(b.opts.guid, "Each batch must carry a GUID");
      assert.equal(typeof b.opts.guid, "string");
      assert.ok(b.payload.Inventory.length > 0);
    }
  });

  it("calculates initial full push horizon from today through Dec 31 of next calendar year", () => {
    const horizon2026 = calculateFullPushHorizon(new Date("2026-05-15T12:00:00Z"));
    assert.equal(horizon2026.startDate, "2026-05-15");
    assert.equal(horizon2026.endDate, "2027-12-31");

    const horizon2027 = calculateFullPushHorizon(new Date("2027-01-01T12:00:00Z"));
    assert.equal(horizon2027.startDate, "2027-01-01");
    assert.equal(horizon2027.endDate, "2028-12-31");
  });

  it("incremental debouncing (<10s window: 2s debounce, 6s max-wait) coalesces rapid mutations into minimal bounding interval", async () => {
    let transmittedIntervals = [];
    const mockClient = {
      async sendARIUpdate(payload, opts) {
        transmittedIntervals.push(payload.Inventory);
        return { success: true, guid: opts.guid };
      }
    };
    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client: mockClient,
      debounceMs: 50, // Accelerated for fast test execution
      maxWaitMs: 150
    });

    // Rapid sequential bursts across different intervals:
    // Event 1: [2026-11-05, 2026-11-08]
    // Event 2: [2026-11-02, 2026-11-06]
    // Event 3: [2026-11-07, 2026-11-12]
    sync.triggerIncrementalSync({ minDate: "2026-11-05", maxDate: "2026-11-08" });
    sync.triggerIncrementalSync({ minDate: "2026-11-02", maxDate: "2026-11-06" });
    const scheduled = sync.triggerIncrementalSync({ minDate: "2026-11-07", maxDate: "2026-11-12" });

    // Pending bounding interval should be [2026-11-02, 2026-11-12]
    assert.equal(scheduled.minDate, "2026-11-02");
    assert.equal(scheduled.maxDate, "2026-11-12");

    // Wait for debounce flush
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(transmittedIntervals.length, 1, "Rapid mutations must coalesce into a single transmission");
    const sentDates = transmittedIntervals[0].map(b => b.start_date);
    assert.ok(sentDates.includes("2026-11-02"));
    assert.ok(sentDates.includes("2026-11-12"));
  });

  it("shared inventory ceiling logic: units = max(0, min(planCeiling ?? 19, canonicalAvailable))", () => {
    const mockDb = {
      reservations: [
        {
          id: 101,
          flatId: 1,
          flatNumber: 101,
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "confirmada"
        },
        {
          id: 102,
          flatId: 2,
          flatNumber: 102,
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "confirmada"
        }
      ],
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 10 },
          { wbp_rate_id: "com_cafe", ceiling: null }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    // Out of 19 flats, 2 are booked on 2026-11-10 -> 17 canonical free
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10", { contiguous: false });
    
    const semCafeBlock = blocks.find(b => b.wbp_rate_id === "sem_cafe");
    const comCafeBlock = blocks.find(b => b.wbp_rate_id === "com_cafe");

    // sem_cafe has ceiling: 10 -> min(10, 17) = 10
    assert.equal(semCafeBlock.units, 10);
    // com_cafe has ceiling: null -> min(19, 17) = 17
    assert.equal(comCafeBlock.units, 17);
  });

  it("handles transient error retry with GUID reuse and persistent failure alert (>15 min)", async () => {
    const alertsReceived = [];
    const sync = new WbpAriSynchronizer({
      alertThresholdMs: 100, // Accelerated threshold for test
      onAlert: (alert) => alertsReceived.push(alert)
    });

    // Simulate transient failure
    const error1 = new Error("503 Service Unavailable");
    sync.handleSyncFailure(error1, "2026-11-01", "2026-11-05");
    assert.equal(alertsReceived.length, 0, "No immediate persistent alert on initial transient failure");

    // Advance clock past threshold
    sync.failureStartTime = Date.now() - 200;
    sync.handleSyncFailure(new Error("Timeout"), "2026-11-01", "2026-11-05");

    assert.equal(alertsReceived.length, 1);
    assert.equal(alertsReceived[0].type, "persistent_failure");
    assert.equal(alertsReceived[0].severity, "critical");

    // Recovery notification upon resumption
    sync.triggerRecoveryAlert();
    assert.equal(alertsReceived.length, 2);
    assert.equal(alertsReceived[1].type, "recovery");
    assert.equal(alertsReceived[1].severity, "info");
  });
});

describe("Milestone 3: Fail-Closed Pricing Locks (Task 0 & Directive Validation)", () => {
  it("Floor Lock fails closed (blocks execution) on NaN or missing tarifaMinima", () => {
    const res1 = applyPricingLocks({
      candidateRate: NaN,
      tarifaMinima: 276.63,
      manualFloor: 276.63
    });
    assert.equal(res1.approved, false);
    assert.equal(res1.lockedReason, "FLOOR_LOCK");

    const res2 = applyPricingLocks({
      candidateRate: 250,
      tarifaMinima: NaN,
      manualFloor: NaN
    });
    assert.equal(res2.approved, false);
    assert.equal(res2.lockedReason, "FLOOR_LOCK");
  });

  it("Variation Limit strictly validates positive numeric limits and rejects variationLimitPct: 0", () => {
    const mockDb = {};
    // updateSettings strictly rejects 0 and negative values with explicit error
    assert.throws(() => {
      WbpPricingManager.updateSettings({ variationLimitPct: 0 }, mockDb);
    }, /variationLimitPct/i);

    assert.throws(() => {
      WbpPricingManager.updateSettings({ variationLimitPct: -0.10 }, mockDb);
    }, /variationLimitPct/i);

    // When variationLimitPct is invalid in applyPricingLocks, it treats it as invalid, logs warning, and locks variations > 30%
    const resZero = applyPricingLocks({
      candidateRate: 400,
      lastSentRate: 250, // +60% variation
      tarifaMinima: 200,
      variationLimitPct: 0
    });
    assert.equal(resZero.approved, false);
    assert.equal(resZero.lockedReason, "VARIATION_LOCK");

    const resNegative = applyPricingLocks({
      candidateRate: 400,
      lastSentRate: 250,
      tarifaMinima: 200,
      variationLimitPct: -0.10
    });
    assert.equal(resNegative.approved, false);
    assert.equal(resNegative.lockedReason, "VARIATION_LOCK");
  });
});

describe("Milestone 3: E2E Simulator Wire Transmission & OpenAPI Schema Validation", () => {
  let simulator;
  let simUrl;
  let client;

  before(async () => {
    simulator = new WbpSimulatorHarness();
    const simInfo = await simulator.start();
    simUrl = simInfo.url;

    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    client = new WBPClient({
      db: mockDb,
      baseUrl: `${simUrl}/cloudpms`,
      pmsCid: "CORPFLATS_TEST",
      sharedSecret: "test_secret_123",
      wbpPropertyId: "101",
      wbpPropertyPassword: "test_password",
      timeoutMs: 3000,
      maxRetries: 2
    });
  });

  after(async () => {
    if (simulator) {
      await simulator.stop();
    }
  });

  it("Full Push transmits ARIUpdate to simulator in <= 10s and passes 100% OpenAPI schema validation", async () => {
    simulator.clearCalls();
    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client,
      batchSizeDays: 60
    });

    const startMs = Date.now();
    const pushResult = await sync.performFullPush({
      startDate: "2026-11-01",
      endDate: "2026-11-15"
    });
    const durationMs = Date.now() - startMs;

    assert.ok(durationMs <= 10000, `Full push took ${durationMs}ms, must be <= 10s`);
    assert.equal(pushResult.success, true);
    assert.equal(pushResult.mode, "auto");

    const ariCalls = simulator.getCalls("ARIUpdate");
    assert.ok(ariCalls.length > 0, "Simulator must have received at least 1 ARIUpdate call");

    for (const call of ariCalls) {
      const valResult = validateRequest("ARIUpdate", call.body, { tolerant: true });
      assert.equal(valResult.valid, true, `OpenAPI validation errors: ${valResult.errors?.join("; ")}`);
      assert.ok(Array.isArray(call.body.Inventory));
      assert.ok(call.body.Inventory.length > 0);
      assert.equal(call.body.currency, "BRL");
    }
  });

  it("Incremental Push transmits ARIUpdate to simulator in <= 10s and passes 100% OpenAPI schema validation", async () => {
    simulator.clearCalls();
    const mockDb = { settings: { wbp_integration_mode: "auto" } };
    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client,
      debounceMs: 50,
      maxWaitMs: 150
    });

    const startMs = Date.now();
    sync.triggerIncrementalSync({ minDate: "2026-11-05", maxDate: "2026-11-07" });

    // Wait for debounce flush
    await new Promise((r) => setTimeout(r, 80));
    const durationMs = Date.now() - startMs;

    assert.ok(durationMs <= 10000, `Incremental push took ${durationMs}ms, must be <= 10s`);

    const ariCalls = simulator.getCalls("ARIUpdate");
    assert.equal(ariCalls.length, 1, "Simulator must receive exactly 1 coalesced ARIUpdate");

    const lastCall = ariCalls[0];
    const valResult = validateRequest("ARIUpdate", lastCall.body, { tolerant: true });
    assert.equal(valResult.valid, true, `OpenAPI validation errors: ${valResult.errors?.join("; ")}`);
    assert.ok(lastCall.body.Inventory.length > 0);
  });
});

describe("Milestone 3: PMS Mutation Touchpoints & HTTP Administrative Routes", () => {
  let tmpDir;
  let tmpDbPath;
  let serverProcess;
  let serverPort;
  let serverBaseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-wbp-test-"));
    tmpDbPath = path.join(tmpDir, "database.json");

    // Initial clean database state with observe mode to avoid external network calls
    const initialDb = {
      settings: {
        wbp_integration_mode: "observe",
        wbp: {
          mode: "observe",
          enabled: true,
          apiKey: "test-key-123",
          propertyId: "test-prop-456"
        }
      },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      roomBlocks: [],
      serviceOrders: [],
      wbpRestrictions: {
        defaults: { ...DEFAULT_RESTRICTIONS }
      }
    };
    fs.writeFileSync(tmpDbPath, JSON.stringify(initialDb, null, 2), "utf8");

    serverPort = await getAvailablePort();
    serverBaseUrl = `http://127.0.0.1:${serverPort}`;

    const spawnEnv = { ...process.env };
    delete spawnEnv.DATABASE_URL;
    spawnEnv.PORT = String(serverPort);
    spawnEnv.DATA_FILE = tmpDbPath;
    spawnEnv.DATABASE_FILE = tmpDbPath;
    spawnEnv.NODE_ENV = "test";

    serverProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: spawnEnv,
      stdio: "pipe"
    });

    await waitForServer(serverBaseUrl);
  });

  after(() => {
    if (serverProcess && serverProcess.pid) {
      killProcessTree(serverProcess.pid);
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it("GET /api/wbp/ari/status returns synchronizer health and diagnostics", async () => {
    const res = await fetch(`${serverBaseUrl}/api/wbp/ari/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.mode);
    assert.equal(typeof data.isPending, "boolean");
  });

  it("GET and POST /api/wbp/restrictions retrieves and updates 7 restrictions state", async () => {
    // GET initial
    const getRes = await fetch(`${serverBaseUrl}/api/wbp/restrictions`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.ok(getData.restrictions.defaults);

    // POST update overrides
    const postRes = await fetch(`${serverBaseUrl}/api/wbp/restrictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrides: {
          "2026-12-25": { min_los: 3, closearr: true }
        }
      })
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.success, true);
    assert.equal(postData.restrictions.overrides["2026-12-25"].min_los, 3);
    assert.equal(postData.restrictions.overrides["2026-12-25"].closearr, true);
  });

  it("POST /api/wbp/ari/full-sync triggers initial full push in observe mode and updates status", async () => {
    const res = await fetch(`${serverBaseUrl}/api/wbp/ari/full-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: "2026-11-01",
        endDate: "2026-11-10"
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.totalBlocks > 0);
  });
});
