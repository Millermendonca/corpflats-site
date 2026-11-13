import assert from "node:assert/strict";
import { 
  calculateSebraeRate, 
  DEFAULT_SEBRAE_CONFIG, 
  applyPricingLocks, 
  WbpPricingManager, 
  round2 
} from "../artifacts/api-server/wbp/pricing.mjs";

console.log("================================================================================");
console.log("       EMPIRICAL CHALLENGER: SEBRAE PRICING ENGINE & FINANCIAL MATH             ");
console.log("================================================================================");

// -----------------------------------------------------------------------------
// CHALLENGE 1: Canonical SEBRAE Parameter Math Verification
// -----------------------------------------------------------------------------
console.log("\n[CHALLENGE 1] Verifying Canonical SEBRAE Default Parameters...");

const res = calculateSebraeRate(DEFAULT_SEBRAE_CONFIG);

// 1. 19 flats, 31 days, 65% occupancy = 382.85 room nights
const expectedRoomNights = round2(19 * 31 * 0.65);
console.log(`   Room nights: actual=${res.soldUnitsMonth}, expected=${expectedRoomNights}`);
assert.equal(res.soldUnitsMonth, 382.85, "Sold units must be 382.85");
assert.equal(res.availableUnits, 589, "Available units must be 589 (19 * 31)");

// 2. Fixed costs R$ 38,906.61 / 382.85 = R$ 101.62
const rawFixedPerSold = 38906.61 / 382.85;
const expectedFixedPerSold = round2(rawFixedPerSold);
console.log(`   Fixed cost per sold UH: actual=${res.fixedCostPerSoldUnit}, expected=${expectedFixedPerSold} (raw=${rawFixedPerSold})`);
assert.equal(res.fixedCostPerSoldUnit, 101.62, "Fixed cost per sold UH must be 101.62");

// 3. Variable costs = R$ 47.76
const expectedVarCost = round2(23.25 + 15.51 + 9.00);
console.log(`   Variable cost per UH: actual=${res.varCostPerUnit}, expected=${expectedVarCost}`);
assert.equal(res.varCostPerUnit, 47.76, "Variable cost per UH must be 47.76");

// 4. Total cost UH = R$ 149.38
const rawTotalCostUH = rawFixedPerSold + expectedVarCost;
const expectedTotalCostUH = round2(rawTotalCostUH);
console.log(`   Total cost UH: actual=${res.custoUH}, expected=${expectedTotalCostUH} (raw=${rawTotalCostUH})`);
assert.equal(res.custoUH, 149.38, "Total cost UH must be 149.38");

// 5. Denominator = 1 - 0.15 - 0.25 - 0.06 = 0.54
const expectedDenominator = round2(1 - 0.15 - 0.25 - 0.06);
console.log(`   Denominator (divisor): actual=${res.divisor}, expected=${expectedDenominator}`);
assert.equal(res.divisor, 0.54, "Divisor must be 0.54");

// 6. Tarifa mínima = R$ 276.63
const rawTarifaMinima = res.custoUH / res.divisor;
const expectedTarifaMinima = round2(rawTarifaMinima);
console.log(`   Tarifa mínima: actual=${res.tarifaMinima}, expected=${expectedTarifaMinima} (raw=${rawTarifaMinima})`);
assert.equal(res.tarifaMinima, 276.63, "Tarifa mínima must be 276.63");

// 7. Breakdown sums to exactly R$ 276.63 (100%)
console.log("   Decomposition Breakdown:");
console.log(`     - Custo: R$ ${res.decomposicao.custo.toFixed(2)}`);
console.log(`     - Comissão (15%): R$ ${res.decomposicao.comissao.toFixed(2)}`);
console.log(`     - Margem (25%): R$ ${res.decomposicao.margem.toFixed(2)}`);
console.log(`     - Imposto (6%): R$ ${res.decomposicao.imposto.toFixed(2)}`);
console.log(`     - Soma total: R$ ${res.somaDecomposicao.toFixed(2)}`);
console.log(`     - Fecha 100%: ${res.fecha100}`);

assert.equal(res.decomposicao.custo, 149.38, "Decomposition custo must be 149.38");
assert.equal(res.decomposicao.comissao, 41.49, "Decomposition comissao must be 41.49");
assert.equal(res.decomposicao.margem, 69.16, "Decomposition margem must be 69.16");
assert.equal(res.decomposicao.imposto, 16.60, "Decomposition imposto must be 16.60");
assert.equal(res.somaDecomposicao, 276.63, "Decomposition sum must equal exactly 276.63");
assert.equal(res.fecha100, true, "fecha100 flag must be true");

console.log("   [PASS] Challenge 1: All canonical SEBRAE parameters and breakdown verified.");

// -----------------------------------------------------------------------------
// CHALLENGE 2: Low-Season Pricing & Break-Even Floor Safety Lock
// -----------------------------------------------------------------------------
console.log("\n[CHALLENGE 2] Challenging Low Season & Break-Even Floor Lock...");

// Low season factor 0.90
const lowSeasonRate = round2(res.tarifaMinima * 0.90);
console.log(`   Low season rate (factor 0.90): R$ ${lowSeasonRate}`);
assert.equal(lowSeasonRate, 248.97, "Low season rate must be 248.97");

// Break-even floor = 149.38 / (1 - 0.15 - 0.06) = 149.38 / 0.79 = R$ 189.09
const breakEvenFloor = round2(res.custoUH / (1.0 - 0.15 - 0.06));
console.log(`   Break-even floor: actual=${res.breakEvenFloor}, calculated=${breakEvenFloor}`);
assert.equal(res.breakEvenFloor, 189.09, "Break-even floor must be 189.09");
assert.equal(breakEvenFloor, 189.09, "Break-even floor calculation must be 189.09");

// Verify that R$ 248.97 > R$ 189.09
assert(lowSeasonRate > breakEvenFloor, `Low season rate (${lowSeasonRate}) must be strictly greater than break-even floor (${breakEvenFloor})`);
console.log(`   Safety margin above break-even: R$ ${(lowSeasonRate - breakEvenFloor).toFixed(2)} (+${(((lowSeasonRate - breakEvenFloor) / breakEvenFloor) * 100).toFixed(1)}%)`);

// Test applyPricingLocks for low season
const lowSeasonLock = applyPricingLocks({
  currentRate: 276.63,
  candidateRate: lowSeasonRate,
  tarifaMinima: res.tarifaMinima,
  breakEvenFloor: res.breakEvenFloor,
  manualFloor: res.breakEvenFloor,
  variationLimitPct: 0.30
});
console.log("   applyPricingLocks result for low season (248.97):", lowSeasonLock);
assert.equal(lowSeasonLock.approved, true, "Low season rate must be approved");
assert.equal(lowSeasonLock.isLocked, false, "Low season rate must NOT be locked");
assert.equal(lowSeasonLock.lockedReason, null, "Low season rate lockedReason must be null (NOT FLOOR_LOCK)");
assert.equal(lowSeasonLock.finalRate, 248.97, "finalRate must be 248.97");

// ADVERSARIAL STRESS TEST: Below Break-Even Floor (< 189.09)
console.log("\n   [Adversarial 2.1] Stress-testing rate below break-even floor (R$ 180.00)...");
const belowFloorLock = applyPricingLocks({
  currentRate: 276.63,
  candidateRate: 180.00,
  tarifaMinima: res.tarifaMinima,
  breakEvenFloor: res.breakEvenFloor,
  manualFloor: res.breakEvenFloor,
  variationLimitPct: 0.30
});
console.log("   applyPricingLocks result for below-floor candidate (180.00):", belowFloorLock);
assert.equal(belowFloorLock.approved, false, "Candidate rate 180.00 must NOT be approved");
assert.equal(belowFloorLock.isLocked, true, "Candidate rate 180.00 must be locked");
assert.equal(belowFloorLock.lockedReason, "FLOOR_LOCK", "lockedReason must be FLOOR_LOCK");
assert.equal(belowFloorLock.finalRate, null, "finalRate must be null when below floor");

// ADVERSARIAL STRESS TEST: Excessive Variation (> 30%)
console.log("\n   [Adversarial 2.2] Stress-testing excessive variation (> 30%)...");
const excessiveVarLock = applyPricingLocks({
  currentRate: 400.00,
  candidateRate: 248.97, // (248.97 - 400) / 400 = -37.76%
  tarifaMinima: res.tarifaMinima,
  breakEvenFloor: res.breakEvenFloor,
  manualFloor: res.breakEvenFloor,
  variationLimitPct: 0.30
});
console.log("   applyPricingLocks result for excessive drop (400.00 -> 248.97):", excessiveVarLock);
assert.equal(excessiveVarLock.approved, false, "Drop of -37.76% must NOT be approved");
assert.equal(excessiveVarLock.isLocked, true, "Drop of -37.76% must be locked");
assert.equal(excessiveVarLock.lockedReason, "VARIATION_LOCK", "lockedReason must be VARIATION_LOCK");

console.log("   [PASS] Challenge 2: Low-season pricing, break-even floor and adversarial lock tests passed.");

// -----------------------------------------------------------------------------
// CHALLENGE 3: Edge Cases & Mathematical Robustness
// -----------------------------------------------------------------------------
console.log("\n[CHALLENGE 3] Testing Mathematical Edge Cases & Boundary Conditions...");

// Edge case 3.1: Invalid occupancy <= 0 or > 1
assert.throws(() => {
  calculateSebraeRate({ occupancyRate: 0 });
}, /taxa de ocupação/);
assert.throws(() => {
  calculateSebraeRate({ occupancyRate: 1.5 });
}, /taxa de ocupação/);

// Edge case 3.2: Invalid deductions >= 100%
assert.throws(() => {
  calculateSebraeRate({
    channelCommissionPct: 0.50,
    targetMarginPct: 0.45,
    taxRatePct: 0.06 // total = 1.01 >= 1.0
  });
}, /ultrapassar 100%/);

// Edge case 3.3: 100% occupancy check
const fullOccRes = calculateSebraeRate({ ...DEFAULT_SEBRAE_CONFIG, occupancyRate: 1.0 });
assert.equal(fullOccRes.soldUnitsMonth, 589);
assert.equal(fullOccRes.fixedCostPerSoldUnit, 66.06);
assert.equal(fullOccRes.fecha100, true);
console.log(`   100% occupancy rate = R$ ${fullOccRes.tarifaMinima} (custo UH = R$ ${fullOccRes.custoUH})`);

// Edge case 3.4: 28 days month (February) check
const febRes = calculateSebraeRate({ ...DEFAULT_SEBRAE_CONFIG, daysInMonth: 28 });
assert.equal(febRes.availableUnits, 19 * 28); // 532
assert.equal(febRes.soldUnitsMonth, round2(532 * 0.65)); // 345.8
assert.equal(febRes.fecha100, true);
console.log(`   February (28 days) tarifa = R$ ${febRes.tarifaMinima} (sold units = ${febRes.soldUnitsMonth})`);

console.log("   [PASS] Challenge 3: Edge cases handled safely.");

// -----------------------------------------------------------------------------
// CHALLENGE 4: JSON Contracts & Staged Publication Workflow
// -----------------------------------------------------------------------------
console.log("\n[CHALLENGE 4] Verifying JSON Contracts between Backend and Frontend...");

const mockDb = {
  reservations: [
    { checkinDate: "2026-11-01", checkoutDate: "2026-11-05", status: "confirmed" },
    { checkinDate: "2026-11-10", checkoutDate: "2026-11-15", status: "confirmed" }
  ],
  wbpPricing: {
    settings: { ...DEFAULT_SEBRAE_CONFIG },
    status: "published",
    lastPublishedRates: {
      "2026-11-01_sem_cafe": 276.63,
      "2026-11-01_com_cafe": 326.63,
      "2026-11-02_sem_cafe": 400.00 // will trigger variation lock!
    }
  }
};

const preview = WbpPricingManager.generatePreview("2026-11-01", "2026-11-04", mockDb);

console.log("   Preview structure verification:");
console.log("     - has 'kpis':", Boolean(preview.kpis));
console.log("     - kpis.datasAfetadas:", preview.kpis?.datasAfetadas);
console.log("     - kpis.precosAlterados:", preview.kpis?.precosAlterados);
console.log("     - kpis.retidosPelaTrava:", preview.kpis?.retidosPelaTrava);
console.log("     - kpis.abaixoDoPiso:", preview.kpis?.abaixoDoPiso);
console.log("     - top-level affectedDatesCount:", preview.affectedDatesCount);
console.log("     - top-level alteredRatesCount:", preview.alteredRatesCount);
console.log("     - top-level retainedLockedCount:", preview.retainedLockedCount);
console.log("     - top-level belowFloorCount:", preview.belowFloorCount);
console.log("     - diffList length:", preview.diffList?.length);
console.log("     - items length:", preview.items?.length);
console.log("     - retainedItems length:", preview.retainedItems?.length);
console.log("     - sebraeRate present:", Boolean(preview.sebraeRate));

assert(preview.kpis, "preview.kpis must exist");
assert(Number.isInteger(preview.kpis.datasAfetadas), "kpis.datasAfetadas must be integer");
assert(Number.isInteger(preview.kpis.precosAlterados), "kpis.precosAlterados must be integer");
assert(Number.isInteger(preview.kpis.retidosPelaTrava), "kpis.retidosPelaTrava must be integer");
assert(Number.isInteger(preview.kpis.abaixoDoPiso), "kpis.abaixoDoPiso must be integer");

assert.equal(preview.affectedDatesCount, preview.kpis.datasAfetadas, "Top-level affectedDatesCount must match kpis");
assert.equal(preview.alteredRatesCount, preview.kpis.precosAlterados, "Top-level alteredRatesCount must match kpis");
assert.equal(preview.retainedLockedCount, preview.kpis.retidosPelaTrava, "Top-level retainedLockedCount must match kpis");
assert.equal(preview.belowFloorCount, preview.kpis.abaixoDoPiso, "Top-level belowFloorCount must match kpis");

assert(Array.isArray(preview.diffList), "preview.diffList must be an array");
assert(Array.isArray(preview.items), "preview.items must be an array");
assert.equal(preview.diffList, preview.items, "preview.items must alias preview.diffList");
assert(Array.isArray(preview.retainedItems), "preview.retainedItems must be an array");

// Check preview items contract
const firstItem = preview.items[0];
console.log("   First Preview Item fields check:", Object.keys(firstItem));
const requiredFields = [
  "id", "date", "planId", "planName", "currentRate", "newRate",
  "variationPct", "isLocked", "isBelowFloor", "freeUnits", "confirmed"
];
for (const field of requiredFields) {
  assert(field in firstItem, `Preview rate item must contain field '${field}'`);
}

// Test confirmVariation with both calling conventions:
// 1. (date, planId, db)
// 2. (itemId, db)
console.log("\n   Testing confirmVariation calling conventions...");
WbpPricingManager.confirmVariation("2026-11-02", "sem_cafe", mockDb);
assert.equal(mockDb.wbpPricing.confirmedVariations["2026-11-02_sem_cafe"], true, "confirmVariation(date, planId) must work");

delete mockDb.wbpPricing.confirmedVariations["2026-11-02_sem_cafe"];
WbpPricingManager.confirmVariation("2026-11-02_sem_cafe", mockDb);
assert.equal(mockDb.wbpPricing.confirmedVariations["2026-11-02_sem_cafe"], true, "confirmVariation(itemId) must work");

// Test discardVariation with both calling conventions
console.log("   Testing discardVariation calling conventions...");
mockDb.wbpPricing.stagedModifications = { "2026-11-02_sem_cafe": 350.00 };
WbpPricingManager.discardVariation("2026-11-02_sem_cafe", mockDb);
assert.equal(mockDb.wbpPricing.stagedModifications["2026-11-02_sem_cafe"], undefined, "discardVariation(itemId) must delete staged mod");
assert.equal(mockDb.wbpPricing.confirmedVariations["2026-11-02_sem_cafe"], undefined, "discardVariation(itemId) must delete confirmed variation");

console.log("   [PASS] Challenge 4: JSON contracts and calling conventions verified.");

console.log("\n================================================================================");
console.log("           ALL 4 CHALLENGES PASSED EMPIRICALLY WITH ZERO DEFECTS!                ");
console.log("================================================================================");
