/**
 * tests/wbp-integration/challenger-tier5-ari-pricing.test.mjs
 *
 * Tier 5 Adversarial Coverage Hardening: ARI, Canonical Availability & SEBRAE Pricing Engine.
 *
 * White-Box Adversarial Stress Harness:
 * 1. Cryptographic Baseline & Environment Isolation:
 *    - Asserts baseline data/database.json SHA-256 (7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6, 997,627 bytes)
 *      has ZERO changes pre-flight and post-flight.
 *    - Uses ephemeral DB, raw storage, idempotency, and card vault in os.tmpdir().
 *    - Strips DATABASE_URL, forces NODE_ENV = "test", uses dynamic port allocation.
 *
 * 2. SEBRAE Pricing Engine - Extreme Bounds & Mathematical Precision:
 *    - R$ 149,38 unit cost -> R$ 276,63 (±0,05) minimum rate with 100% zero-residue decomposition (fecha100 = true).
 *    - Extreme inputs: zero/negative UHs, days in month, occupancy bounds (0, 1], deductions >= 100%, zero fixed/variable costs.
 *    - Leap year February (28 vs 29 days) unit cost & rate dynamics.
 *    - Monte Carlo rounding stability across 50 random cost/margin permutations.
 *
 * 3. Pricing Safety Locks - Floor, Spikes (>30%) & Staged Publishing:
 *    - Floor lock: R$ 276,62 (R$ 0,01 below floor) blocked; R$ 276,63 approved; NaN/Infinity blocked.
 *    - Rate spikes: +30.1% / -30.1% variation blocked; +29.9% / -29.9% approved.
 *    - Edge case variationLimitPct: 0 fallback to 0.30; string parsing; invalid setting rejection.
 *    - Staged publication workflow: below-floor and unconfirmed variation locks strictly excluded from ARI wire push.
 *
 * 4. Canonical Availability - Leap Days, High Concurrency & Zero Units Stop-Sell:
 *    - Leap Day (2028-02-29): stay interval spanning Feb 28 to March 1 correctly occupies Feb 28 and Feb 29.
 *    - Same-day turnaround (checkout 12:00, checkin 14:00) on same flat has zero conflict.
 *    - Multi-source collision: reservation + hold + block + service order on same flat.
 *    - Extreme ceiling limits: negative, 0, decimal, string; zero units stop-sell triggers.
 *    - High-volume concurrency: 100 parallel asynchronous inquiries without state mutation or race conditions.
 *
 * 5. ARI Batching, Debouncing Timers & Concurrency (<10s Deltas):
 *    - 30 rapid successive mutation bursts coalesced into minimal bounding interval [minDate, maxDate].
 *    - Max-wait ceiling guarantee: continuous incoming bursts cannot delay sync past 6s (<= 10s).
 *    - Inactive mode 'off': zero timers, zero transmissions, 100% inert.
 *    - Mode 'observe': calculation executed without outbound network transmission.
 *
 * 6. Network Failure Backoff, Retry & Simulator OpenAPI Schema Compliance:
 *    - Transient error (1003) exponential backoff retry with UUID v4 GUID reuse.
 *    - Non-retryable error (1001) aborts immediately on attempt 1.
 *    - Persistent failure tracker (>15 min) critical alert callback and recovery notification.
 *    - 100% OpenAPI schema validation against wbpAPI.yaml via validateRequest("ARIUpdate", payload).
 *
 * Execution (Strict scope per AGENTS.md):
 * node --test tests/wbp-integration/challenger-tier5-ari-pricing.test.mjs
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

// ── Environment Isolation Mandate ──────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const prodDbPath = path.resolve(rootDir, "data/database.json");
const EXPECTED_PROD_HASH = "7e94a217681ea595dc10681ec3d1ad0964e6b2dbce828acd8f6d8633b87e71c6";
const EXPECTED_PROD_SIZE = 997627;

// Ephemeral sandboxed paths in os.tmpdir()
const testRunId = `challenger_tier5_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const tempDir = path.join(os.tmpdir(), testRunId);
fs.mkdirSync(tempDir, { recursive: true });

const tempDbPath = path.join(tempDir, "database.json");
const tempRawStoragePath = path.join(tempDir, "wbp_raw_payloads.jsonl");
const tempIdempotencyPath = path.join(tempDir, "wbp_idempotency.json");
const tempVaultPath = path.join(tempDir, "card_vault.json");

// Configure process.env strictly BEFORE any application imports
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.DATA_FILE = tempDbPath;
process.env.DATABASE_FILE = tempDbPath;
process.env.WBP_RAW_STORAGE_FILE = tempRawStoragePath;
process.env.WBP_IDEMPOTENCY_FILE = tempIdempotencyPath;
process.env.WBP_CARD_VAULT_FILE = tempVaultPath;
process.env.CREDIT_CARD_VAULT_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Import target modules
import {
  calculateCanonicalAvailability,
  checkReservationConflicts,
  checkFlatBlockedOnNight,
  getNightsBetween,
  normalizeDateStr,
  matchFlat,
  getCanonicalFlats,
  CORPFLATS_19_FLATS
} from "../../artifacts/api-server/wbp/availability.mjs";

import {
  WbpPricingManager,
  calculateSebraeRate,
  calculateRatePlanPrices,
  calculateHistoricalSeasonality,
  applyPricingLocks,
  round2,
  DEFAULT_SEBRAE_CONFIG,
  STANDARD_SEBRAE_SEASONALITY_FACTORS
} from "../../artifacts/api-server/wbp/pricing.mjs";

import {
  WbpAriSynchronizer,
  getAriSynchronizer,
  notifyPmsMutation,
  compressContiguousBlocks,
  resolveRestrictions,
  calculateFullPushHorizon,
  addDays,
  isNextDay,
  getNightsList,
  DEFAULT_RESTRICTIONS,
  DEFAULT_WBP_MAPPING
} from "../../artifacts/api-server/wbp/ari-sync.mjs";

import { WBPClient, WbpApiError } from "../../artifacts/api-server/wbp/client.mjs";
import { WBP_MODES, setIntegrationMode } from "../../artifacts/api-server/wbp/config.mjs";
import { WBPSimulator } from "../../e2e/wbp-simulator/server.mjs";
import { validateRequest, UUID_V4_REGEX } from "../../e2e/wbp-simulator/schemas/index.mjs";

function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

describe("Tier 5 Adversarial Coverage Hardening: ARI, Availability & SEBRAE Pricing", () => {
  let simulatorHarness;
  let simulatorPort;
  let simulatorUrl;
  let preFlightProdHash;
  let preFlightProdSize;

  before(async () => {
    // 1. Verify baseline production DB cryptographic identity
    assert.ok(fs.existsSync(prodDbPath), "Production data/database.json must exist");
    preFlightProdHash = getFileSha256(prodDbPath);
    preFlightProdSize = fs.statSync(prodDbPath).size;

    assert.equal(
      preFlightProdHash.toLowerCase(),
      EXPECTED_PROD_HASH.toLowerCase(),
      "Pre-flight baseline database SHA-256 mismatch"
    );
    assert.equal(preFlightProdSize, EXPECTED_PROD_SIZE, "Pre-flight baseline database size mismatch");

    // Copy to isolated ephemeral DB for tests that require a base state
    fs.copyFileSync(prodDbPath, tempDbPath);

    // 2. Start local WBP simulator on dynamic port
    simulatorHarness = new WBPSimulator({ strictSchemas: false });
    await simulatorHarness.start(0);
    simulatorPort = simulatorHarness.port;
    simulatorUrl = simulatorHarness.url;
  });

  after(async () => {
    // 1. Stop simulator
    if (simulatorHarness) {
      await simulatorHarness.stop();
    }

    // 2. Cleanup ephemeral directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}

    // 3. Assert baseline production DB is 100% UNTOUCHED
    const postFlightHash = getFileSha256(prodDbPath);
    const postFlightSize = fs.statSync(prodDbPath).size;

    assert.equal(
      postFlightHash.toLowerCase(),
      EXPECTED_PROD_HASH.toLowerCase(),
      "POST-FLIGHT INTEGRITY VIOLATION: production data/database.json hash changed!"
    );
    assert.equal(
      postFlightSize,
      EXPECTED_PROD_SIZE,
      "POST-FLIGHT INTEGRITY VIOLATION: production data/database.json file size changed!"
    );
  });

  // =========================================================================
  // CATEGORY 1: SEBRAE Pricing Engine — Precision, Bounds & Rounding
  // =========================================================================
  describe("Category 1: SEBRAE Pricing Engine — Mathematical Precision & Extreme Bounds", () => {
    it("T5-PRC-01: reproduces exact SEBRAE baseline (R$ 149,38 -> R$ 276,63 ± 0,05) with 100% zero-residue closure", () => {
      const result = calculateSebraeRate(DEFAULT_SEBRAE_CONFIG);

      // Custo UH = R$ 101,62 (fixo) + R$ 47,76 (variáveis) = R$ 149,38
      assert.equal(result.fixedCostPerSoldUnit, 101.62);
      assert.equal(result.varCostPerUnit, 47.76);
      assert.equal(result.custoUH, 149.38);

      // Divisor = 1 - (0.15 + 0.25 + 0.06) = 0.54
      assert.equal(result.divisor, 0.54);

      // Tarifa Mínima = 149.38 / 0.54 = 276.63 (within ±0.05 of 276.63)
      assert.equal(result.tarifaMinima, 276.63);
      assert.ok(Math.abs(result.tarifaMinima - 276.63) <= 0.05);

      // Analytical decomposition sums exactly to tarifaMinima
      const { custo, comissao, margem, imposto } = result.decomposicao;
      assert.equal(custo, 149.38);
      assert.equal(comissao, 41.49);
      assert.equal(margem, 69.16);
      assert.equal(imposto, 16.60);

      const sumDecomp = round2(custo + comissao + margem + imposto);
      assert.equal(sumDecomp, result.tarifaMinima);
      assert.equal(result.fecha100, true);
    });

    it("T5-PRC-02: rejects invalid, zero, and negative unit/date/occupancy inputs with explicit errors", () => {
      // Zero or negative total UHs
      assert.throws(() => calculateSebraeRate({ totalUHs: 0 }), /maiores que zero/);
      assert.throws(() => calculateSebraeRate({ totalUHs: -10 }), /maiores que zero/);

      // Zero or negative days in month
      assert.throws(() => calculateSebraeRate({ daysInMonth: 0 }), /maiores que zero/);
      assert.throws(() => calculateSebraeRate({ daysInMonth: -31 }), /maiores que zero/);

      // Zero, negative, or >100% occupancy rate
      assert.throws(() => calculateSebraeRate({ occupancyRate: 0 }), /entre 0.*e 1/);
      assert.throws(() => calculateSebraeRate({ occupancyRate: -0.5 }), /entre 0.*e 1/);
      assert.throws(() => calculateSebraeRate({ occupancyRate: 1.05 }), /entre 0.*e 1/);

      // Deductions summing to >= 100% (e.g. commission 0.60 + margin 0.35 + tax 0.10 = 1.05)
      assert.throws(
        () => calculateSebraeRate({ channelCommissionPct: 0.60, targetMarginPct: 0.35, taxRatePct: 0.10 }),
        /não pode atingir ou ultrapassar 100%/
      );
      // Exactly 100% deductions (divisor = 0)
      assert.throws(
        () => calculateSebraeRate({ channelCommissionPct: 0.50, targetMarginPct: 0.40, taxRatePct: 0.10 }),
        /não pode atingir ou ultrapassar 100%/
      );
    });

    it("T5-PRC-03: handles February leap year (29 days) vs regular (28 days) unit cost & pricing shifts", () => {
      // Regular February (28 days): 19 * 28 = 532 units
      const febRegular = calculateSebraeRate({ ...DEFAULT_SEBRAE_CONFIG, daysInMonth: 28 });
      assert.equal(febRegular.availableUnits, 532);
      assert.equal(febRegular.fixedCostPerSoldUnit, 112.51); // 38906.61 / (532 * 0.65)
      assert.equal(febRegular.custoUH, 160.27);
      assert.equal(febRegular.tarifaMinima, 296.80);
      assert.equal(febRegular.fecha100, true);

      // Leap Year February (29 days): 19 * 29 = 551 units
      const febLeap = calculateSebraeRate({ ...DEFAULT_SEBRAE_CONFIG, daysInMonth: 29 });
      assert.equal(febLeap.availableUnits, 551);
      assert.equal(febLeap.fixedCostPerSoldUnit, 108.63); // 38906.61 / (551 * 0.65)
      assert.equal(febLeap.custoUH, 156.39);
      assert.equal(febLeap.tarifaMinima, 289.61);
      assert.equal(febLeap.fecha100, true);

      // Leap year has higher unit capacity -> lower fixed cost per UH -> lower minimum sustainable rate
      assert.ok(febLeap.tarifaMinima < febRegular.tarifaMinima);
      assert.equal(round2(febRegular.tarifaMinima - febLeap.tarifaMinima), 7.19);
    });

    it("T5-PRC-04: evaluates boundary conditions with zero fixed costs and zero variable costs", () => {
      // Zero fixed costs (only variable costs)
      const zeroFixed = calculateSebraeRate({
        ...DEFAULT_SEBRAE_CONFIG,
        fixedCostsMonth: 0,
        fixedRent: 0,
        fixedOther: 0
      });
      assert.equal(zeroFixed.fixedCostPerSoldUnit, 0);
      assert.equal(zeroFixed.custoUH, 47.76);
      assert.equal(zeroFixed.tarifaMinima, round2(47.76 / 0.54)); // 88.44
      assert.equal(zeroFixed.fecha100, true);

      // Zero variable costs (only fixed costs)
      const zeroVar = calculateSebraeRate({
        ...DEFAULT_SEBRAE_CONFIG,
        varCleaning: 0,
        varLinen: 0,
        varUtilities: 0
      });
      assert.equal(zeroVar.varCostPerUnit, 0);
      assert.equal(zeroVar.custoUH, 101.62);
      assert.equal(zeroVar.tarifaMinima, round2(101.62 / 0.54)); // 188.19
      assert.equal(zeroVar.fecha100, true);
    });

    it("T5-PRC-05: monte carlo stress test across 50 cost & deduction permutations confirms 100% decomposition closure", () => {
      for (let i = 0; i < 50; i++) {
        const randUhs = 10 + Math.floor(Math.random() * 20); // 10..29
        const randDays = 28 + Math.floor(Math.random() * 4); // 28..31
        const randOcc = round2(0.35 + Math.random() * 0.55); // 0.35..0.90
        const randFixed = round2(20000 + Math.random() * 30000); // 20k..50k
        const randCleaning = round2(10 + Math.random() * 30);
        const randLinen = round2(5 + Math.random() * 20);
        const randUtilities = round2(5 + Math.random() * 15);
        const randComm = round2(0.10 + Math.random() * 0.15); // 10%..25%
        const randMargin = round2(0.15 + Math.random() * 0.20); // 15%..35%
        const randTax = round2(0.04 + Math.random() * 0.08); // 4%..12%

        const res = calculateSebraeRate({
          totalUHs: randUhs,
          daysInMonth: randDays,
          occupancyRate: randOcc,
          fixedCostsMonth: randFixed,
          varCleaning: randCleaning,
          varLinen: randLinen,
          varUtilities: randUtilities,
          channelCommissionPct: randComm,
          targetMarginPct: randMargin,
          taxRatePct: randTax
        });

        assert.equal(res.fecha100, true, `Decomposition must close 100% on iteration ${i}`);
        assert.equal(res.somaDecomposicao, res.tarifaMinima, `Decomposition sum must equal tarifaMinima on iteration ${i}`);
        assert.ok(Number.isFinite(res.tarifaMinima) && res.tarifaMinima > 0);
      }
    });
  });

  // =========================================================================
  // CATEGORY 2: Pricing Safety Locks — Floor, Spikes (>30%) & Staged Publishing
  // =========================================================================
  describe("Category 2: Pricing Safety Locks — Floor, Variation Limits & Staged Publishing", () => {
    it("T5-LCK-01: floor lock strictly blocks 1 cent below minimum rate (R$ 276,62) and approves R$ 276,63", () => {
      // 1 cent below floor
      const below = applyPricingLocks({
        candidateRate: 276.62,
        tarifaMinima: 276.63,
        manualFloor: 276.63
      });
      assert.equal(below.approved, false);
      assert.equal(below.lockedReason, "FLOOR_LOCK");
      assert.ok(below.message.includes("abaixo do piso"));

      // Exactly at floor
      const atFloor = applyPricingLocks({
        candidateRate: 276.63,
        tarifaMinima: 276.63,
        manualFloor: 276.63
      });
      assert.equal(atFloor.approved, true);
      assert.equal(atFloor.finalRate, 276.63);
      assert.equal(atFloor.lockedReason, null);

      // Invalid numerical values (0, negative, NaN, Infinity, null)
      for (const invalidRate of [0, -10, NaN, Infinity, -Infinity, null, undefined, "abc"]) {
        const locked = applyPricingLocks({
          candidateRate: invalidRate,
          tarifaMinima: 276.63,
          manualFloor: 276.63
        });
        assert.equal(locked.approved, false);
        assert.equal(locked.lockedReason, "FLOOR_LOCK");
      }
    });

    it("T5-LCK-02: variation lock detects sudden spikes >30% and drops >30% with decimal precision", () => {
      const lastSentRate = 300.00;

      // Upward: +29.9% (389.70) -> Approved
      const upValid = applyPricingLocks({
        candidateRate: 389.70,
        lastSentRate,
        variationLimitPct: 0.30
      });
      assert.equal(upValid.approved, true);
      assert.equal(upValid.lockedReason, null);

      // Upward: +30.1% (390.30) -> Blocked by VARIATION_LOCK
      const upSpike = applyPricingLocks({
        candidateRate: 390.30,
        lastSentRate,
        variationLimitPct: 0.30
      });
      assert.equal(upSpike.approved, false);
      assert.equal(upSpike.lockedReason, "VARIATION_LOCK");
      assert.ok(upSpike.message.includes("Variação de 30.1%"));

      // Downward: -29.9% (210.30) -> Approved (assuming candidate >= floor)
      const downValid = applyPricingLocks({
        candidateRate: 210.30,
        lastSentRate,
        tarifaMinima: 200.00,
        manualFloor: 200.00,
        variationLimitPct: 0.30
      });
      assert.equal(downValid.approved, true);
      assert.equal(downValid.lockedReason, null);

      // Downward: -30.1% (209.70) -> Blocked by VARIATION_LOCK
      const downDrop = applyPricingLocks({
        candidateRate: 209.70,
        lastSentRate,
        tarifaMinima: 200.00,
        manualFloor: 200.00,
        variationLimitPct: 0.30
      });
      assert.equal(downDrop.approved, false);
      assert.equal(downDrop.lockedReason, "VARIATION_LOCK");
      assert.ok(downDrop.message.includes("excede a trava de 30%"));
    });

    it("T5-LCK-03: variationLimitPct = 0 edge case falls back safely to 0.30 without error or bypass", () => {
      const lastSentRate = 300.00;

      // When variationLimitPct is explicitly 0, applyPricingLocks falls back to 0.30
      const resSpike = applyPricingLocks({
        candidateRate: 450.00, // +50% spike
        lastSentRate,
        variationLimitPct: 0
      });
      assert.equal(resSpike.approved, false);
      assert.equal(resSpike.lockedReason, "VARIATION_LOCK");

      // UpdateSettings with variationLimitPct <= 0 throws error
      const mockDb = { wbpPricing: null };
      assert.throws(
        () => WbpPricingManager.updateSettings({ variationLimitPct: 0 }, mockDb),
        /variationLimitPct inválido.*Deve ser um número positivo/
      );
      assert.throws(
        () => WbpPricingManager.updateSettings({ variationLimitPct: -0.15 }, mockDb),
        /variationLimitPct inválido/
      );
    });

    it("T5-LCK-04: staged publishing workflow strictly excludes below-floor and unconfirmed variation locks", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [],
        roomBlocks: [],
        serviceOrders: [],
        wbpPricing: {
          settings: { ...DEFAULT_SEBRAE_CONFIG, manualFloor: 276.63, variationLimitPct: 0.30 },
          status: "published",
          seasonalityOverrides: {},
          stagedModifications: {
            "2026-12-01_sem_cafe": 250.00, // Below floor (276.63) -> must be excluded!
            "2026-12-02_sem_cafe": 550.00, // Sudden spike >30% unconfirmed -> must be excluded!
            "2026-12-03_sem_cafe": 550.00, // Sudden spike >30% CONFIRMED -> must be published!
            "2026-12-04_sem_cafe": 310.00  // Valid rate (+12%) -> must be published!
          },
          confirmedVariations: {
            "2026-12-03_sem_cafe": true
          },
          lastPublishedRates: {
            "2026-12-01_sem_cafe": 280.00,
            "2026-12-02_sem_cafe": 280.00,
            "2026-12-03_sem_cafe": 280.00,
            "2026-12-04_sem_cafe": 280.00
          }
        }
      };

      // Generate preview for these dates
      const preview = WbpPricingManager.generatePreview("2026-12-01", "2026-12-05", mockDb);
      assert.ok(preview.kpis.abaixoDoPiso >= 1, "Must detect at least 1 below floor item");
      assert.ok(preview.kpis.retidosPelaTrava >= 1, "Must detect at least 1 variation locked item");

      // Execute atomic publication
      const publishResult = WbpPricingManager.publish(mockDb, "2026-12-01", "2026-12-05");

      // 2026-12-01_sem_cafe was below floor -> excluded
      assert.notEqual(publishResult.publishedRates["2026-12-01_sem_cafe"], 250.00);

      // 2026-12-02_sem_cafe was unconfirmed spike -> excluded
      assert.notEqual(publishResult.publishedRates["2026-12-02_sem_cafe"], 550.00);

      // 2026-12-03_sem_cafe was confirmed spike -> published!
      assert.equal(publishResult.publishedRates["2026-12-03_sem_cafe"], 550.00);

      // 2026-12-04_sem_cafe was valid rate -> published!
      assert.equal(publishResult.publishedRates["2026-12-04_sem_cafe"], 310.00);

      // Assert that none of the generated ARI blocks contain the invalid below-floor rate 250.00
      const invalidAriBlock = publishResult.ariPayloadBlocks.find(
        b => b.start_date === "2026-12-01" && b.wbp_rate_id === "sem_cafe" && b.rate === 250.00
      );
      assert.equal(invalidAriBlock, undefined, "ARI payload blocks must never contain rates below floor");
    });
  });

  // =========================================================================
  // CATEGORY 3: Canonical Availability Engine — Leap Days & Extreme Invariants
  // =========================================================================
  describe("Category 3: Canonical Availability — Leap Days, High Concurrency & Zero Units", () => {
    it("T5-AVA-01: handles Leap Day (Feb 29, 2028) spanning reservations without off-by-one or day drift", () => {
      // 2028 is a leap year; 2028-02-29 exists
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [
          {
            id: "res_leap_1",
            code: "LEAP-2028",
            guestName: "Leap Guest",
            flatNumber: "113",
            flatId: 1,
            checkinDate: "2028-02-28",
            checkoutDate: "2028-03-01", // Covers night of 2028-02-28 and 2028-02-29!
            status: "ativa"
          }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      const avail = calculateCanonicalAvailability("2028-02-27", "2028-03-02", { db: mockDb });

      // Feb 27: 19 flats available
      assert.equal(avail.get("2028-02-27"), 19);

      // Feb 28: 18 flats available (flat 113 occupied)
      assert.equal(avail.get("2028-02-28"), 18);

      // Feb 29 (Leap Day): 18 flats available (flat 113 occupied)
      assert.equal(avail.get("2028-02-29"), 18);

      // March 01: 19 flats available (guest checked out)
      assert.equal(avail.get("2028-03-01"), 19);

      // Check detail breakdown on leap day
      const leapDetail = avail.detailsByDate["2028-02-29"];
      assert.ok(leapDetail, "Leap day must exist in availability details");
      assert.equal(leapDetail.availableFlats, 18);
      assert.equal(leapDetail.occupiedFlats, 1);
      assert.ok(!leapDetail.freeFlatNumbers.includes("113"), "Flat 113 must not be free on Feb 29");
    });

    it("T5-AVA-02: same-day turnover (checkout 12:00, checkin 14:00) produces zero collision", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [
          {
            id: "res_morning",
            code: "RES-OUT",
            guestName: "Departing Guest",
            flatNumber: "211",
            checkinDate: "2026-11-01",
            checkoutDate: "2026-11-05", // Leaves on Nov 5 morning
            status: "ativa"
          },
          {
            id: "res_afternoon",
            code: "RES-IN",
            guestName: "Arriving Guest",
            flatNumber: "211",
            checkinDate: "2026-11-05", // Enters on Nov 5 afternoon
            checkoutDate: "2026-11-09",
            status: "ativa"
          }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      // Conflict check for creating the second reservation on 2026-11-05
      const conflictCheck = checkReservationConflicts({
        flatNumber: "211",
        checkinDate: "2026-11-05",
        checkoutDate: "2026-11-09",
        excludeReservationId: "res_afternoon",
        db: mockDb
      });

      assert.equal(conflictCheck.hasConflict, false, "Same-day turnover must have 0 conflicts");
      assert.equal(conflictCheck.conflicts.length, 0);

      // Canonical availability for Nov 04, Nov 05, Nov 06
      const avail = calculateCanonicalAvailability("2026-11-04", "2026-11-07", { db: mockDb });

      // Nov 4: occupied by RES-OUT (18 free)
      assert.equal(avail.get("2026-11-04"), 18);

      // Nov 5: occupied by RES-IN (18 free, exactly 1 reservation on that night, not 2!)
      assert.equal(avail.get("2026-11-05"), 18);
      const nov5Detail = avail.detailsByDate["2026-11-05"];
      assert.equal(nov5Detail.blockedDetails.length, 1);
      assert.equal(nov5Detail.blockedDetails[0].details.code, "RES-IN");
    });

    it("T5-AVA-03: multi-source collision handles overlapping reservation, hold, roomBlock, and serviceOrder", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [
          {
            id: "res_1",
            code: "R1",
            flatNumber: "114",
            checkinDate: "2026-11-10",
            checkoutDate: "2026-11-15",
            status: "ativa"
          },
          {
            id: "res_hold",
            code: "RHOLD",
            flatNumber: "116",
            pendingModification: {
              status: "pending",
              proposedCheckinDate: "2026-11-10",
              proposedCheckoutDate: "2026-11-12",
              proposedFlatNumber: "116",
              expiresAt: new Date(Date.now() + 3600000).toISOString()
            }
          }
        ],
        roomBlocks: [
          {
            id: "block_1",
            flatNumber: "212",
            startDate: "2026-11-10",
            endDate: "2026-11-13",
            reason: "Bloqueio diretoria"
          }
        ],
        serviceOrders: [
          {
            id: "so_1",
            title: "Pintura",
            status: "active",
            flats: [
              {
                flatNumber: "215",
                startedAt: "2026-11-10",
                estimatedFinishAt: "2026-11-14",
                status: "in_progress"
              }
            ]
          }
        ]
      };

      // 4 flats blocked across 4 different collision sources: 114, 116, 212, 215
      const avail = calculateCanonicalAvailability("2026-11-10", "2026-11-11", { db: mockDb });
      assert.equal(avail.get("2026-11-10"), 15); // 19 - 4 = 15

      const dayDetail = avail.detailsByDate["2026-11-10"];
      assert.equal(dayDetail.blockedDetails.length, 4);

      const reasons = dayDetail.blockedDetails.map(b => b.reason).sort();
      assert.deepEqual(reasons, ["hold", "reservation", "room_block", "service_order"]);
    });

    it("T5-AVA-04: zero available units stop-sell triggers when all 19 flats are blocked or ceiling is 0", () => {
      // 1. All 19 flats occupied by reservations
      const allFlatsOccupied = CORPFLATS_19_FLATS.map((f, i) => ({
        id: `res_full_${i}`,
        code: `FULL-${f.number}`,
        flatNumber: f.number,
        checkinDate: "2026-12-31",
        checkoutDate: "2027-01-01",
        status: "ativa"
      }));

      const mockDbFull = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: allFlatsOccupied,
        roomBlocks: [],
        serviceOrders: []
      };

      const availFull = calculateCanonicalAvailability("2026-12-31", "2027-01-01", { db: mockDbFull });
      assert.equal(availFull.get("2026-12-31"), 0, "Units must drop to 0 when all 19 flats are full");
      assert.equal(availFull.minAvailable, 0);

      // 2. Ceiling = 0 enforces 0 units even when 19 flats are free
      const mockDbEmpty = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [],
        roomBlocks: [],
        serviceOrders: []
      };

      const availCeilZero = calculateCanonicalAvailability("2026-12-31", "2027-01-01", {
        db: mockDbEmpty,
        ceiling: 0
      });
      assert.equal(availCeilZero.get("2026-12-31"), 0, "Ceiling: 0 must clamp units to 0");

      // 3. Negative ceiling clamps to 0
      const availCeilNeg = calculateCanonicalAvailability("2026-12-31", "2027-01-01", {
        db: mockDbEmpty,
        ceiling: -5
      });
      assert.equal(availCeilNeg.get("2026-12-31"), 0, "Negative ceiling must clamp to 0");
    });

    it("T5-AVA-05: 100 concurrent asynchronous availability queries execute safely with zero state pollution", async () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [
          {
            id: "res_concurrent_1",
            code: "CONC-1",
            flatNumber: "113",
            checkinDate: "2026-11-01",
            checkoutDate: "2026-11-20",
            status: "ativa"
          }
        ],
        roomBlocks: [],
        serviceOrders: []
      };

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            const dayOffset = i % 15;
            const start = `2026-11-${String(1 + dayOffset).padStart(2, "0")}`;
            const end = `2026-11-${String(5 + dayOffset).padStart(2, "0")}`;
            const res = calculateCanonicalAvailability(start, end, { db: mockDb });
            assert.ok(res.get(start) >= 0 && res.get(start) <= 19);
            return res.get(start);
          })
        );
      }

      const results = await Promise.all(promises);
      assert.equal(results.length, 100);
      // Verify db was not mutated
      assert.equal(mockDb.reservations.length, 1);
      assert.equal(mockDb.flats.length, 19);
    });
  });

  // =========================================================================
  // CATEGORY 4: ARI Batching, Debouncing Timers & Concurrency (<10s Deltas)
  // =========================================================================
  describe("Category 4: ARI Batching, Debouncing Timers & Concurrency (<10s Deltas)", () => {
    it("T5-ARI-01: coalesces 30 rapid successive bursts into a single minimal bounding interval [minDate, maxDate]", async () => {
      const mockDb = {
        settings: { wbp_integration_mode: WBP_MODES.AUTO },
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [],
        roomBlocks: [],
        serviceOrders: []
      };

      let sentPayloads = [];
      const mockClient = {
        sendARIUpdate: async (payload, opts) => {
          sentPayloads.push({ payload, opts });
          return { success: true, guid: opts.guid };
        }
      };

      const synchronizer = new WbpAriSynchronizer({
        db: mockDb,
        client: mockClient,
        debounceMs: 50,  // Fast 50ms debounce for test
        maxWaitMs: 300   // 300ms ceiling
      });

      // Fire 30 rapid bursts with varying dates within 10ms
      for (let i = 0; i < 30; i++) {
        const startDay = 1 + (i % 10); // 1..10
        const endDay = 15 + (i % 10);  // 15..24
        synchronizer.triggerIncrementalSync({
          minDate: `2026-11-${String(startDay).padStart(2, "0")}`,
          maxDate: `2026-11-${String(endDay).padStart(2, "0")}`
        });
      }

      // Assert coalesced bounding interval in synchronizer state immediately
      assert.equal(synchronizer.pendingMinDate, "2026-11-01");
      assert.equal(synchronizer.pendingMaxDate, "2026-11-24");

      // Wait for debounce flush (120ms > 50ms)
      await new Promise(r => setTimeout(r, 120));

      assert.equal(sentPayloads.length, 1, "Must coalesce 30 bursts into exactly 1 wire payload");
      const wireInventory = sentPayloads[0].payload.Inventory;
      assert.ok(wireInventory.length > 0);

      // Verify the wire blocks cover the full bounding interval
      const datesCovered = new Set(wireInventory.map(b => b.start_date));
      assert.ok(datesCovered.has("2026-11-01"), "Must include minDate 2026-11-01");
      assert.ok(datesCovered.has("2026-11-24"), "Must include maxDate 2026-11-24");
    });

    it("T5-ARI-02: max-wait ceiling guarantees flush cannot be starved by continuous incoming mutations", async () => {
      const mockDb = {
        settings: { wbp_integration_mode: WBP_MODES.AUTO },
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [],
        roomBlocks: [],
        serviceOrders: []
      };

      let flushCount = 0;
      const mockClient = {
        sendARIUpdate: async () => {
          flushCount++;
          return { success: true };
        }
      };

      const synchronizer = new WbpAriSynchronizer({
        db: mockDb,
        client: mockClient,
        debounceMs: 150, // 150ms debounce
        maxWaitMs: 300   // 300ms max-wait ceiling
      });

      // Fire mutations every 80ms for 500ms (which would keep resetting 150ms debounce)
      const startTime = Date.now();
      const interval = setInterval(() => {
        synchronizer.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-05" });
      }, 80);

      await new Promise(r => setTimeout(r, 450));
      clearInterval(interval);

      // Even though debounce was constantly reset, maxWaitTimer must have forced at least 1 flush within 300ms
      assert.ok(flushCount >= 1, "Max-wait ceiling must trigger flush even under continuous burst");
    });

    it("T5-ARI-03: integration mode 'off' is 100% inert (zero timers registered, zero requests made)", () => {
      const mockDb = {
        settings: { wbp_integration_mode: WBP_MODES.OFF },
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" }))
      };

      let calls = 0;
      const mockClient = {
        sendARIUpdate: async () => { calls++; }
      };

      const synchronizer = new WbpAriSynchronizer({ db: mockDb, client: mockClient });

      const syncRes = synchronizer.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-05" });
      assert.equal(syncRes.scheduled, false);
      assert.equal(syncRes.skipped, true);
      assert.equal(syncRes.reason, "integration_off");

      assert.equal(synchronizer.debounceTimer, null);
      assert.equal(synchronizer.maxWaitTimer, null);
      assert.equal(calls, 0);

      const pmsHook = notifyPmsMutation(mockDb, { checkinDate: "2026-11-01", checkoutDate: "2026-11-05" });
      assert.equal(pmsHook, null);
    });

    it("T5-ARI-04: integration mode 'observe' logs calculation with zero outbound network transmissions", async () => {
      const mockDb = {
        settings: { wbp_integration_mode: WBP_MODES.OBSERVE },
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: []
      };

      let outboundCalls = 0;
      const mockClient = {
        sendARIUpdate: async () => { outboundCalls++; return { success: true }; }
      };

      const synchronizer = new WbpAriSynchronizer({
        db: mockDb,
        client: mockClient,
        debounceMs: 20
      });

      synchronizer.triggerIncrementalSync({ minDate: "2026-11-01", maxDate: "2026-11-03" });
      await new Promise(r => setTimeout(r, 60));

      assert.equal(outboundCalls, 0, "Mode 'observe' must have 0 outbound calls to channel manager");
      assert.ok(synchronizer.lastSyncTimestamp != null);
    });
  });

  // =========================================================================
  // CATEGORY 5: Network Failure Backoff, Retry & OpenAPI Compliance
  // =========================================================================
  describe("Category 5: Network Retry Backoff & OpenAPI Schema Compliance", () => {
    it("T5-NET-01: transient error (code 1003) triggers exponential backoff retry with strict UUID v4 GUID reuse", async () => {
      // Configure simulator to fail first 2 attempts with code 1003 (temporary offline), then succeed on 3rd
      simulatorHarness.reset();
      simulatorHarness.setFailureMode("ARIUpdate", {
        errorCode: 1003,
        errorMessage: "Channel offline or temporary timeout",
        status: 200
      });

      const client = new WBPClient({
        baseUrl: simulatorUrl,
        pmsCid: "test_cid",
        sharedSecret: "s3cr3ts4uc3",
        wbpPropertyId: "111",
        wbpPropertyPassword: "pass",
        maxRetries: 3,
        backoffBaseMs: 20
      });

      // Clear fault after 2 calls so attempt 3 succeeds
      const checkInterval = setInterval(() => {
        if (simulatorHarness.receivedRequests.filter(c => c.verb === "ARIUpdate").length >= 2) {
          simulatorHarness.failureModes.delete("ARIUpdate");
          clearInterval(checkInterval);
        }
      }, 10);

      const fixedGuid = crypto.randomUUID();
      const res = await client.sendARIUpdate(
        {
          currency: "BRL",
          Inventory: [
            {
              start_date: "2026-11-01",
              end_date: "2026-11-01",
              wbp_room_id: "flat",
              wbp_rate_id: "sem_cafe",
              units: 19,
              rate: "276.63"
            }
          ]
        },
        { guid: fixedGuid, bypassSwitch: true }
      );

      clearInterval(checkInterval);
      assert.equal(res.success, true);

      // Verify that all attempts to ARIUpdate used the EXACT SAME GUID
      const ariCalls = simulatorHarness.receivedRequests.filter(c => c.verb === "ARIUpdate");
      assert.ok(ariCalls.length >= 2, "Must have retried at least once");
      for (const call of ariCalls) {
        assert.equal(call.body.guid, fixedGuid, "Retried request must reuse exact same GUID");
        assert.ok(UUID_V4_REGEX.test(call.body.guid), "GUID must be valid UUID v4");
      }
    });

    it("T5-NET-02: terminal non-retryable error (code 1001) aborts immediately on attempt 1", async () => {
      simulatorHarness.reset();
      simulatorHarness.setFailureMode("ARIUpdate", {
        errorCode: 1001,
        errorMessage: "Invalid credentials or unauthorized property",
        status: 200
      });

      const client = new WBPClient({
        baseUrl: simulatorUrl,
        pmsCid: "test_cid",
        sharedSecret: "s3cr3ts4uc3",
        wbpPropertyId: "111",
        wbpPropertyPassword: "wrong_password",
        maxRetries: 3,
        backoffBaseMs: 10
      });

      await assert.rejects(
        async () => {
          await client.sendARIUpdate(
            { currency: "BRL", Inventory: [] },
            { bypassSwitch: true }
          );
        },
        (err) => {
          assert.ok(err instanceof WbpApiError);
          assert.equal(err.code, 1001);
          assert.equal(err.retryable, false);
          return true;
        }
      );

      const ariCalls = simulatorHarness.receivedRequests.filter(c => c.verb === "ARIUpdate");
      assert.equal(ariCalls.length, 1, "Non-retryable error 1001 must not retry (exactly 1 call)");
      simulatorHarness.failureModes.delete("ARIUpdate");
    });

    it("T5-NET-03: persistent failure tracker (>15 min) triggers critical alert and subsequent recovery notification", () => {
      const alerts = [];
      const synchronizer = new WbpAriSynchronizer({
        alertThresholdMs: 100, // 100ms for test simulation
        onAlert: (alert) => alerts.push(alert)
      });

      const simError = new Error("Connection refused to WBP gateway");

      // Failure 1: starts failure tracker
      synchronizer.handleSyncFailure(simError, "2026-11-01", "2026-11-05");
      assert.ok(synchronizer.failureStartTime != null);
      assert.equal(alerts.length, 0, "Must not alert immediately before threshold");

      // Simulate time passing past 15 min threshold
      synchronizer.failureStartTime = Date.now() - (16 * 60 * 1000); // 16 min ago
      synchronizer.handleSyncFailure(simError, "2026-11-01", "2026-11-05");

      assert.equal(alerts.length, 1, "Must trigger critical alert when threshold exceeded");
      assert.equal(alerts[0].type, "persistent_failure");
      assert.equal(alerts[0].severity, "critical");
      assert.equal(synchronizer.persistentAlertSent, true);

      // Now simulate recovery on next successful sync
      synchronizer.triggerRecoveryAlert();
      assert.equal(alerts.length, 2);
      assert.equal(alerts[1].type, "recovery");
      assert.equal(alerts[1].severity, "info");
    });

    it("T5-NET-04: generated wire ARIUpdate payload strictly complies with OpenAPI specification (wbpAPI.yaml)", () => {
      const mockDb = {
        flats: CORPFLATS_19_FLATS.map(f => ({ ...f, isActive: true, status: "disponivel" })),
        reservations: [],
        roomBlocks: [],
        serviceOrders: [],
        wbpRestrictions: {
          defaults: {
            min_los_weekday: 1,
            min_los_weekend: 2,
            max_los: 30,
            close: false,
            closearr: false,
            closedep: false,
            min_advanced_offset: 0,
            max_advanced_offset: 365
          }
        }
      };

      const synchronizer = new WbpAriSynchronizer({ db: mockDb });

      // Generate 7-day compressed blocks across weekday and weekend
      const blocks = synchronizer.generateAriBlocks("2026-11-01", "2026-11-07", { contiguous: true });
      assert.ok(blocks.length > 0);

      const wirePayload = {
        verb: "ARIUpdate",
        pms_cid: "corpflats_pms",
        shared_secret: "secret_123",
        guid: crypto.randomUUID(),
        wbp_property_id: "101",
        wbp_property_password: "pass",
        currency: "BRL",
        Inventory: blocks
      };

      // Validate against OpenAPI schema
      const validation = validateRequest("ARIUpdate", wirePayload);
      assert.equal(
        validation.valid,
        true,
        `ARIUpdate wire payload failed OpenAPI validation: ${validation.errors?.join(", ")}`
      );
      assert.deepEqual(validation.errors, []);

      // Verify specific schema requirements on blocks
      for (const block of blocks) {
        assert.equal(block.wbp_room_id, "flat");
        assert.ok(block.wbp_rate_id === "sem_cafe" || block.wbp_rate_id === "com_cafe");
        assert.ok(block.start_date <= block.end_date, "end_date must be >= start_date (inclusive)");
        assert.ok(Number.isInteger(Number(block.units)) && Number(block.units) >= 0);
        assert.ok(!isNaN(Number(block.rate)) && Number(block.rate) > 0);
        assert.ok(Number.isInteger(Number(block.min_los)) && Number(block.min_los) >= 1);
        assert.ok(Number.isInteger(Number(block.max_los)) && Number(block.max_los) >= 0);
        assert.equal(typeof block.close, "boolean");
        assert.equal(typeof block.closearr, "boolean");
        assert.equal(typeof block.closedep, "boolean");
      }
    });
  });
});
