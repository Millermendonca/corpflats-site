# Handoff Report — Milestone 2 (Challenger 2: Pricing & Safety Locks Stress)

## 1. Observation

- **Targeted Test Execution**:
  Executed exclusively the isolated test suite:
  ```bash
  node --test tests/wbp-integration/challenger-m2-pricing.test.mjs
  ```
  Result:
  ```
  # tests 21
  # suites 4
  # pass 18
  # fail 3
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 144.7632
  ```

- **Verbatim Failures Observed**:

  1. **Failure 1: Variation Lock Upward at +30.1% (Line 197)**:
     ```
     # Subtest: Variation Lock (Upward): +30.1% fluctuation (R$ 1301.00) strictly exceeds 30.0% and MUST BE RETAINED
     not ok 3 - Variation Lock (Upward): +30.1% fluctuation (R$ 1301.00) strictly exceeds 30.0% and MUST BE RETAINED
       ---
       duration_ms: 0.2889
       location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:197:3'
       failureType: 'testCodeFailure'
       error: 'Rate with +30.1% fluctuation MUST NOT be approved without confirmation'
       code: 'ERR_ASSERTION'
       name: 'AssertionError'
       expected: false
       actual: true
       operator: 'strictEqual'
       stack: |-
         TestContext.<anonymous> (file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:208:12)
     ```

  2. **Failure 2: Variation Lock Downward at -30.1% (Line 241)**:
     ```
     # Subtest: Variation Lock (Downward): -30.1% fluctuation (R$ 699.00) strictly exceeds 30.0% drop and MUST BE RETAINED
     not ok 6 - Variation Lock (Downward): -30.1% fluctuation (R$ 699.00) strictly exceeds 30.0% drop and MUST BE RETAINED
       ---
       duration_ms: 0.2552
       location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:241:3'
       failureType: 'testCodeFailure'
       error: 'Rate with -30.1% downward fluctuation MUST NOT be approved without confirmation'
       code: 'ERR_ASSERTION'
       name: 'AssertionError'
       expected: false
       actual: true
       operator: 'strictEqual'
       stack: |-
         TestContext.<anonymous> (file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:252:12)
     ```

  3. **Failure 3: Floor Lock Adversarial Non-numeric string / NaN input (Line 161)**:
     ```
     # Subtest: Floor Lock: adversarial non-numeric string/NaN rate MUST NOT be approved
     not ok 6 - Floor Lock: adversarial non-numeric string/NaN rate MUST NOT be approved
       ---
       duration_ms: 0.2312
       location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:161:3'
       failureType: 'testCodeFailure'
       error: 'Non-numeric string / NaN candidate rate MUST NOT be approved'
       code: 'ERR_ASSERTION'
       name: 'AssertionError'
       expected: false
       actual: true
       operator: 'strictEqual'
       stack: |-
         TestContext.<anonymous> (file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m2-pricing.test.mjs:161:12)
     ```

- **Verbatim Code Inspection in `artifacts/api-server/wbp/pricing.mjs`**:
  - Lines 339–353:
    ```javascript
    const rate = round2(Number(candidateRate || 0));
    const floor = round2(Math.max(Number(tarifaMinima || 0), Number(manualFloor || 0)));

    // Trava 1: Piso Sustentável
    if (rate < floor) {
      return {
        approved: false,
        candidateRate: rate,
        finalRate: null,
        lockedReason: "FLOOR_LOCK",
        floor,
        deltaPct: 0,
        message: `Tarifa proposta (R$ ${rate.toFixed(2)}) abaixo do piso sustentável permitido (R$ ${floor.toFixed(2)}).`
      };
    }
    ```
  - Lines 356–373:
    ```javascript
    // Trava 2: Variação Brusca (padrão 30%)
    if (lastSentRate != null && !isNaN(Number(lastSentRate)) && Number(lastSentRate) > 0) {
      const prevRate = Number(lastSentRate);
      const deltaPct = round2((rate - prevRate) / prevRate);
      const maxVariation = Number(variationLimitPct || 0.30);

      if (Math.abs(deltaPct) > maxVariation) {
        const deltaPercentStr = (deltaPct * 100).toFixed(1);
        return {
          approved: false,
          candidateRate: rate,
          finalRate: null,
          lockedReason: "VARIATION_LOCK",
          floor,
          deltaPct,
          message: `Variação de ${deltaPercentStr}% em relação à última tarifa enviada (R$ ${prevRate.toFixed(2)}) excede a trava de ${Math.round(maxVariation * 100)}%. Requer confirmação explícita.`
        };
      }
    ```
  - Lines 428–444:
    ```javascript
    // Plano "Sem café" (Room Only - Base)
    const semCafe = {
      rate: bRate, // Standard 2 adults
      rdef_single: round2(Math.max(0, bRate - singleDisc)), // 1 adult
      adult_1: round2(Math.max(0, bRate - singleDisc)),
      adult_2: bRate,
      adult_3: round2(bRate + extraBed)
    };

    // Plano "Com café" (Bed & Breakfast: Base + R$ per guest/night)
    const comCafe = {
      rate: round2(bRate + (2 * bSurcharge)), // Standard 2 adults + 2 breakfasts
      rdef_single: round2(Math.max(0, bRate - singleDisc) + (1 * bSurcharge)), // 1 adult + 1 breakfast
      adult_1: round2(Math.max(0, bRate - singleDisc) + (1 * bSurcharge)),
      adult_2: round2(bRate + (2 * bSurcharge)),
      adult_3: round2(bRate + (3 * bSurcharge) + extraBed) // 3 adults + 3 breakfasts + extra bed
    };
    ```

## 2. Logic Chain

1. **Bug 1: Variation Lock Rounding Truncation Bypasses ±30.1% Swings**:
   - In `pricing.mjs` line 358: `deltaPct` is computed as `round2((rate - prevRate) / prevRate)`.
   - The function `round2(x)` rounds to 2 decimal places (`Math.round((x + EPSILON) * 100) / 100`).
   - For a fluctuation of +30.1% (`prevRate = 1000.00`, `rate = 1301.00`), the mathematical delta is `0.301`.
   - `round2(0.301)` rounds `0.301` to `0.30`.
   - On line 361, `Math.abs(deltaPct) > maxVariation` evaluates `0.30 > 0.30`, which is strictly `false`.
   - Consequently, any rate fluctuation between 30.0001% and 30.4999% rounds down to `0.30`, bypassing `VARIATION_LOCK` entirely.
   - The same defect applies symmetrically downward: -30.1% (`rate = 699.00`, `prevRate = 1000.00`) results in `deltaPct = -0.30`, and `|-0.30| > 0.30` evaluates to `false`.
   - Only fluctuations `>= 30.5%` (`round2(0.305) = 0.31`) or `<= -30.5%` trigger the lock. This directly violates R4: *"uma variação acima de X% (configurável, padrão 30%) em relação ao último valor enviado fica retida até confirmação"*.

2. **Bug 2: Floor Lock Approval of Non-numeric / NaN Rates**:
   - In `pricing.mjs` line 339: `const rate = round2(Number(candidateRate || 0))`.
   - If `candidateRate` is `"invalid"`, `Number("invalid")` evaluates to `NaN`.
   - In JavaScript, comparison `NaN < floor` evaluates to `false`.
   - The floor check `if (rate < floor)` is skipped.
   - The function reaches the fallback return on line 385:
     ```javascript
     return {
       approved: true,
       candidateRate: NaN,
       finalRate: NaN,
       lockedReason: null,
       floor,
       deltaPct: 0,
       message: "Tarifa aprovada pelas travas de segurança."
     };
     ```
   - Malformed or corrupt candidate rate inputs are approved by the safety lock instead of being rejected.

3. **Analysis of Robust Areas**:
   - **Floor Lock Boundaries**: Under valid numeric inputs, the floor lock performs accurately at `floor - 0.01` (R$ 276.62, locked), `floor` (R$ 276.63, approved), and `floor + 0.01` (R$ 276.64, approved), including with dynamic `manualFloor` (R$ 350.00).
   - **Staged Publication Workflow**: Preserves draft configurations; unconfirmed locks and below-floor rates are strictly excluded from publication and retained in `stagedModifications`; confirmed variations publish atomically and transition status to `published`.
   - **Breakfast Surcharge (OBP)**: Occupancies 1, 2, and 3 accurately scale by R$ 25.00/guest/night (+25.00, +50.00, +75.00 + extraBed). Occupancy 4 returns `undefined` for `adult_4`, consistent with CorpFlats 19-flat studio capacity (maximum 3 guests per flat).

## 3. Caveats

- No caveats regarding isolation: tests executed exclusively in memory with `DATABASE_URL` deleted and `data/database.json` completely untouched.
- As an empirical challenger adhering to review-only constraints, no implementation source files in `artifacts/api-server/wbp/` or `scripts/wbp/` were modified. The fixes must be applied by worker_m2.

## 4. Conclusion & Verdict

**Explicit Verdict: REQUEST_CHANGES**

Worker M2 must implement the following corrective actions:
1. **Fix `deltaPct` precision in `applyPricingLocks`**:
   Replace `round2((rate - prevRate) / prevRate)` with unrounded ratio or 4-decimal precision (e.g. `(rate - prevRate) / prevRate`), ensuring `0.301 > 0.30` correctly triggers `VARIATION_LOCK` for both upward and downward swings at 30.1%.
2. **Harden `applyPricingLocks` against NaN inputs**:
   Add an explicit validation check: `if (isNaN(rate) || rate <= 0)` immediately returning `{ approved: false, lockedReason: "FLOOR_LOCK" }`.
3. **Synchronize twin parity**:
   Mirror corrections identically byte-for-byte between `artifacts/api-server/wbp/pricing.mjs` and `scripts/wbp/pricing.mjs`.

## 5. Verification Method

To independently reproduce the findings:
```bash
node --test tests/wbp-integration/challenger-m2-pricing.test.mjs
```
Expected output:
- 18 passing tests confirming Floor Lock boundaries, Staged Publication drafts, and Breakfast OBP occupancies 1–3.
- 3 failing tests demonstrating the exact failure of `VARIATION_LOCK` on +30.1% and -30.1%, and NaN approval on `FLOOR_LOCK`.
