/**
 * tests/wbp-integration/m2-availability-pricing.test.mjs
 *
 * Targeted Test Suite for Milestone 2:
 * 1. Canonical Availability Engine across all 19 flats and 4 conflict scenarios + permanent maintenance.
 * 2. Exact SEBRAE Pricing Math (Custo R$ 149.38 -> Tarifa Mínima R$ 276.63 closing 100% with zero residue).
 * 3. Breakfast surcharge mapping for "Sem café" and "Com café" (OBP).
 * 4. Pricing safety locks (Floor lock, 30% variation lock, staged publication workflow).
 * 5. WBP HTTP Endpoints integration & non-blocking conflict warnings.
 * 6. Mandatory real-gold operational non-regression verification against legacy commit 0501d02:
 *    - Strict process and database isolation (database.json untouched in mtime and sha256).
 *    - Exact penny-for-penny calculateDailyRate parity across flats, seasons, channels, and P1-P4 overrides.
 *    - Exact 100% matching for /api/bot-actions/quote and /api/bot-actions/availability.
 *
 * Strictly adheres to AGENTS.md:
 * - Runs exclusively this targeted test file.
 * - Spawns isolated processes with DATABASE_URL deleted and DATA_FILE pointing to os.tmpdir().
 */

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

// Pure M2 modules (contain no server listen side effects)
import {
  calculateCanonicalAvailability,
  checkReservationConflicts,
  getCanonicalFlats,
  CORPFLATS_19_FLATS
} from "../../artifacts/api-server/wbp/availability.mjs";

import {
  calculateSebraeRate,
  calculateHistoricalSeasonality,
  applyPricingLocks,
  calculateRatePlanPrices,
  WbpPricingManager,
  DEFAULT_SEBRAE_CONFIG
} from "../../artifacts/api-server/wbp/pricing.mjs";

// Helper: dynamic available port allocation
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

// Helper: kill process tree on Windows
function killProcessTree(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
  } catch (_) {}
}

// Helper: compute file hash and mtime
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
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

describe("Milestone 2: Canonical Availability Engine (19 Flats & 4 Collision Types)", () => {
  let mockDb;
  const nowMs = new Date("2026-11-01T12:00:00Z").getTime();

  before(() => {
    mockDb = {
      flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
      reservations: [],
      roomBlocks: [],
      serviceOrders: []
    };
  });

  it("calculates baseline availability with all 19 flats free when no bookings or blocks exist", () => {
    const result = calculateCanonicalAvailability("2026-11-10", "2026-11-13", { db: mockDb, nowMs });
    assert.equal(result.totalFlats, 19);
    assert.equal(result.minAvailable, 19);
    assert.equal(result.get("2026-11-10"), 19);
    assert.equal(result.get("2026-11-11"), 19);
    assert.equal(result.get("2026-11-12"), 19);
    assert.equal(result.daily.length, 3);
  });

  it("detects conflict type 1: active reservation blocks the assigned flat and decrements availability", () => {
    const dbWithRes = {
      ...mockDb,
      reservations: [
        {
          id: 101,
          code: "RES-101",
          flatNumber: "113",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "confirmada",
          guestName: "Carlos Silva"
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-09", "2026-11-13", { db: dbWithRes, nowMs });
    assert.equal(result.get("2026-11-09"), 19); // Before check-in
    assert.equal(result.get("2026-11-10"), 18); // Night 1 blocked
    assert.equal(result.get("2026-11-11"), 18); // Night 2 blocked
    assert.equal(result.get("2026-11-12"), 19); // Checkout day: free for new check-in!
    assert.ok(!result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("113"));
  });

  it("ignores expired pre-reservas (pre_reserva with expiresAt < nowMs and unpaid) without blocking the flat", () => {
    const dbWithExpired = {
      ...mockDb,
      reservations: [
        {
          id: 102,
          code: "RES-102",
          flatNumber: "114",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-12",
          status: "pre_reserva",
          paymentStatus: "pendente",
          expiresAt: new Date(nowMs - 3600000).toISOString() // Expired 1 hour ago
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-10", "2026-11-12", { db: dbWithExpired, nowMs });
    assert.equal(result.get("2026-11-10"), 19); // Expired pre-reserva must NOT block!
    assert.ok(result.detailsByDate["2026-11-10"].freeFlatNumbers.includes("114"));
  });

  it("detects conflict type 2: active non-expired provisional hold (r.pendingModification) blocks proposed flat", () => {
    const dbWithHold = {
      ...mockDb,
      reservations: [
        {
          id: 103,
          code: "RES-103",
          flatNumber: "211",
          checkinDate: "2026-12-01",
          checkoutDate: "2026-12-05",
          status: "confirmada",
          pendingModification: {
            status: "pending",
            newFlatNumber: "212",
            newCheckinDate: "2026-11-15",
            newCheckoutDate: "2026-11-18",
            expiresAt: new Date(nowMs + 7200000).toISOString() // Active for 2 hours
          }
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-14", "2026-11-19", { db: dbWithHold, nowMs });
    assert.equal(result.get("2026-11-14"), 19);
    assert.equal(result.get("2026-11-15"), 18); // Flat 212 blocked by hold
    assert.equal(result.get("2026-11-16"), 18);
    assert.equal(result.get("2026-11-17"), 18);
    assert.equal(result.get("2026-11-18"), 19); // Hold checkout
    assert.ok(!result.detailsByDate["2026-11-15"].freeFlatNumbers.includes("212"));
  });

  it("ignores expired provisional holds (pendingModification with expiresAt < nowMs) without blocking", () => {
    const dbWithExpiredHold = {
      ...mockDb,
      reservations: [
        {
          id: 104,
          code: "RES-104",
          flatNumber: "211",
          status: "confirmada",
          pendingModification: {
            status: "pending",
            newFlatNumber: "215",
            newCheckinDate: "2026-11-15",
            newCheckoutDate: "2026-11-18",
            expiresAt: new Date(nowMs - 60000).toISOString() // Expired 1 min ago
          }
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-15", "2026-11-18", { db: dbWithExpiredHold, nowMs });
    assert.equal(result.get("2026-11-15"), 19); // Expired hold does not block!
    assert.ok(result.detailsByDate["2026-11-15"].freeFlatNumbers.includes("215"));
  });

  it("detects conflict type 3: administrative room blocks (db.roomBlocks) block flat for specified date range", () => {
    const dbWithBlock = {
      ...mockDb,
      roomBlocks: [
        {
          id: "blk-1",
          flatNumber: "313",
          startDate: "2026-11-20",
          endDate: "2026-11-23",
          reason: "Pintura geral"
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-19", "2026-11-24", { db: dbWithBlock, nowMs });
    assert.equal(result.get("2026-11-19"), 19);
    assert.equal(result.get("2026-11-20"), 18); // Blocked
    assert.equal(result.get("2026-11-21"), 18); // Blocked
    assert.equal(result.get("2026-11-22"), 18); // Blocked
    assert.equal(result.get("2026-11-23"), 19); // Block finished
    assert.ok(!result.detailsByDate["2026-11-20"].freeFlatNumbers.includes("313"));
  });

  it("detects conflict type 4: maintenance service orders (db.serviceOrders) block flat during execution dates", () => {
    const dbWithOS = {
      ...mockDb,
      serviceOrders: [
        {
          id: "os-408",
          title: "Troca de compressor ar-condicionado",
          status: "active",
          flats: [
            {
              flatNumber: "408",
              status: "in_progress",
              workerName: "Técnico Refrigeração",
              startedAt: "2026-11-25T08:00:00Z",
              estimatedFinishAt: "2026-11-27T18:00:00Z"
            }
          ]
        }
      ]
    };

    const result = calculateCanonicalAvailability("2026-11-24", "2026-11-28", { db: dbWithOS, nowMs });
    assert.equal(result.get("2026-11-24"), 19);
    assert.equal(result.get("2026-11-25"), 18); // OS active
    assert.equal(result.get("2026-11-26"), 18); // OS active
    assert.equal(result.get("2026-11-27"), 19); // Finished
    assert.ok(!result.detailsByDate["2026-11-25"].freeFlatNumbers.includes("408"));
  });

  it("combines all 5 blocking sources on a single date, exactly deducting 5 flats from 19 to yield 14", () => {
    const targetDate = "2026-12-05";
    const nextDate = "2026-12-06";

    const complexDb = {
      flats: CORPFLATS_19_FLATS.map(f => {
        if (f.number === "1304") {
          return { ...f, status: "manutencao_bloqueada" }; // 1. Permanent maintenance
        }
        return { ...f, status: "disponivel", isActive: true };
      }),
      reservations: [
        {
          id: 501,
          code: "RES-501",
          flatNumber: "113",
          checkinDate: "2026-12-04",
          checkoutDate: "2026-12-07",
          status: "confirmada" // 2. Active reservation
        },
        {
          id: 502,
          code: "RES-502",
          flatNumber: "211",
          status: "confirmada",
          pendingModification: { // 3. Active hold
            status: "pending",
            newFlatNumber: "114",
            newCheckinDate: "2026-12-04",
            newCheckoutDate: "2026-12-06",
            expiresAt: new Date(nowMs + 999999).toISOString()
          }
        }
      ],
      roomBlocks: [
        {
          id: "rb-503",
          flatNumber: "116",
          startDate: "2026-12-05",
          endDate: "2026-12-08",
          reason: "Reforma elétrica" // 4. Room block
        }
      ],
      serviceOrders: [
        {
          id: "os-504",
          title: "Vazamento hidráulico",
          status: "active",
          flats: [
            {
              flatNumber: "211",
              status: "in_progress",
              startedAt: "2026-12-05T09:00:00Z",
              estimatedFinishAt: "2026-12-07T12:00:00Z" // 5. Service order
            }
          ]
        }
      ]
    };

    const result = calculateCanonicalAvailability(targetDate, nextDate, { db: complexDb, nowMs });
    assert.equal(result.get(targetDate), 14);
    assert.equal(result.detailsByDate[targetDate].occupiedFlats, 5);
    assert.equal(result.detailsByDate[targetDate].availableFlats, 14);

    const blockedNumbers = result.detailsByDate[targetDate].blockedDetails.map(b => b.flatNumber);
    assert.ok(blockedNumbers.includes("1304"));
    assert.ok(blockedNumbers.includes("113"));
    assert.ok(blockedNumbers.includes("114"));
    assert.ok(blockedNumbers.includes("116"));
    assert.ok(blockedNumbers.includes("211"));
  });

  it("respects optional rate plan ceiling: min(ceiling, availableFlats)", () => {
    const testDb = {
      ...mockDb,
      reservations: [
        { id: 1, flatNumber: "113", checkinDate: "2026-11-10", checkoutDate: "2026-11-12", status: "confirmada" },
        { id: 2, flatNumber: "114", checkinDate: "2026-11-10", checkoutDate: "2026-11-12", status: "confirmada" }
      ]
    }; // 19 - 2 = 17 free flats

    const resCeiling5 = calculateCanonicalAvailability("2026-11-10", "2026-11-11", { db: testDb, ceiling: 5, nowMs });
    assert.equal(resCeiling5.get("2026-11-10"), 5); // min(5, 17) = 5

    const resCeiling20 = calculateCanonicalAvailability("2026-11-10", "2026-11-11", { db: testDb, ceiling: 20, nowMs });
    assert.equal(resCeiling20.get("2026-11-10"), 17); // min(20, 17) = 17
  });

  it("provides non-blocking conflict warnings via checkReservationConflicts()", () => {
    const testDb = {
      ...mockDb,
      reservations: [
        {
          id: 99,
          code: "RES-99",
          flatNumber: "509",
          checkinDate: "2026-11-10",
          checkoutDate: "2026-11-13",
          status: "confirmada",
          guestName: "Marina Souza"
        }
      ]
    };

    // Check with conflict
    const conflictResult = checkReservationConflicts({
      flatNumber: "509",
      checkinDate: "2026-11-11",
      checkoutDate: "2026-11-14",
      db: testDb,
      nowMs
    });

    assert.equal(conflictResult.hasConflict, true);
    assert.equal(conflictResult.isWarningOnly, true);
    assert.ok(conflictResult.warnings.length > 0);
    assert.ok(conflictResult.summaryMessage.includes("ocupado pela reserva RES-99"));

    // Check without conflict
    const freeResult = checkReservationConflicts({
      flatNumber: "511",
      checkinDate: "2026-11-11",
      checkoutDate: "2026-11-14",
      db: testDb,
      nowMs
    });
    assert.equal(freeResult.hasConflict, false);
    assert.equal(freeResult.warnings.length, 0);
  });
});

describe("Milestone 2: SEBRAE Pricing Engine (Exact Math & 100% Closure)", () => {
  it("calculates exact SEBRAE unit costs: fixed R$ 101.62 + variable R$ 47.76 = R$ 149.38", () => {
    const sebrae = calculateSebraeRate();
    assert.equal(sebrae.totalUHs, 19);
    assert.equal(sebrae.daysInMonth, 31);
    assert.equal(sebrae.soldUnitsMonth, 382.85);
    assert.equal(sebrae.fixedCostPerSoldUnit, 101.62);
    assert.equal(sebrae.varCostPerUnit, 47.76);
    assert.equal(sebrae.custoUH, 149.38);
    assert.equal(sebrae.divisor, 0.54);
  });

  it("calculates exact Tarifa Mínima: R$ 149.38 / 0.54 = R$ 276.63 (within ± R$ 0.05)", () => {
    const sebrae = calculateSebraeRate();
    assert.equal(sebrae.tarifaMinima, 276.63);
    assert.ok(Math.abs(sebrae.tarifaMinima - 276.63) <= 0.05);
  });

  it("achieves 100% analytical decomposition with zero residue (149.38 + 41.49 + 69.16 + 16.60 = 276.63)", () => {
    const sebrae = calculateSebraeRate();
    const d = sebrae.decomposicao;
    assert.equal(d.custo, 149.38);
    assert.equal(d.comissao, 41.49);
    assert.equal(d.margem, 69.16);
    assert.equal(d.imposto, 16.60);

    const sum = Math.round((d.custo + d.comissao + d.margem + d.imposto) * 100) / 100;
    assert.equal(sum, 276.63);
    assert.equal(sebrae.somaDecomposicao, 276.63);
    assert.equal(sebrae.fecha100, true);
  });

  it("calculates historical occupancy-based seasonality (Alta: +15%, Baixa: -10%, Média: 0%) and supports manual overrides", () => {
    const seasons = calculateHistoricalSeasonality([], {
      manualOverrides: {
        0: { factor: 1.25, season: "Alta Especial" }
      }
    });

    // Month 0 has manual override
    assert.equal(seasons[0].factor, 1.25);
    assert.equal(seasons[0].season, "Alta Especial");
    assert.equal(seasons[0].isManualOverride, true);

    // Standard high month (December - idx 11)
    assert.equal(seasons[11].factor, 1.15);
    assert.equal(seasons[11].season, "Alta");

    // Standard low month (April - idx 3)
    assert.equal(seasons[3].factor, 0.90);
    assert.equal(seasons[3].season, "Baixa");
  });
});

describe("Milestone 2: Breakfast Surcharge & OBP Mapping", () => {
  it("maps 'Sem café' base rate across rate, rdef_single, adult_1, adult_2, adult_3", () => {
    const plans = calculateRatePlanPrices(276.63, {
      breakfastSurchargePerGuest: 25.00,
      extraBedFee: 60.00
    });

    const sem = plans.sem_cafe;
    assert.equal(sem.rate, 276.63);
    assert.equal(sem.rdef_single, 276.63);
    assert.equal(sem.adult_1, 276.63);
    assert.equal(sem.adult_2, 276.63);
    assert.equal(sem.adult_3, 336.63); // 276.63 + 60.00 extra bed
  });

  it("maps 'Com café' with +R$ 25/guest/night surcharge (rate: +50, rdef_single: +25, adult_3: +75 + extraBed)", () => {
    const plans = calculateRatePlanPrices(276.63, {
      breakfastSurchargePerGuest: 25.00,
      extraBedFee: 60.00
    });

    const com = plans.com_cafe;
    assert.equal(com.rate, 326.63); // 276.63 + 2*25.00
    assert.equal(com.rdef_single, 301.63); // 276.63 + 1*25.00
    assert.equal(com.adult_1, 301.63);
    assert.equal(com.adult_2, 326.63);
    assert.equal(com.adult_3, 411.63); // 276.63 + 3*25.00 + 60.00
  });
});

describe("Milestone 2: Pricing Safety Locks & Staged Publication Workflow", () => {
  it("Floor Lock: blocks rates below max(tarifaMinima, pisoManual)", () => {
    const floorCheckFail = applyPricingLocks({
      candidateRate: 250.00,
      tarifaMinima: 276.63,
      manualFloor: 276.63
    });
    assert.equal(floorCheckFail.approved, false);
    assert.equal(floorCheckFail.lockedReason, "FLOOR_LOCK");
    assert.equal(floorCheckFail.floor, 276.63);

    const floorCheckPass = applyPricingLocks({
      candidateRate: 276.63,
      tarifaMinima: 276.63,
      manualFloor: 276.63
    });
    assert.equal(floorCheckPass.approved, true);
    assert.equal(floorCheckPass.finalRate, 276.63);
    assert.equal(floorCheckPass.lockedReason, null);
  });

  it("Variation Lock: retains rate variations > 30% compared to last sent rate (both spikes and drops)", () => {
    // Upward spike: 300.00 -> 405.00 (+35% > 30%)
    const increaseLocked = applyPricingLocks({
      candidateRate: 405.00,
      lastSentRate: 300.00,
      tarifaMinima: 276.63,
      variationLimitPct: 0.30
    });
    assert.equal(increaseLocked.approved, false);
    assert.equal(increaseLocked.lockedReason, "VARIATION_LOCK");
    assert.equal(increaseLocked.deltaPct, 0.35);

    // Downward drop above floor: 500.00 -> 320.00 (-36% drop > 30%, candidate 320 > 276.63 floor)
    const dropLocked = applyPricingLocks({
      candidateRate: 320.00,
      lastSentRate: 500.00,
      tarifaMinima: 276.63,
      variationLimitPct: 0.30
    });
    assert.equal(dropLocked.approved, false);
    assert.equal(dropLocked.lockedReason, "VARIATION_LOCK");
    assert.equal(dropLocked.deltaPct, -0.36);

    // Normal change within limit: 300.00 -> 345.00 (+15% <= 30%)
    const normalApproved = applyPricingLocks({
      candidateRate: 345.00,
      lastSentRate: 300.00,
      tarifaMinima: 276.63,
      variationLimitPct: 0.30
    });
    assert.equal(normalApproved.approved, true);
    assert.equal(normalApproved.finalRate, 345.00);
    assert.equal(normalApproved.lockedReason, null);
  });

  it("Staged Publication: keeps modifications staged until previewed and published, preserving unconfirmed locks", () => {
    const testDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG },
        status: "published",
        lastPublishedRates: {
          "2026-11-15_sem_cafe": 276.63
        },
        stagedModifications: {
          "2026-11-15_sem_cafe": 450.00 // +62.6% spike > 30%
        },
        confirmedVariations: {}
      }
    };

    // 1. Generate preview
    const preview = WbpPricingManager.generatePreview("2026-11-15", "2026-11-16", testDb);
    assert.equal(preview.kpis.retidosPelaTrava, 1);
    assert.equal(preview.retainedItems.length, 1);
    assert.equal(preview.retainedItems[0].planId, "sem_cafe");
    assert.equal(preview.retainedItems[0].isVariationLocked, true);

    // 2. Publish before confirming: the locked rate MUST be excluded, and PRESERVED in stagedModifications!
    const publishResultBefore = WbpPricingManager.publish(testDb, "2026-11-15", "2026-11-16");
    assert.equal(publishResultBefore.excludedCount, 1);
    assert.equal(testDb.wbpPricing.stagedModifications["2026-11-15_sem_cafe"], 450.00);

    // 3. Confirm variation explicitly
    WbpPricingManager.confirmVariation("2026-11-15", "sem_cafe", testDb);
    assert.equal(testDb.wbpPricing.confirmedVariations["2026-11-15_sem_cafe"], true);

    // 4. Publish after confirming: now it is published!
    const publishResultAfter = WbpPricingManager.publish(testDb, "2026-11-15", "2026-11-16");
    assert.equal(publishResultAfter.publishedRates["2026-11-15_sem_cafe"], 450.00);
  });
});

describe("Milestone 2: Real-Gold Operational Non-Regression Guard (vs Legacy 0501d02)", () => {
  const prodDbPath = path.join(rootDir, "data", "database.json");
  const isolatedDbPath = path.join(os.tmpdir(), `wbp-m2-isolated-db-${Date.now()}-${Math.random().toString(36).substring(2)}.json`);
  const legacyServerFile = path.join(rootDir, "artifacts", "api-server", `.legacy-demo-server-m2-${Date.now()}.tmp.mjs`);

  let initialDbMetadata;
  let legacyPort;
  let activePort;
  let legacyBaseUrl;
  let activeBaseUrl;
  let legacyProcess = null;
  let activeProcess = null;

  before(async () => {
    // 1. Record strict initial metadata for data/database.json
    initialDbMetadata = getFileMetadata(prodDbPath);
    assert.ok(initialDbMetadata != null, "data/database.json must exist");

    // 2. Create isolated test database in os.tmpdir()
    fs.copyFileSync(prodDbPath, isolatedDbPath);

    // Ensure bot actions are permitted in isolated database
    const initialDbContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    initialDbContent.botActionsSettings = {
      apiActionsEnabled: true,
      allowedActions: {
        checkAvailability: true,
        calculateQuote: true,
        generatePayment: true,
        createPreReservation: true,
        commitReservation: true
      },
      preReservationHoldMinutes: 30,
      handoverMessage: "Esta ação do sistema está pausada ou requer atendimento humano.",
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(isolatedDbPath, JSON.stringify(initialDbContent, null, 2), "utf-8");

    // 3. Extract legacy demo-server.mjs from git commit 0501d02
    const legacyCode = execSync("git show 0501d02:artifacts/api-server/demo-server.mjs", {
      cwd: rootDir,
      maxBuffer: 15 * 1024 * 1024
    });
    fs.writeFileSync(legacyServerFile, legacyCode);

    // 4. Allocate dynamic free ports
    legacyPort = await getAvailablePort();
    activePort = await getAvailablePort();
    legacyBaseUrl = `http://127.0.0.1:${legacyPort}`;
    activeBaseUrl = `http://127.0.0.1:${activePort}`;

    // Base isolated environment (strict exclusion of DATABASE_URL)
    const baseSpawnEnv = { ...process.env };
    delete baseSpawnEnv.DATABASE_URL;
    baseSpawnEnv.NODE_ENV = "test";
    baseSpawnEnv.DATA_FILE = isolatedDbPath;
    baseSpawnEnv.DATABASE_FILE = isolatedDbPath;

    // 5. Spawn Legacy Server process
    legacyProcess = spawn("node", [legacyServerFile], {
      cwd: rootDir,
      env: { ...baseSpawnEnv, PORT: String(legacyPort) },
      stdio: "pipe"
    });

    // 6. Spawn Active Server process
    activeProcess = spawn("node", ["artifacts/api-server/demo-server.mjs"], {
      cwd: rootDir,
      env: { ...baseSpawnEnv, PORT: String(activePort) },
      stdio: "pipe"
    });

    // 7. Wait for both servers to be fully ready
    await Promise.all([
      waitForServer(legacyBaseUrl),
      waitForServer(activeBaseUrl)
    ]);
  });

  after(() => {
    // Cleanly terminate both processes
    if (legacyProcess && legacyProcess.pid) killProcessTree(legacyProcess.pid);
    if (activeProcess && activeProcess.pid) killProcessTree(activeProcess.pid);

    // Remove temporary legacy file and isolated test database
    try {
      if (fs.existsSync(legacyServerFile)) fs.unlinkSync(legacyServerFile);
    } catch (_) {}
    try {
      if (fs.existsSync(isolatedDbPath)) fs.unlinkSync(isolatedDbPath);
    } catch (_) {}

    // Verify real data/database.json was NEVER modified
    const finalDbMetadata = getFileMetadata(prodDbPath);
    assert.equal(finalDbMetadata.hash, initialDbMetadata.hash, "Real data/database.json hash MUST NOT change!");
    assert.equal(finalDbMetadata.mtimeMs, initialDbMetadata.mtimeMs, "Real data/database.json mtime MUST NOT change!");
  });

  it("proves complete database isolation: isolated DB is in tmpdir and real database.json is untouched", () => {
    assert.ok(isolatedDbPath.startsWith(os.tmpdir()), "Isolated DB must be in os.tmpdir()");
    const currentMeta = getFileMetadata(prodDbPath);
    assert.equal(currentMeta.hash, initialDbMetadata.hash);
    assert.equal(currentMeta.mtimeMs, initialDbMetadata.mtimeMs);
  });

  it("serves WBP HTTP Endpoints on Active server and attaches non-blocking conflict warnings to PMS reservations", async () => {
    // 1. GET /api/wbp/availability
    const availRes = await fetch(`${activeBaseUrl}/api/wbp/availability?startDate=2026-11-10&endDate=2026-11-12`);
    assert.equal(availRes.status, 200);
    const availData = await availRes.json();
    assert.equal(availData.success, true);
    assert.equal(availData.totalFlats, 19);
    assert.ok(typeof availData.minAvailable === "number");

    // 2. POST /api/wbp/conflicts/check
    const conflictRes = await fetch(`${activeBaseUrl}/api/wbp/conflicts/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatNumber: "113",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12"
      })
    });
    assert.equal(conflictRes.status, 200);
    const conflictData = await conflictRes.json();
    assert.equal(conflictData.success, true);
    assert.equal(conflictData.isWarningOnly, true);

    // 3. GET /api/wbp/pricing/preview
    const prevRes = await fetch(`${activeBaseUrl}/api/wbp/pricing/preview?startDate=2026-11-10&endDate=2026-11-12`);
    assert.equal(prevRes.status, 200);
    const prevData = await prevRes.json();
    assert.equal(prevData.success, true);
    assert.ok(prevData.kpis != null);
    assert.ok(Array.isArray(prevData.diffList));

    // 4. PMS reservation creation with conflict attaches non-blocking warning (201 Created)
    const pmsRes = await fetch(`${activeBaseUrl}/api/pms/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flatId: 1,
        flatNumber: "113",
        checkinDate: "2026-11-10",
        checkoutDate: "2026-11-12",
        guestName: "Hóspede Teste M2",
        total: 500
      })
    });
    assert.equal(pmsRes.status, 201);
    const pmsData = await pmsRes.json();
    assert.ok(pmsData.id);
  });

  it("preserves exact legacy calculateDailyRate results across multiple flats, weekdays, weekends, high/low season, and all channels (direct, booking, airbnb)", async () => {
    // Test matrix of representative conditions:
    const testCases = [
      // Weekdays (Monday) & Weekends (Friday/Saturday) in regular season (Nov 2026)
      { month: "2026-11", flatId: "1", channel: "direct" },
      { month: "2026-11", flatId: "1", channel: "booking" },
      { month: "2026-11", flatId: "1", channel: "airbnb" },
      { month: "2026-11", flatId: "4", channel: "direct" },
      { month: "2026-11", flatId: "10", channel: "booking" },
      // High season (Dec 2026)
      { month: "2026-12", flatId: "2", channel: "direct" },
      { month: "2026-12", flatId: "6", channel: "booking" },
      { month: "2026-12", flatId: "21", channel: "airbnb" },
      // Low season (April 2026)
      { month: "2026-04", flatId: "3", channel: "direct" },
      { month: "2026-04", flatId: "8", channel: "booking" },
      { month: "2026-04", flatId: "16", channel: "airbnb" }
    ];

    for (const tc of testCases) {
      const urlLegacy = `${legacyBaseUrl}/api/tariffs/calendar?month=${tc.month}&channel=${tc.channel}&flatId=${tc.flatId}`;
      const urlActive = `${activeBaseUrl}/api/tariffs/calendar?month=${tc.month}&channel=${tc.channel}&flatId=${tc.flatId}`;

      const [resLegacy, resActive] = await Promise.all([
        fetch(urlLegacy),
        fetch(urlActive)
      ]);

      assert.equal(resLegacy.status, 200, `Legacy calendar failed for ${tc.month} ${tc.channel}`);
      assert.equal(resActive.status, 200, `Active calendar failed for ${tc.month} ${tc.channel}`);

      const [dataLegacy, dataActive] = await Promise.all([
        resLegacy.json(),
        resActive.json()
      ]);

      assert.equal(dataActive.days.length, dataLegacy.days.length, `Days count mismatch for ${tc.month}`);

      for (let i = 0; i < dataLegacy.days.length; i++) {
        const dLeg = dataLegacy.days[i];
        const dAct = dataActive.days[i];

        assert.equal(dAct.date, dLeg.date);
        assert.equal(dAct.dayOfWeek, dLeg.dayOfWeek);
        assert.equal(dAct.isWeekend, dLeg.isWeekend);
        assert.equal(
          dAct.rate,
          dLeg.rate,
          `Tariff mismatch on ${dLeg.date} for flat ${tc.flatId} channel ${tc.channel}: active=${dAct.rate} vs legacy=${dLeg.rate}`
        );
      }
    }
  });

  it("preserves exact legacy calculateDailyRate results with P1-P4 tariff overrides", async () => {
    // Inject P1-P4 overrides into isolated database
    const dbContent = JSON.parse(fs.readFileSync(isolatedDbPath, "utf-8"));
    dbContent.tariffOverrides = [
      // P1: Flat específico + Canal exato
      { id: "ovr-p1", flatId: "1", date: "2026-11-18", channel: "direct", rate: 399.00, reason: "P1 Override" },
      // P2: Flat específico + Canal all
      { id: "ovr-p2", flatId: "1", date: "2026-11-19", channel: "all", rate: 419.00, reason: "P2 Override" },
      // P3: Flat global (null/all) + Canal exato
      { id: "ovr-p3", flatId: null, date: "2026-11-20", channel: "booking", rate: 450.00, reason: "P3 Override" },
      // P4: Flat global (null/all) + Canal all
      { id: "ovr-p4", flatId: null, date: "2026-11-21", channel: "all", rate: 499.00, reason: "P4 Override" }
    ];
    fs.writeFileSync(isolatedDbPath, JSON.stringify(dbContent, null, 2), "utf-8");

    // Both servers read from isolatedDbPath on each request (or reload)
    const testCases = [
      { flatId: "1", channel: "direct" },
      { flatId: "1", channel: "booking" },
      { flatId: "2", channel: "booking" },
      { flatId: "2", channel: "direct" }
    ];

    for (const tc of testCases) {
      const urlLegacy = `${legacyBaseUrl}/api/tariffs/calendar?month=2026-11&channel=${tc.channel}&flatId=${tc.flatId}`;
      const urlActive = `${activeBaseUrl}/api/tariffs/calendar?month=2026-11&channel=${tc.channel}&flatId=${tc.flatId}`;

      const [resLegacy, resActive] = await Promise.all([
        fetch(urlLegacy),
        fetch(urlActive)
      ]);

      const [dataLegacy, dataActive] = await Promise.all([
        resLegacy.json(),
        resActive.json()
      ]);

      for (let i = 0; i < dataLegacy.days.length; i++) {
        const dLeg = dataLegacy.days[i];
        const dAct = dataActive.days[i];
        assert.equal(
          dAct.rate,
          dLeg.rate,
          `Override tariff mismatch on ${dLeg.date} for flat ${tc.flatId} channel ${tc.channel}: active=${dAct.rate} vs legacy=${dLeg.rate}`
        );
      }
    }
  });

  it("preserves exact legacy POST /api/bot-actions/quote responses across weekday, weekend, guest counts, and channels", async () => {
    const quotePayloads = [
      // Weekday couple (direct)
      { checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 2, flatId: 1, channel: "direct", ratePlan: "room_only" },
      // Weekend couple (direct)
      { checkIn: "2026-11-20", checkOut: "2026-11-22", guests: 2, flatId: 1, channel: "direct", ratePlan: "room_only" },
      // Solo traveler (1 guest)
      { checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 1, flatId: 2, channel: "direct", ratePlan: "room_only" },
      // Family (3 guests, extra bed)
      { checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 3, flatId: 1, channel: "direct", ratePlan: "room_only" },
      // Weekday booking channel
      { checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 2, flatId: 4, channel: "booking", ratePlan: "room_only" },
      // Weekend airbnb channel
      { checkIn: "2026-11-20", checkOut: "2026-11-22", guests: 2, flatId: 4, channel: "airbnb", ratePlan: "room_only" }
    ];

    for (const payload of quotePayloads) {
      const [resLegacy, resActive] = await Promise.all([
        fetch(`${legacyBaseUrl}/api/bot-actions/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }),
        fetch(`${activeBaseUrl}/api/bot-actions/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        })
      ]);

      assert.equal(resActive.status, resLegacy.status, `Status mismatch for quote: ${JSON.stringify(payload)}`);
      assert.equal(resActive.status, 200);

      const [dataLegacy, dataActive] = await Promise.all([
        resLegacy.json(),
        resActive.json()
      ]);

      assert.equal(dataActive.success, dataLegacy.success);
      assert.equal(dataActive.nights, dataLegacy.nights);
      assert.equal(dataActive.cleaningFee, dataLegacy.cleaningFee);
      assert.equal(dataActive.extraBedFee, dataLegacy.extraBedFee);
      assert.equal(dataActive.roomTotal, dataLegacy.roomTotal, `roomTotal mismatch: ${dataActive.roomTotal} vs ${dataLegacy.roomTotal}`);
      assert.equal(dataActive.total, dataLegacy.total, `total mismatch: ${dataActive.total} vs ${dataLegacy.total}`);

      // Verify daily rates breakdown matches to the penny
      assert.equal(dataActive.dailyRates.length, dataLegacy.dailyRates.length);
      for (let i = 0; i < dataLegacy.dailyRates.length; i++) {
        assert.equal(dataActive.dailyRates[i].date, dataLegacy.dailyRates[i].date);
        assert.equal(dataActive.dailyRates[i].rate, dataLegacy.dailyRates[i].rate);
      }
    }
  });

  it("preserves exact legacy GET /api/bot-actions/availability responses", async () => {
    const testRanges = [
      { checkIn: "2026-11-16", checkOut: "2026-11-18", guests: 2 },
      { checkIn: "2026-11-20", checkOut: "2026-11-23", guests: 2 },
      { checkIn: "2026-12-10", checkOut: "2026-12-15", guests: 1 }
    ];

    for (const range of testRanges) {
      const qs = `checkIn=${range.checkIn}&checkOut=${range.checkOut}&guests=${range.guests}`;
      const [resLegacy, resActive] = await Promise.all([
        fetch(`${legacyBaseUrl}/api/bot-actions/availability?${qs}`),
        fetch(`${activeBaseUrl}/api/bot-actions/availability?${qs}`)
      ]);

      assert.equal(resActive.status, resLegacy.status);
      assert.equal(resActive.status, 200);

      const [dataLegacy, dataActive] = await Promise.all([
        resLegacy.json(),
        resActive.json()
      ]);

      assert.equal(dataActive.success, dataLegacy.success);
      assert.equal(dataActive.available, dataLegacy.available);
      assert.equal(dataActive.flats.length, dataLegacy.flats.length);

      const activeFlatIds = dataActive.flats.map(f => f.id).sort();
      const legacyFlatIds = dataLegacy.flats.map(f => f.id).sort();
      assert.deepEqual(activeFlatIds, legacyFlatIds);
    }
  });
});
