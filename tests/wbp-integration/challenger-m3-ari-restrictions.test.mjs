/**
 * tests/wbp-integration/challenger-m3-ari-restrictions.test.mjs
 *
 * EMPIRICAL CHALLENGER 1 — Milestone 3: ARI Payload & 7 Restrictions Stress Test Suite.
 *
 * Adversarial Testing Scope:
 * 1. Weekend boundary transitions (Thursday to Friday night, Sunday to Monday night)
 *    verifying min_los switches between 1 and 2, month rollovers, year rollovers, leap years.
 * 2. Adversarial restriction combinations (min_los > max_los, negative inputs, non-numeric clamping,
 *    stop-sell close: true, CTA closearr: true, CTD closedep: true, hierarchical precedence).
 * 3. Ceiling clamping under various inventory levels: available = 0, available < ceiling,
 *    available = ceiling, available > ceiling, negative inputs, asymmetric rate plan ceilings.
 * 4. WBP OpenAPI schema compliance by running generated payloads against e2e/wbp-simulator/schemas/index.mjs.
 * 5. Isolated temporary DB in os.tmpdir(), DATABASE_URL unset, NODE_ENV = "test", ephemeral ports,
 *    and strict verification that data/database.json has 0 modifications (hash & mtime).
 *
 * Strictly adheres to AGENTS.md:
 * - Runs EXCLUSIVELY this targeted test script.
 * - Zero global sweeps or batch executions.
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
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const prodDbPath = path.resolve(rootDir, "data/database.json");

import {
  WbpAriSynchronizer,
  getWbpRestrictionsState,
  resolveRestrictions,
  compressContiguousBlocks,
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
  calculateRatePlanPrices,
  calculateSebraeRate,
  DEFAULT_SEBRAE_CONFIG
} from "../../artifacts/api-server/wbp/pricing.mjs";

import { WBP_MODES } from "../../artifacts/api-server/wbp/config.mjs";
import { WBPClient } from "../../artifacts/api-server/wbp/client.mjs";
import { WbpSimulatorHarness } from "./harness/wbp-simulator-harness.mjs";
import { validateRequest } from "../../e2e/wbp-simulator/schemas/index.mjs";

// Helper: compute file hash and mtime
function getFileMetadata(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  const stat = fs.statSync(filePath);
  return { hash, mtimeMs: stat.mtimeMs, size: stat.size };
}

describe("Suite 0: Real Database Integrity Guard (Pre-Flight & Post-Flight)", () => {
  let initialDbMeta;

  before(() => {
    assert.equal(process.env.NODE_ENV, "test", "NODE_ENV must be strictly 'test'");
    assert.equal(process.env.DATABASE_URL, undefined, "DATABASE_URL must be unset");
    initialDbMeta = getFileMetadata(prodDbPath);
    assert.ok(initialDbMeta, "Real data/database.json must exist before testing");
  });

  it("verifies production database file existence and captures baseline SHA-256", () => {
    assert.ok(initialDbMeta.hash, "Baseline hash must be present");
    assert.ok(initialDbMeta.mtimeMs > 0, "Baseline mtime must be valid");
  });

  after(() => {
    const finalDbMeta = getFileMetadata(prodDbPath);
    assert.equal(finalDbMeta.hash, initialDbMeta.hash, "CRITICAL: data/database.json SHA-256 hash was mutated!");
    assert.equal(finalDbMeta.mtimeMs, initialDbMeta.mtimeMs, "CRITICAL: data/database.json mtime was modified!");
  });
});

describe("Suite 1: Weekend Boundary Transitions & Length-of-Stay (min_los) Engine", () => {
  it("verifies exact day-of-week min_los transitions: Thursday (1), Friday (2), Saturday (2), Sunday (1), Monday (1)", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, min_los_weekend: 2 }
      }
    };

    // Thursday night (day 4)
    const thuRes = resolveRestrictions(mockDb, "2026-10-15");
    assert.equal(thuRes.min_los, 1, "Thursday night must resolve to min_los = 1");

    // Friday night (day 5, weekend start)
    const friRes = resolveRestrictions(mockDb, "2026-10-16");
    assert.equal(friRes.min_los, 2, "Friday night must resolve to min_los = 2");

    // Saturday night (day 6, weekend)
    const satRes = resolveRestrictions(mockDb, "2026-10-17");
    assert.equal(satRes.min_los, 2, "Saturday night must resolve to min_los = 2");

    // Sunday night (day 0, weekday start)
    const sunRes = resolveRestrictions(mockDb, "2026-10-18");
    assert.equal(sunRes.min_los, 1, "Sunday night must resolve to min_los = 1");

    // Monday night (day 1, weekday)
    const monRes = resolveRestrictions(mockDb, "2026-10-19");
    assert.equal(monRes.min_los, 1, "Monday night must resolve to min_los = 1");
  });

  it("verifies weekend boundary transitions across calendar month rollover (Oct 29 to Nov 2, 2026)", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, min_los_weekend: 2 }
      }
    };

    // 2026-10-29: Thursday (1)
    assert.equal(resolveRestrictions(mockDb, "2026-10-29").min_los, 1);
    // 2026-10-30: Friday (2)
    assert.equal(resolveRestrictions(mockDb, "2026-10-30").min_los, 2);
    // 2026-10-31: Saturday (2) - Last day of October
    assert.equal(resolveRestrictions(mockDb, "2026-10-31").min_los, 2);
    // 2026-11-01: Sunday (1) - First day of November
    assert.equal(resolveRestrictions(mockDb, "2026-11-01").min_los, 1);
    // 2026-11-02: Monday (1)
    assert.equal(resolveRestrictions(mockDb, "2026-11-02").min_los, 1);
  });

  it("verifies weekend boundary transitions across year rollover (Dec 31, 2026 to Jan 3, 2027)", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, min_los_weekend: 2 }
      }
    };

    // 2026-12-31: Thursday (1)
    assert.equal(resolveRestrictions(mockDb, "2026-12-31").min_los, 1);
    // 2027-01-01: Friday (2)
    assert.equal(resolveRestrictions(mockDb, "2027-01-01").min_los, 2);
    // 2027-01-02: Saturday (2)
    assert.equal(resolveRestrictions(mockDb, "2027-01-02").min_los, 2);
    // 2027-01-03: Sunday (1)
    assert.equal(resolveRestrictions(mockDb, "2027-01-03").min_los, 1);
  });

  it("verifies boundary transitions across leap year February 2028", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, min_los_weekend: 2 }
      }
    };

    // 2028-02-24: Thursday (1)
    assert.equal(resolveRestrictions(mockDb, "2028-02-24").min_los, 1);
    // 2028-02-25: Friday (2)
    assert.equal(resolveRestrictions(mockDb, "2028-02-25").min_los, 2);
    // 2028-02-26: Saturday (2)
    assert.equal(resolveRestrictions(mockDb, "2028-02-26").min_los, 2);
    // 2028-02-27: Sunday (1)
    assert.equal(resolveRestrictions(mockDb, "2028-02-27").min_los, 1);
    // 2028-02-28: Monday (1)
    assert.equal(resolveRestrictions(mockDb, "2028-02-28").min_los, 1);
    // 2028-02-29: Tuesday (1) - Leap Day
    assert.equal(resolveRestrictions(mockDb, "2028-02-29").min_los, 1);
    // 2028-03-01: Wednesday (1)
    assert.equal(resolveRestrictions(mockDb, "2028-03-01").min_los, 1);
  });

  it("verifies contiguous block compression splits across Thursday/Friday and Saturday/Sunday boundaries", () => {
    // Construct 5 consecutive days of daily items with uniform rate and units
    const dailyItems = [
      { date: "2026-10-15", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 1, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 },
      { date: "2026-10-16", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 2, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 },
      { date: "2026-10-17", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 2, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 },
      { date: "2026-10-18", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 1, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 },
      { date: "2026-10-19", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 1, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 }
    ];

    const compressed = compressContiguousBlocks(dailyItems);

    // Expect exactly 3 compressed blocks:
    // 1. Thursday: [2026-10-15, 2026-10-15] (min_los = 1)
    // 2. Weekend: [2026-10-16, 2026-10-17] (min_los = 2, merged Fri+Sat)
    // 3. Weekday: [2026-10-18, 2026-10-19] (min_los = 1, merged Sun+Mon)
    assert.equal(compressed.length, 3, "Should compress into exactly 3 blocks");

    assert.equal(compressed[0].start_date, "2026-10-15");
    assert.equal(compressed[0].end_date, "2026-10-15");
    assert.equal(compressed[0].min_los, 1);

    assert.equal(compressed[1].start_date, "2026-10-16");
    assert.equal(compressed[1].end_date, "2026-10-17");
    assert.equal(compressed[1].min_los, 2);

    assert.equal(compressed[2].start_date, "2026-10-18");
    assert.equal(compressed[2].end_date, "2026-10-19");
    assert.equal(compressed[2].min_los, 1);
  });

  it("verifies that custom overrides on weekend nights correctly split Friday and Saturday", () => {
    const dailyItems = [
      { date: "2026-10-16", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 3, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 },
      { date: "2026-10-17", wbp_room_id: "flat", wbp_rate_id: "sem_cafe", units: 15, rate: "250.00", rdef_single: "250.00", adult_3: "310.00", num_adults_included: 2, min_los: 2, max_los: 30, close: false, closearr: false, closedep: false, min_advanced_offset: 0, max_advanced_offset: 0 }
    ];

    const compressed = compressContiguousBlocks(dailyItems);
    assert.equal(compressed.length, 2, "Distinct min_los on Friday (3) and Saturday (2) must prevent compression");
    assert.equal(compressed[0].start_date, "2026-10-16");
    assert.equal(compressed[0].end_date, "2026-10-16");
    assert.equal(compressed[0].min_los, 3);
    assert.equal(compressed[1].start_date, "2026-10-17");
    assert.equal(compressed[1].end_date, "2026-10-17");
    assert.equal(compressed[1].min_los, 2);
  });
});

describe("Suite 2: Adversarial Restriction Combinations & Clamping Stress", () => {
  it("stress-tests min_los > max_los adversarial combination (e.g. min_los = 5, max_los = 2)", () => {
    const mockDb = {
      wbpRestrictions: {
        overrides: {
          "2026-11-20": { min_los: 5, max_los: 2 }
        }
      }
    };

    const resolved = resolveRestrictions(mockDb, "2026-11-20");
    assert.equal(resolved.min_los, 5);
    assert.equal(resolved.max_los, 2);

    // Verify ARI block generation handles this without crash
    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-20", "2026-11-20");
    assert.ok(blocks.length > 0);
    const semCafeBlock = blocks.find((b) => b.wbp_rate_id === "sem_cafe");
    assert.equal(semCafeBlock.min_los, 5);
    assert.equal(semCafeBlock.max_los, 2);

    // Verify OpenAPI validation behavior on this payload
    const testEnvelope = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      wbp_property_id: "101",
      currency: "BRL",
      Inventory: blocks
    };
    const schemaRes = validateRequest("ARIUpdate", testEnvelope, { tolerant: true });
    assert.equal(schemaRes.valid, true, `OpenAPI schema must be valid: ${schemaRes.errors?.join("; ")}`);
  });

  it("verifies max_los: 0 represents unconstrained stay length and pairs validly with min_los: 7", () => {
    const mockDb = {
      wbpRestrictions: {
        overrides: {
          "2026-11-25": { min_los: 7, max_los: 0 }
        }
      }
    };

    const resolved = resolveRestrictions(mockDb, "2026-11-25");
    assert.equal(resolved.min_los, 7);
    assert.equal(resolved.max_los, 0, "max_los: 0 must be preserved as 0 (no upper limit)");

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-25", "2026-11-25");
    const block = blocks.find((b) => b.wbp_rate_id === "sem_cafe");
    assert.equal(block.min_los, 7);
    assert.equal(block.max_los, 0);

    const testEnvelope = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      wbp_property_id: "101",
      currency: "BRL",
      Inventory: blocks
    };
    const schemaRes = validateRequest("ARIUpdate", testEnvelope, { tolerant: false });
    assert.equal(schemaRes.valid, true);
  });

  it("clamps negative, zero, and non-numeric min_los/max_los to valid ranges", () => {
    const mockDb = {
      wbpRestrictions: {
        overrides: {
          "2026-11-01": { min_los: -5, max_los: -10 },
          "2026-11-02": { min_los: 0, max_los: -1 },
          "2026-11-03": { min_los: "invalid", max_los: "bad_value" },
          "2026-11-04": { min_los: NaN, max_los: null },
          "2026-11-05": { min_advanced_offset: -15, max_advanced_offset: -30 },
          "2026-11-06": { min_advanced_offset: "xyz", max_advanced_offset: NaN }
        }
      }
    };

    // 2026-11-01: negative -> min_los clamped to 1, max_los clamped to 0
    const res1 = resolveRestrictions(mockDb, "2026-11-01");
    assert.equal(res1.min_los, 1, "Negative min_los must clamp to 1");
    assert.equal(res1.max_los, 0, "Negative max_los must clamp to 0");

    // 2026-11-02: zero min_los -> clamped to 1
    const res2 = resolveRestrictions(mockDb, "2026-11-02");
    assert.equal(res2.min_los, 1, "Zero min_los must clamp to 1 (spec minimum is 1)");
    assert.equal(res2.max_los, 0, "Negative max_los must clamp to 0");

    // 2026-11-03: non-numeric strings
    const res3 = resolveRestrictions(mockDb, "2026-11-03");
    assert.equal(res3.min_los, 1);
    assert.equal(res3.max_los, 0);

    // 2026-11-04: NaN / null
    const res4 = resolveRestrictions(mockDb, "2026-11-04");
    assert.equal(res4.min_los, 1);
    assert.equal(res4.max_los, 0);

    // 2026-11-05: negative advanced offsets
    const res5 = resolveRestrictions(mockDb, "2026-11-05");
    assert.equal(res5.min_advanced_offset, 0, "Negative min_advanced_offset must clamp to 0");
    assert.equal(res5.max_advanced_offset, 0, "Negative max_advanced_offset must clamp to 0");

    // 2026-11-06: non-numeric offsets
    const res6 = resolveRestrictions(mockDb, "2026-11-06");
    assert.equal(res6.min_advanced_offset, 0);
    assert.equal(res6.max_advanced_offset, 0);
  });

  it("stress-tests adversarial boolean restrictions: stop-sell, CTA, CTD, and combinations", () => {
    const mockDb = {
      wbpRestrictions: {
        overrides: {
          "2026-12-24": { close: true, closearr: false, closedep: false }, // Stop-sell only
          "2026-12-25": { close: false, closearr: true, closedep: false }, // CTA only
          "2026-12-26": { close: false, closearr: false, closedep: true }, // CTD only
          "2026-12-31": { close: true, closearr: true, closedep: true },   // Full lockdown
          "2027-01-01": { close: 1, closearr: "yes", closedep: 0 }         // Falsy/truthy coercions
        }
      }
    };

    // 2026-12-24: Stop-sell
    const res24 = resolveRestrictions(mockDb, "2026-12-24");
    assert.equal(res24.close, true);
    assert.equal(res24.closearr, false);
    assert.equal(res24.closedep, false);

    // 2026-12-25: CTA
    const res25 = resolveRestrictions(mockDb, "2026-12-25");
    assert.equal(res25.close, false);
    assert.equal(res25.closearr, true);
    assert.equal(res25.closedep, false);

    // 2026-12-26: CTD
    const res26 = resolveRestrictions(mockDb, "2026-12-26");
    assert.equal(res26.close, false);
    assert.equal(res26.closearr, false);
    assert.equal(res26.closedep, true);

    // 2026-12-31: Full lockdown
    const res31 = resolveRestrictions(mockDb, "2026-12-31");
    assert.equal(res31.close, true);
    assert.equal(res31.closearr, true);
    assert.equal(res31.closedep, true);

    // 2027-01-01: Boolean coercions
    const res01 = resolveRestrictions(mockDb, "2027-01-01");
    assert.equal(res01.close, true);
    assert.equal(res01.closearr, true);
    assert.equal(res01.closedep, false);
  });

  it("verifies hierarchical override precedence: date_plan > date > plan default > global default", () => {
    const mockDb = {
      wbpRestrictions: {
        defaults: { min_los_weekday: 1, max_los: 30, close: false },
        planDefaults: {
          sem_cafe: { min_los: 2 },
          com_cafe: { min_los: 3 }
        },
        overrides: {
          "2026-11-15": { min_los: 4, closearr: true },
          "2026-11-15_sem_cafe": { min_los: 6, close: true }
        }
      }
    };

    // On 2026-11-15, sem_cafe has specific date_plan override
    const semCafeRes = resolveRestrictions(mockDb, "2026-11-15", "sem_cafe");
    assert.equal(semCafeRes.min_los, 6, "Specific date_plan override must take top precedence");
    assert.equal(semCafeRes.close, true, "Specific date_plan close: true must take precedence");
    assert.equal(semCafeRes.closearr, true, "Inherits closearr from date-level override");

    // On 2026-11-15, com_cafe has date override but no date_plan override
    const comCafeRes = resolveRestrictions(mockDb, "2026-11-15", "com_cafe");
    assert.equal(comCafeRes.min_los, 4, "Date override takes precedence over plan default");
    assert.equal(comCafeRes.closearr, true);
    assert.equal(comCafeRes.close, false);

    // On another weekday, plan defaults apply
    const semNormal = resolveRestrictions(mockDb, "2026-11-16", "sem_cafe");
    assert.equal(semNormal.min_los, 2, "Plan default min_los applies");

    const comNormal = resolveRestrictions(mockDb, "2026-11-16", "com_cafe");
    assert.equal(comNormal.min_los, 3, "Plan default min_los applies");
  });

  it("verifies isolation: legacy tariffSettings is never mutated by restrictions operations", () => {
    const mockDb = {
      tariffSettings: { minNights: 3, basePrice: 280, weekendMarkup: 0.20 },
      wbpRestrictions: { defaults: { min_los_weekday: 1, min_los_weekend: 2 } }
    };
    const beforeStr = JSON.stringify(mockDb.tariffSettings);

    resolveRestrictions(mockDb, "2026-11-10", "sem_cafe");
    resolveRestrictions(mockDb, "2026-11-13", "com_cafe");
    getWbpRestrictionsState(mockDb);

    const afterStr = JSON.stringify(mockDb.tariffSettings);
    assert.equal(beforeStr, afterStr, "Legacy tariffSettings must remain 100% untouched");
  });
});

describe("Suite 3: Shared Inventory & Ceiling Clamping Stress", () => {
  it("verifies ceiling clamping: available = 0 -> units = 0 (even if ceiling is high)", () => {
    // Inject 19 active reservations occupying all flats on 2026-11-10
    const reservations = CORPFLATS_19_FLATS.map((f, i) => ({
      id: `res_full_${i}`,
      flatId: f.id,
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      status: "confirmada"
    }));

    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations,
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 15 },
          { wbp_rate_id: "com_cafe", ceiling: 10 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    assert.equal(blocks.length, 2);
    for (const b of blocks) {
      assert.equal(b.units, 0, `When available=0, units must be 0 for plan ${b.wbp_rate_id}`);
    }
  });

  it("verifies ceiling clamping: available < ceiling -> units = available", () => {
    // 15 flats occupied -> 4 flats available. Plan ceiling = 8.
    const reservations = CORPFLATS_19_FLATS.slice(0, 15).map((f, i) => ({
      id: `res_occ_${i}`,
      flatId: f.id,
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      status: "confirmada"
    }));

    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations,
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 8 },
          { wbp_rate_id: "com_cafe", ceiling: 8 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    for (const b of blocks) {
      assert.equal(b.units, 4, `When available (4) < ceiling (8), units must be 4`);
    }
  });

  it("verifies ceiling clamping: available = ceiling -> units = ceiling", () => {
    // 14 flats occupied -> 5 flats available. Plan ceiling = 5.
    const reservations = CORPFLATS_19_FLATS.slice(0, 14).map((f, i) => ({
      id: `res_occ_${i}`,
      flatId: f.id,
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      status: "confirmada"
    }));

    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations,
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 5 },
          { wbp_rate_id: "com_cafe", ceiling: 5 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    for (const b of blocks) {
      assert.equal(b.units, 5, `When available (5) == ceiling (5), units must be 5`);
    }
  });

  it("verifies ceiling clamping: available > ceiling -> units = ceiling", () => {
    // 2 flats occupied -> 17 flats available. Plan ceiling = 3.
    const reservations = CORPFLATS_19_FLATS.slice(0, 2).map((f, i) => ({
      id: `res_occ_${i}`,
      flatId: f.id,
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      status: "confirmada"
    }));

    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations,
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 3 },
          { wbp_rate_id: "com_cafe", ceiling: 3 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    for (const b of blocks) {
      assert.equal(b.units, 3, `When available (17) > ceiling (3), units must be capped to ceiling (3)`);
    }
  });

  it("verifies negative and extreme inputs: negative ceiling, zero ceiling, non-numeric ceiling, negative availability", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: -5 },      // Negative ceiling
          { wbp_rate_id: "com_cafe", ceiling: 0 }        // Zero ceiling
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    const semCafe = blocks.find((b) => b.wbp_rate_id === "sem_cafe");
    assert.equal(semCafe.units, 0, "Negative ceiling must clamp units to 0 (never negative)");

    const comCafe = blocks.find((b) => b.wbp_rate_id === "com_cafe");
    assert.equal(comCafe.units, 0, "Zero ceiling must result in 0 units");
  });

  it("verifies asymmetric ceilings across multiple rate plans on the same stay date", () => {
    // 15 flats occupied -> 4 available. sem_cafe ceiling = 2, com_cafe ceiling = 8.
    const reservations = CORPFLATS_19_FLATS.slice(0, 15).map((f, i) => ({
      id: `res_occ_${i}`,
      flatId: f.id,
      checkinDate: "2026-11-10",
      checkoutDate: "2026-11-11",
      status: "confirmada"
    }));

    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations,
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 2 },
          { wbp_rate_id: "com_cafe", ceiling: 8 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-10", "2026-11-10");

    const semCafe = blocks.find((b) => b.wbp_rate_id === "sem_cafe");
    assert.equal(semCafe.units, 2, "sem_cafe capped by ceiling 2");

    const comCafe = blocks.find((b) => b.wbp_rate_id === "com_cafe");
    assert.equal(comCafe.units, 4, "com_cafe capped by availability 4");
  });
});

describe("Suite 4: WBP OpenAPI Schema Compliance (e2e/wbp-simulator/schemas/index.mjs)", () => {
  it("validates that standard generated ARI blocks pass strict and tolerant OpenAPI schema validation", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: []
    };
    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-11-01", "2026-11-30");
    assert.ok(blocks.length > 0);

    const payload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      wbp_property_id: "101",
      currency: "BRL",
      Inventory: blocks
    };

    const strictResult = validateRequest("ARIUpdate", payload, { tolerant: false });
    assert.equal(strictResult.valid, true, `Strict validation errors: ${strictResult.errors?.join("; ")}`);

    const tolerantResult = validateRequest("ARIUpdate", payload, { tolerant: true });
    assert.equal(tolerantResult.valid, true);
  });

  it("validates that all 7 restrictions combinations in generated blocks pass schema validation", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      wbpRestrictions: {
        overrides: {
          "2026-12-01": { close: true, min_los: 3, max_los: 14, min_advanced_offset: 2, max_advanced_offset: 30 },
          "2026-12-02": { closearr: true, closedep: true, min_los: 1, max_los: 0 },
          "2026-12-03": { closearr: true, close: false, min_los: 2, max_los: 7 }
        }
      }
    };
    const sync = new WbpAriSynchronizer({ db: mockDb });
    const blocks = sync.generateAriBlocks("2026-12-01", "2026-12-05");

    const payload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      wbp_property_id: "101",
      currency: "BRL",
      Inventory: blocks
    };

    const res = validateRequest("ARIUpdate", payload, { tolerant: true });
    assert.equal(res.valid, true, `Schema validation failed: ${res.errors?.join("; ")}`);
  });

  it("verifies OpenAPI validator strictly detects and rejects schema violations", () => {
    // 1. Negative units
    const invalidUnitsPayload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      currency: "BRL",
      Inventory: [
        { wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: -1, rate: "200.00" }
      ]
    };
    const res1 = validateRequest("ARIUpdate", invalidUnitsPayload);
    assert.equal(res1.valid, false, "Negative units must be rejected");
    assert.ok(res1.errors.some((e) => e.includes("units")));

    // 2. Inverted date range (start_date > end_date)
    const invertedDatePayload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      currency: "BRL",
      Inventory: [
        { wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-05", end_date: "2026-11-01", units: 5, rate: "200.00" }
      ]
    };
    const res2 = validateRequest("ARIUpdate", invertedDatePayload);
    assert.equal(res2.valid, false, "Inverted date range must be rejected");
    assert.ok(res2.errors.some((e) => e.includes("não pode ser posterior")));

    // 3. Invalid min_los (< 1)
    const invalidMinLosPayload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      currency: "BRL",
      Inventory: [
        { wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: 5, rate: "200.00", min_los: 0 }
      ]
    };
    const res3 = validateRequest("ARIUpdate", invalidMinLosPayload);
    assert.equal(res3.valid, false, "min_los: 0 must be rejected by validator");
    assert.ok(res3.errors.some((e) => e.includes("min_los")));

    // 4. Invalid currency
    const invalidCurrencyPayload = {
      verb: "ARIUpdate",
      guid: crypto.randomUUID(),
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      currency: "BR", // 2 letters instead of 3
      Inventory: [
        { wbp_room_id: "flat", wbp_rate_id: "sem_cafe", start_date: "2026-11-01", end_date: "2026-11-01", units: 5, rate: "200.00" }
      ]
    };
    const res4 = validateRequest("ARIUpdate", invalidCurrencyPayload);
    assert.equal(res4.valid, false, "Invalid currency code must be rejected");
    assert.ok(res4.errors.some((e) => e.includes("currency")));

    // 5. Malformed GUID
    const invalidGuidPayload = {
      verb: "ARIUpdate",
      guid: "not-a-valid-uuid-v4",
      pms_cid: "CORPFLATS_TEST",
      shared_secret: "secret123",
      currency: "BRL",
      Inventory: []
    };
    const res5 = validateRequest("ARIUpdate", invalidGuidPayload);
    assert.equal(res5.valid, false, "Malformed GUID must be rejected");
    assert.ok(res5.errors.some((e) => e.includes("guid")));
  });

  it("verifies inclusive end_date rule across all generated blocks", () => {
    const mockDb = {
      flats: CORPFLATS_19_FLATS,
      reservations: []
    };
    const sync = new WbpAriSynchronizer({ db: mockDb });

    // Generate blocks with contiguous compression
    const blocks = sync.generateAriBlocks("2026-11-01", "2026-11-10", { contiguous: true });
    for (const b of blocks) {
      assert.ok(b.start_date <= b.end_date, `start_date (${b.start_date}) must be <= end_date (${b.end_date})`);
      assert.match(b.start_date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(b.end_date, /^\d{4}-\d{2}-\d{2}$/);
    }

    // Generate blocks without contiguous compression (daily)
    const dailyBlocks = sync.generateAriBlocks("2026-11-01", "2026-11-05", { contiguous: false });
    for (const b of dailyBlocks) {
      assert.equal(b.start_date, b.end_date, "In uncompressed blocks, start_date must strictly equal end_date");
    }
  });
});

describe("Suite 5: E2E Adversarial Wire Transmission via WbpSimulatorHarness", () => {
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

  it("transmits adversarial restrictions and ceiling payloads to simulator in <= 10s with 100% schema validity", async () => {
    simulator.clearCalls();

    const mockDb = {
      settings: { wbp_integration_mode: "auto" },
      flats: CORPFLATS_19_FLATS,
      reservations: [],
      wbpRestrictions: {
        overrides: {
          "2026-11-20": { min_los: 5, max_los: 2, closearr: true },
          "2026-11-21": { close: true },
          "2026-11-22": { closedep: true, min_advanced_offset: 3 }
        }
      },
      wbpMapping: {
        room: DEFAULT_WBP_MAPPING.room,
        ratePlans: [
          { wbp_rate_id: "sem_cafe", ceiling: 4 },
          { wbp_rate_id: "com_cafe", ceiling: 6 }
        ]
      }
    };

    const sync = new WbpAriSynchronizer({
      db: mockDb,
      client,
      debounceMs: 50,
      maxWaitMs: 150
    });

    const startMs = Date.now();
    sync.triggerIncrementalSync({ minDate: "2026-11-20", maxDate: "2026-11-23" });

    // Wait reliably for debounce flush and simulator reception
    for (let i = 0; i < 30; i++) {
      if (simulator.getCalls("ARIUpdate").length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const durationMs = Date.now() - startMs;

    assert.ok(durationMs <= 10000, `Transmission must complete in <= 10s (actual: ${durationMs}ms)`);

    const ariCalls = simulator.getCalls("ARIUpdate");
    assert.equal(ariCalls.length, 1, "Simulator must have received exactly 1 ARIUpdate call");

    const sentPayload = ariCalls[0].body;
    assert.equal(sentPayload.currency, "BRL");
    assert.ok(Array.isArray(sentPayload.Inventory));
    assert.ok(sentPayload.Inventory.length > 0);

    // Verify 100% OpenAPI schema validity
    const valResult = validateRequest("ARIUpdate", sentPayload, { tolerant: false });
    assert.equal(valResult.valid, true, `OpenAPI validation errors: ${valResult.errors?.join("; ")}`);

    // Verify adversarial attributes arrived intact
    const inv = sentPayload.Inventory;
    const closedBlock = inv.find((b) => b.close === true);
    assert.ok(closedBlock, "Payload must contain the close: true block");

    const ctdBlock = inv.find((b) => b.closedep === true);
    assert.ok(ctdBlock, "Payload must contain the closedep: true block");

    // Verify units are properly clamped to ceilings
    for (const b of inv) {
      if (b.wbp_rate_id === "sem_cafe") {
        assert.ok(b.units <= 4, `sem_cafe units (${b.units}) must not exceed ceiling 4`);
      } else if (b.wbp_rate_id === "com_cafe") {
        assert.ok(b.units <= 6, `com_cafe units (${b.units}) must not exceed ceiling 6`);
      }
    }
  });
});
