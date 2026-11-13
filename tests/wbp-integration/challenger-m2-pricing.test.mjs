/**
 * tests/wbp-integration/challenger-m2-pricing.test.mjs
 *
 * Challenger 2 Test Suite: SEBRAE Pricing Engine Math & Safety Locks Stress Testing.
 *
 * Scope of Adversarial Verification:
 * 1. Floor Lock Boundary Stress:
 *    - Strict boundary rates: floor - 0.01, floor, and floor + 0.01.
 *    - Higher manual floor overrides (manualFloor > tarifaMinima).
 *    - Adversarial edge inputs: 0.00, negative rates, NaN/null, and floating-point noise.
 * 2. Variation Lock Boundary Stress:
 *    - Fluctuations exactly at 29.9%, 30.0%, and 30.1% (both upward and downward).
 *    - Verification of rate retention behavior for swings strictly exceeding 30.0%.
 *    - In-depth vulnerability diagnostic on rounding/truncation flaws in deltaPct.
 * 3. Staged Publication Workflow & Draft State Preservation:
 *    - Verification that settings updates switch status to "staged" without prematurely modifying lastPublishedRates.
 *    - Verification that unconfirmed variation-locked rates and below-floor rates are excluded during publish.
 *    - Verification that draft state in stagedModifications is preserved across publication attempts until explicit confirmation.
 *    - Verification of variation confirmation, discard, and discardAll lifecycles.
 * 4. Breakfast Surcharge & Occupancy Scaling (Edge Occupancies 1, 2, 3, 4):
 *    - 1 guest: single occupancy delta equals exactly 1x breakfast surcharge.
 *    - 2 guests: double occupancy delta equals exactly 2x breakfast surcharge.
 *    - 3 guests: triple occupancy delta equals exactly 3x breakfast surcharge + extra bed fee.
 *    - 4 guests: edge analysis of quadruple occupancy support in rate plans.
 *
 * Adheres strictly to AGENTS.md:
 * - Isolated, targeted execution.
 * - No global sweeps.
 * - DATABASE_URL deleted; no touches to production database.json.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Safety: eliminate DATABASE_URL and enforce test environment
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";

import {
  calculateSebraeRate,
  calculateRatePlanPrices,
  applyPricingLocks,
  WbpPricingManager,
  DEFAULT_SEBRAE_CONFIG,
  round2
} from "../../artifacts/api-server/wbp/pricing.mjs";

describe("Challenger 2: Floor Lock Boundary & Adversarial Rate Stress", () => {
  const TARIFA_MINIMA = 276.63;

  it("Floor Lock: blocks rate at exactly floor - 0.01 (R$ 276.62)", () => {
    const rateBelow = round2(TARIFA_MINIMA - 0.01);
    assert.equal(rateBelow, 276.62);

    const result = applyPricingLocks({
      candidateRate: rateBelow,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: TARIFA_MINIMA
    });

    assert.equal(result.approved, false, "Rate at floor - 0.01 must NOT be approved");
    assert.equal(result.lockedReason, "FLOOR_LOCK", "Reason must be FLOOR_LOCK");
    assert.equal(result.finalRate, null, "Final rate must be null when locked");
    assert.equal(result.floor, 276.63);
    assert.ok(result.message.includes("abaixo do piso"));
  });

  it("Floor Lock: approves rate at exactly floor (R$ 276.63)", () => {
    const rateExact = TARIFA_MINIMA;

    const result = applyPricingLocks({
      candidateRate: rateExact,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: TARIFA_MINIMA
    });

    assert.equal(result.approved, true, "Rate at exact floor must be approved");
    assert.equal(result.lockedReason, null);
    assert.equal(result.finalRate, 276.63);
    assert.equal(result.floor, 276.63);
  });

  it("Floor Lock: approves rate at exactly floor + 0.01 (R$ 276.64)", () => {
    const rateAbove = round2(TARIFA_MINIMA + 0.01);
    assert.equal(rateAbove, 276.64);

    const result = applyPricingLocks({
      candidateRate: rateAbove,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: TARIFA_MINIMA
    });

    assert.equal(result.approved, true, "Rate at floor + 0.01 must be approved");
    assert.equal(result.lockedReason, null);
    assert.equal(result.finalRate, 276.64);
    assert.equal(result.floor, 276.63);
  });

  it("Floor Lock: enforces higher manualFloor override (R$ 350.00 > R$ 276.63)", () => {
    const higherFloor = 350.00;

    // 349.99 (manualFloor - 0.01) -> must be blocked
    const resBelow = applyPricingLocks({
      candidateRate: 349.99,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: higherFloor
    });
    assert.equal(resBelow.approved, false);
    assert.equal(resBelow.lockedReason, "FLOOR_LOCK");
    assert.equal(resBelow.floor, 350.00);

    // 350.00 (exact manualFloor) -> must be approved
    const resExact = applyPricingLocks({
      candidateRate: 350.00,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: higherFloor
    });
    assert.equal(resExact.approved, true);
    assert.equal(resExact.finalRate, 350.00);

    // 350.01 (manualFloor + 0.01) -> must be approved
    const resAbove = applyPricingLocks({
      candidateRate: 350.01,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: higherFloor
    });
    assert.equal(resAbove.approved, true);
    assert.equal(resAbove.finalRate, 350.01);
  });

  it("Floor Lock: blocks 0.00, negative rates, and null/empty inputs", () => {
    // Zero
    const resZero = applyPricingLocks({ candidateRate: 0, tarifaMinima: TARIFA_MINIMA });
    assert.equal(resZero.approved, false, "Zero rate must be blocked by floor lock");
    assert.equal(resZero.lockedReason, "FLOOR_LOCK");

    // Negative
    const resNeg = applyPricingLocks({ candidateRate: -150.00, tarifaMinima: TARIFA_MINIMA });
    assert.equal(resNeg.approved, false, "Negative rate must be blocked by floor lock");
    assert.equal(resNeg.lockedReason, "FLOOR_LOCK");

    // Null
    const resNull = applyPricingLocks({ candidateRate: null, tarifaMinima: TARIFA_MINIMA });
    assert.equal(resNull.approved, false, "Null rate must be blocked by floor lock");
    assert.equal(resNull.lockedReason, "FLOOR_LOCK");

    // Floating-point representation noise: 276.62999999999999 rounds to 276.63
    const resFloat = applyPricingLocks({
      candidateRate: 276.62999999999999,
      tarifaMinima: TARIFA_MINIMA,
      manualFloor: TARIFA_MINIMA
    });
    assert.equal(resFloat.approved, true);
    assert.equal(resFloat.finalRate, 276.63);
  });

  it("Floor Lock: adversarial non-numeric string/NaN rate MUST NOT be approved", () => {
    // When candidateRate is non-numeric, Number('invalid') is NaN.
    // Safety check: NaN < floor is false in JS, which causes applyPricingLocks to approve NaN!
    const resNaN = applyPricingLocks({ candidateRate: "invalid", tarifaMinima: TARIFA_MINIMA });
    assert.equal(resNaN.approved, false, "Non-numeric string / NaN candidate rate MUST NOT be approved");
    assert.equal(resNaN.lockedReason, "FLOOR_LOCK", "NaN candidate rate must be rejected with FLOOR_LOCK");
  });
});

describe("Challenger 2: Variation Lock Boundary Stress (29.9%, 30.0%, 30.1%)", () => {
  const BASELINE_RATE = 1000.00; // Baseline for clear penny-for-penny percentage math

  it("Variation Lock (Upward): +29.9% fluctuation (R$ 1299.00) is within 30% limit and approved", () => {
    const rate299 = 1299.00; // exactly (1299 - 1000) / 1000 = +29.9%
    const res = applyPricingLocks({
      candidateRate: rate299,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00,
      variationLimitPct: 0.30
    });

    assert.equal(res.approved, true, "+29.9% variation must be approved");
    assert.equal(res.lockedReason, null);
    assert.equal(res.finalRate, 1299.00);
  });

  it("Variation Lock (Upward): +30.0% fluctuation (R$ 1300.00) is at exact limit boundary and approved", () => {
    const rate300 = 1300.00; // exactly (1300 - 1000) / 1000 = +30.0%
    const res = applyPricingLocks({
      candidateRate: rate300,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00,
      variationLimitPct: 0.30
    });

    assert.equal(res.approved, true, "+30.0% boundary variation must be approved");
    assert.equal(res.lockedReason, null);
    assert.equal(res.finalRate, 1300.00);
  });

  it("Variation Lock (Upward): +30.1% fluctuation (R$ 1301.00) strictly exceeds 30.0% and MUST BE RETAINED", () => {
    const rate301 = 1301.00; // exactly (1301 - 1000) / 1000 = +30.1%
    const res = applyPricingLocks({
      candidateRate: rate301,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00,
      variationLimitPct: 0.30
    });

    // Adversarial verification: Requirement states "variação acima de 30% fica retida até confirmação".
    // 30.1% > 30.0%, therefore res.approved MUST be false and res.lockedReason MUST be "VARIATION_LOCK".
    assert.equal(res.approved, false, "Rate with +30.1% fluctuation MUST NOT be approved without confirmation");
    assert.equal(res.lockedReason, "VARIATION_LOCK", "Locked reason MUST be VARIATION_LOCK");
    assert.equal(res.finalRate, null, "Final rate MUST be null when retained");
  });

  it("Variation Lock (Downward): -29.9% fluctuation (R$ 701.00) is within 30% limit and approved", () => {
    const rate299Down = 701.00; // exactly (701 - 1000) / 1000 = -29.9%
    const res = applyPricingLocks({
      candidateRate: rate299Down,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00, // floor set lower to isolate variation lock
      variationLimitPct: 0.30
    });

    assert.equal(res.approved, true, "-29.9% variation must be approved");
    assert.equal(res.lockedReason, null);
    assert.equal(res.finalRate, 701.00);
  });

  it("Variation Lock (Downward): -30.0% fluctuation (R$ 700.00) is at exact limit boundary and approved", () => {
    const rate300Down = 700.00; // exactly (700 - 1000) / 1000 = -30.0%
    const res = applyPricingLocks({
      candidateRate: rate300Down,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00,
      variationLimitPct: 0.30
    });

    assert.equal(res.approved, true, "-30.0% boundary variation must be approved");
    assert.equal(res.lockedReason, null);
    assert.equal(res.finalRate, 700.00);
  });

  it("Variation Lock (Downward): -30.1% fluctuation (R$ 699.00) strictly exceeds 30.0% drop and MUST BE RETAINED", () => {
    const rate301Down = 699.00; // exactly (699 - 1000) / 1000 = -30.1%
    const res = applyPricingLocks({
      candidateRate: rate301Down,
      lastSentRate: BASELINE_RATE,
      tarifaMinima: 200.00,
      variationLimitPct: 0.30
    });

    // Adversarial verification: Requirement states "variação acima de 30% fica retida até confirmação".
    // |-30.1%| = 30.1% > 30.0%, therefore res.approved MUST be false and res.lockedReason MUST be "VARIATION_LOCK".
    assert.equal(res.approved, false, "Rate with -30.1% downward fluctuation MUST NOT be approved without confirmation");
    assert.equal(res.lockedReason, "VARIATION_LOCK", "Locked reason MUST be VARIATION_LOCK");
    assert.equal(res.finalRate, null, "Final rate MUST be null when retained");
  });
});

describe("Challenger 2: Staged Publication Workflow & Draft State Preservation", () => {
  it("preserves draft settings and status until publication, keeping lastPublishedRates untouched", () => {
    const mockDb = {
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG },
        status: "published",
        lastPublishedAt: "2026-11-01T00:00:00.000Z",
        lastPublishedRates: {
          "2026-11-20_sem_cafe": 276.63,
          "2026-11-20_com_cafe": 326.63
        },
        stagedModifications: {},
        confirmedVariations: {}
      }
    };

    // 1. Update settings (cost structure change)
    WbpPricingManager.updateSettings({ fixedRent: 45000.00 }, mockDb);

    // Assert status became staged
    assert.equal(mockDb.wbpPricing.status, "staged");
    // Assert lastPublishedRates and lastPublishedAt are UNTOUCHED
    assert.equal(mockDb.wbpPricing.lastPublishedRates["2026-11-20_sem_cafe"], 276.63);
    assert.equal(mockDb.wbpPricing.lastPublishedAt, "2026-11-01T00:00:00.000Z");
  });

  it("strictly preserves unconfirmed variation locks in stagedModifications across publish calls", () => {
    const mockDb = {
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG, manualFloor: 276.63, variationLimitPct: 0.30 },
        status: "published",
        lastPublishedAt: "2026-11-01T00:00:00.000Z",
        lastPublishedRates: {
          "2026-11-20_sem_cafe": 300.00
        },
        stagedModifications: {
          // Injected manual rate jump: 300.00 -> 450.00 (+50.0% jump > 30%)
          "2026-11-20_sem_cafe": 450.00
        },
        confirmedVariations: {}
      }
    };

    // Generate preview
    const preview = WbpPricingManager.generatePreview("2026-11-20", "2026-11-21", mockDb);
    assert.equal(preview.kpis.retidosPelaTrava, 1);
    assert.equal(preview.retainedItems.length, 1);
    assert.equal(preview.retainedItems[0].isVariationLocked, true);
    assert.equal(preview.retainedItems[0].newRate, 450.00);

    // Attempt publication WITHOUT confirmation
    const pubResult = WbpPricingManager.publish(mockDb, "2026-11-20", "2026-11-21");

    // The variation-locked rate MUST be excluded
    assert.ok(pubResult.excludedCount >= 1, "Locked variation must be excluded from publication");

    // CRITICAL: staged modification MUST be preserved in draft state!
    assert.equal(mockDb.wbpPricing.stagedModifications["2026-11-20_sem_cafe"], 450.00, "Draft modification must remain in stagedModifications");

    // lastPublishedRates MUST NOT have been updated to 450.00
    assert.notEqual(mockDb.wbpPricing.lastPublishedRates["2026-11-20_sem_cafe"], 450.00);
    assert.equal(mockDb.wbpPricing.lastPublishedRates["2026-11-20_sem_cafe"], 300.00);

    // Status MUST remain "staged" because draft items remain unconfirmed
    assert.equal(mockDb.wbpPricing.status, "staged");
  });

  it("strictly excludes below-floor candidate rates from publish", () => {
    const mockDb = {
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG, manualFloor: 300.00 },
        status: "staged",
        lastPublishedAt: null,
        lastPublishedRates: {},
        stagedModifications: {
          "2026-11-25_sem_cafe": 250.00 // Below floor 300.00
        },
        confirmedVariations: {}
      }
    };

    const pubResult = WbpPricingManager.publish(mockDb, "2026-11-25", "2026-11-26");

    // Below floor rate MUST be excluded
    assert.ok(pubResult.excludedCount >= 1, "Below-floor rate must be excluded from publication");
    assert.equal(mockDb.wbpPricing.lastPublishedRates["2026-11-25_sem_cafe"], undefined);
  });

  it("publishes cleanly once variation is explicitly confirmed, transitioning status to published", () => {
    const mockDb = {
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG, manualFloor: 276.63, variationLimitPct: 0.30 },
        status: "staged",
        lastPublishedAt: null,
        lastPublishedRates: {
          "2026-11-20_sem_cafe": 300.00
        },
        stagedModifications: {
          "2026-11-20_sem_cafe": 450.00 // +50% jump
        },
        confirmedVariations: {}
      }
    };

    // Explicitly confirm the variation
    WbpPricingManager.confirmVariation("2026-11-20", "sem_cafe", mockDb);
    assert.equal(mockDb.wbpPricing.confirmedVariations["2026-11-20_sem_cafe"], true);

    // Publish
    const pubResult = WbpPricingManager.publish(mockDb, "2026-11-20", "2026-11-21");

    // Now it must be published!
    assert.equal(mockDb.wbpPricing.lastPublishedRates["2026-11-20_sem_cafe"], 450.00);
    assert.equal(mockDb.wbpPricing.stagedModifications["2026-11-20_sem_cafe"], undefined);
    assert.equal(mockDb.wbpPricing.status, "published");
    assert.ok(mockDb.wbpPricing.lastPublishedAt != null);
  });

  it("discards draft modifications cleanly via discardVariation and discardAll", () => {
    const mockDb = {
      wbpPricing: {
        settings: { ...DEFAULT_SEBRAE_CONFIG },
        status: "staged",
        stagedModifications: {
          "2026-11-21_sem_cafe": 400.00,
          "2026-11-22_sem_cafe": 420.00
        },
        confirmedVariations: {
          "2026-11-21_sem_cafe": true
        }
      }
    };

    // Discard single date
    WbpPricingManager.discardVariation("2026-11-21", "sem_cafe", mockDb);
    assert.equal(mockDb.wbpPricing.stagedModifications["2026-11-21_sem_cafe"], undefined);
    assert.equal(mockDb.wbpPricing.confirmedVariations["2026-11-21_sem_cafe"], undefined);
    assert.equal(mockDb.wbpPricing.stagedModifications["2026-11-22_sem_cafe"], 420.00);

    // Discard all
    WbpPricingManager.discardAll(mockDb);
    assert.deepEqual(mockDb.wbpPricing.stagedModifications, {});
    assert.deepEqual(mockDb.wbpPricing.confirmedVariations, {});
    assert.equal(mockDb.wbpPricing.status, "published");
  });
});

describe("Challenger 2: Breakfast Surcharge & Occupancy Scaling (1, 2, 3, 4 Guests)", () => {
  const BASE_RATE = 276.63;
  const SURCHARGE = 25.00;
  const EXTRA_BED = 60.00;

  it("Occupancy 1 (Single): difference between 'Com café' and 'Sem café' is exactly 1x breakfast surcharge (R$ 25.00)", () => {
    const plans = calculateRatePlanPrices(BASE_RATE, {
      breakfastSurchargePerGuest: SURCHARGE,
      extraBedFee: EXTRA_BED
    });

    const semSingle = plans.sem_cafe.adult_1; // 276.63
    const comSingle = plans.com_cafe.adult_1; // 301.63
    const delta = round2(comSingle - semSingle);

    assert.equal(semSingle, 276.63);
    assert.equal(comSingle, 301.63);
    assert.equal(delta, 25.00, "1-guest surcharge difference must equal exactly R$ 25.00");
    assert.equal(plans.com_cafe.rdef_single, 301.63);
    assert.equal(plans.sem_cafe.rdef_single, 276.63);
  });

  it("Occupancy 2 (Double): difference between 'Com café' and 'Sem café' is exactly 2x breakfast surcharge (R$ 50.00)", () => {
    const plans = calculateRatePlanPrices(BASE_RATE, {
      breakfastSurchargePerGuest: SURCHARGE,
      extraBedFee: EXTRA_BED
    });

    const semDouble = plans.sem_cafe.adult_2; // 276.63
    const comDouble = plans.com_cafe.adult_2; // 326.63
    const delta = round2(comDouble - semDouble);

    assert.equal(semDouble, 276.63);
    assert.equal(comDouble, 326.63);
    assert.equal(delta, 50.00, "2-guest surcharge difference must equal exactly R$ 50.00");
    assert.equal(plans.sem_cafe.rate, 276.63);
    assert.equal(plans.com_cafe.rate, 326.63);
  });

  it("Occupancy 3 (Triple): difference between 'Com café' and 'Sem café' is exactly 3x breakfast surcharge (R$ 75.00), both including extra bed fee", () => {
    const plans = calculateRatePlanPrices(BASE_RATE, {
      breakfastSurchargePerGuest: SURCHARGE,
      extraBedFee: EXTRA_BED
    });

    const semTriple = plans.sem_cafe.adult_3; // 276.63 + 60.00 = 336.63
    const comTriple = plans.com_cafe.adult_3; // 276.63 + 75.00 + 60.00 = 411.63
    const delta = round2(comTriple - semTriple);

    assert.equal(semTriple, 336.63);
    assert.equal(comTriple, 411.63);
    assert.equal(delta, 75.00, "3-guest surcharge difference must equal exactly R$ 75.00");
  });

  it("Occupancy 4 (Quadruple edge): evaluates presence and handling of 4th guest in rate plans", () => {
    const plans = calculateRatePlanPrices(BASE_RATE, {
      breakfastSurchargePerGuest: SURCHARGE,
      extraBedFee: EXTRA_BED
    });

    // In CorpFlats, flats have physical capacity for up to 3 guests (double + extra bed).
    // Empirical verification checks whether calculateRatePlanPrices defines adult_4 or omits it.
    const adult4Sem = plans.sem_cafe.adult_4;
    const adult4Com = plans.com_cafe.adult_4;

    // We record empirical behavior: adult_4 is undefined (omitted in 19-flat studio layout)
    assert.equal(adult4Sem, undefined, "adult_4 in sem_cafe is undefined (capacity capped at 3 guests)");
    assert.equal(adult4Com, undefined, "adult_4 in com_cafe is undefined (capacity capped at 3 guests)");
  });
});
