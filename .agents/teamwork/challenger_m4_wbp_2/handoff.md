# Milestone 4 Challenger 2 Handoff Report: Quarantine, Reconciler & Mutations Stress

**Explicit Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **Targeted Test Execution Command and Results**:
   Command:
   ```powershell
   node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs
   ```
   Verbatim output:
   ```
   # tests 25
   # suites 6
   # pass 22
   # fail 3
   # cancelled 0
   # skipped 0
   # todo 0
   # duration_ms 3246.1746
   ```

2. **Database Integrity & File Hygiene**:
   - Baseline SHA-256 of `data/database.json`:
     `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882` (100% untouched).
   - Post-flight SHA-256:
     `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882` (Verified 0 changes).
   - `artifacts/api-server/audit_logs.jsonl`: 0 synthetic test lines added; clean working tree.

3. **Verbatim Defect 1: Collision Blindness in `handleOtaModification`**:
   - Source code: `artifacts/api-server/wbp/inbox.mjs:570-578` (and `scripts/wbp/inbox.mjs`):
     ```javascript
     const nights = getNightsBetween(newCheckin, newCheckout);
     let sameFlatFree = true;
     for (const night of nights) {
       const check = checkFlatBlockedOnNight(existing.flatNumber, night, db, {
         excludeReservationId: existing.id
       });
       if (check.isBlocked) {
         sameFlatFree = false;
         break;
       }
     }
     ```
   - Source code: `artifacts/api-server/wbp/availability.mjs:121-125`:
     ```javascript
     export function checkFlatBlockedOnNight(flat, nightDate, db = {}, options = {}) {
       const nowMs = Number(options.nowMs || Date.now());
       const flatIdStr = flat.id != null ? String(flat.id) : "";
       const flatNumStr = flat.number != null ? String(flat.number) : "";
     ```
   - Evaluation:
     When `existing.flatNumber` is passed as a string primitive (e.g. `"113"`), `flat.id` is `undefined` and `flat.number` is `undefined`.
     Thus `flatNumStr = ""` and `flatIdStr = ""`.
     At line 168 of `availability.mjs`:
     ```javascript
     const matchesThisFlat =
       matchFlat(flatNumStr, rFlatNum) ||
       matchFlat(flatIdStr, rFlatId) ||
       matchFlat(flatNumStr, rFlatId) ||
       matchFlat(flatIdStr, rFlatNum);
     ```
     Because `flatNumStr` and `flatIdStr` are both `""`, `matchFlat("", rFlatNum)` returns `false` (comparing `""` to `"113"`).
     `check.isBlocked` evaluates to `false` for every single night.
   - Verbatim test failure:
     ```
     # Subtest: Reallocated modification captures old flat and new flat in structured diff
     not ok 2 - Reallocated modification captures old flat and new flat in structured diff
       failureType: 'testCodeFailure'
       error: |-
         Expected values to be strictly equal:
         + actual - expected

         + 'modified_same_flat'
         - 'modified_reallocated'
     ```
     And in Bonus Condition 6:
     ```
     # Subtest: Bonus Condition 6: MODIFICATION_CONFLICT — routes to Quarantine when modification cannot fit anywhere
     not ok 6 - Bonus Condition 6: MODIFICATION_CONFLICT — routes to Quarantine when modification cannot fit anywhere
       failureType: 'testCodeFailure'
       error: 'undefined == true'
     ```
     (`result.id` was `undefined` because `handleOtaModification` applied `modified_same_flat` instead of routing to quarantine).

4. **Verbatim Defect 2: False-Positive Reconciler Ambiguity for Unrelated Guests on Same Dates**:
   - Source code: `artifacts/api-server/wbp/reconciler.mjs:280-284`:
     ```javascript
     const qualifiesSafe = exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80;
     const isSafeMatch = qualifiesSafe;

     // If score >= 50 but not safe match (e.g. divergent dates or divergent channels), ALWAYS classify as isAmbiguous
     const isAmbiguous = !isSafeMatch && finalScore >= 50;
     const isNoMatch = !isSafeMatch && !isAmbiguous;
     ```
   - Evaluation:
     When a new electronic OTA booking arrives for guest "Bruna Figueiredo" with the same dates and channel as an existing manual booking for "Carlos Eduardo Mendes":
     - `exactChannelMatch`: 20 pts
     - `exactDateMatch`: 30 pts
     - `Price compatibility`: 5 pts
     - `finalScore`: 55 pts
     Because `55 >= 50` and `nameSim = 0.19 < 0.85`, `isAmbiguous` evaluates to `true`.
   - Verbatim test failure:
     ```
     # Subtest: No Match: completely different guest name (<60% similarity) does not link and is treated as new electronic booking
     not ok 4 - No Match: completely different guest name (<60% similarity) does not link and is treated as new electronic booking
       failureType: 'testCodeFailure'
       error: 'Should return null (score < 50), not ambiguous nor safe'
       actual:
         bestMatch: { id: 991, guestName: 'Carlos Eduardo Mendes', ... }
         scoreResult: { score: 55, isSafeMatch: false, isAmbiguous: true, isNoMatch: false, nameSim: 0.1904... }
     ```
     In `inbox.mjs:778`, `processIncomingOTA` intercepts this booking and routes it to Quarantine as `AMBIGUOUS_MATCH`, blocking Bruna Figueiredo's booking from being automatically created in one of the other 18 free flats.

5. **Directly Verified Positive Safeguards**:
   - `CHECKED_IN_CANCELLATION`: Tested across 5 distinct in-house representations (`checked_in`, `hospedado`, `checkin_realizado`, `checkedIn: true`, `checkedInAt`). In ALL cases, PMS cancellation is blocked (`status` remains untouched) and routed to Quarantine with urgent alert.
   - `OVERBOOKING`: Tested when 19/19 flats are occupied; incoming booking cleanly routes to Quarantine (`reason: "OVERBOOKING"`).
   - `CONFLICT`: Unknown booking cancellation cleanly routes to Quarantine (`reason: "CONFLICT"`).
   - `MAINTENANCE_BLOCKED`: Quarantines with maintenance metadata (`flatNumber: "215"`, `serviceOrderId: "SO-ELECTRICAL-99"`).
   - `Safe Reconciler Linking`: Name similarity >= 85%, same dates, same channel safely sets `externalOrderId` while leaving `flatNumber`, `dailyRate`, `totalAmount`, and `paymentStatus` 100% untouched.
   - `Modification Diff`: Same-flat modifications capture structured `before` and `after` snapshots in both `auditLogs` and `modificationHistory`.
   - `Quarantine HTTP API`: Endpoints `/api/wbp/quarantine`, `/:id`, `/:id/resolve` (rejects conflict without forceOverride, resolves with forceOverride), `/:id/reject`, and `/:id/link` all function correctly.

---

## 2. Logic Chain

1. **Logic for Defect 1 (handleOtaModification)**:
   - Premise 1: In JavaScript, `typeof "113" === "string"`. Properties `"113".id` and `"113".number` evaluate to `undefined`.
   - Premise 2: `availability.mjs:123` initializes `flatIdStr = flat.id != null ? String(flat.id) : ""` and `flatNumStr = flat.number != null ? String(flat.number) : ""`. When `flat === "113"`, both strings are `""`.
   - Premise 3: PMS reservations have non-empty `flatNumber` (e.g. `"113"`) and `flatId` (e.g. `1`).
   - Premise 4: `matchFlat("", "113")` returns `false` and `matchFlat("", "1")` returns `false`.
   - Deduction: `checkFlatBlockedOnNight("113", night, db)` always returns `isBlocked: false`, even when another reservation occupies flat 113 on that date.
   - Conclusion: `handleOtaModification` believes the flat is always free, applies `modified_same_flat`, and causes silent double-booking.

2. **Logic for Defect 2 (reconciler.mjs)**:
   - Premise 1: CorpFlats Soho Residence has 19 individual flats. On busy dates, multiple unrelated guests book the exact same check-in and check-out dates through Booking.com or Airbnb.
   - Premise 2: In `reconciler.mjs`, date match awards 30 points and channel match awards 20 points (total 50 points).
   - Premise 3: Line 284 defines `isAmbiguous = !isSafeMatch && finalScore >= 50`.
   - Deduction: Any unrelated guest booking on the same dates and channel scores at least 50 points. Since their name similarity is low, `isSafeMatch` is false, forcing `isAmbiguous = true`.
   - Conclusion: In `inbox.mjs:778`, legitimate electronic bookings for different people are intercepted and dumped into Quarantine as ambiguous duplicates of existing manual reservations, preventing automated guest intake across the 19 flats.

---

## 3. Caveats

- In production, when `NODE_ENV !== "test"`, ARI sync dispatches outbound calls to WebBookingPro.
- In `reconciler.mjs:477-480`, property keys in the report object are returned in snake_case (`potential_duplicates`, `unmatched_pms`, `unmatched_ota`). Clients expecting camelCase (`ambiguous`, `unmatchedManualPms`) will see `undefined` unless aliased.

---

## 4. Conclusion

Milestone 4 implementation contains solid foundations (quarantine lifecycle, checked-in cancellation safety guard, safe linking immutability, card hygiene, and before/after mutation diffs are all working well). However, **two critical defects prevent safe production operation**:
1. **Critical Overbooking Vulnerability in `handleOtaModification`**: Conflict detection on the active flat is non-functional due to string primitive passing.
2. **False-Positive Ambiguous Match Storm in `reconciler.mjs`**: Multiple unrelated guests on the same dates/channel are wrongly classified as ambiguous duplicates.

**Verdict: REQUEST_CHANGES**. The worker must implement the remediations detailed below before Milestone 4 can pass Gate 4.

### Concrete Remediations for Worker M4:
1. In `artifacts/api-server/wbp/availability.mjs:121` (and `scripts/wbp/availability.mjs:121`):
   ```javascript
   export function checkFlatBlockedOnNight(flat, nightDate, db = {}, options = {}) {
     const nowMs = Number(options.nowMs || Date.now());
     const flatObj = typeof flat === "object" && flat !== null ? flat : { number: String(flat) };
     const flatIdStr = flatObj.id != null ? String(flatObj.id) : "";
     const flatNumStr = flatObj.number != null ? String(flatObj.number) : "";
   ```
   And in `artifacts/api-server/wbp/inbox.mjs:571` (and `scripts/wbp/inbox.mjs:571`):
   ```javascript
   const currentFlatRef = { id: existing.flatId, number: existing.flatNumber };
   for (const night of nights) {
     const check = checkFlatBlockedOnNight(currentFlatRef, night, db, {
       excludeReservationId: existing.id
     });
   ```

2. In `artifacts/api-server/wbp/reconciler.mjs:284` & `341` (and `scripts/wbp/reconciler.mjs:284` & `341`):
   Enforce a minimum name similarity threshold for ambiguity:
   ```javascript
   // Only classify as ambiguous if there is plausible guest name similarity
   const isAmbiguous = !isSafeMatch && finalScore >= 50 && nameSim >= 0.50;
   const isNoMatch = !isSafeMatch && !isAmbiguous;
   ```

3. Ensure twin file SHA-256 parity is maintained across all 6 files in `artifacts/api-server/` and `scripts/`.

---

## 5. Verification Method

To independently reproduce and verify these findings:
1. Run the challenger test suite:
   ```powershell
   node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs
   ```
   Observe the 3 failing subtests pinpointing `handleOtaModification` reallocation, `MODIFICATION_CONFLICT`, and reconciler unrelated guest handling.
2. Verify production database hash remains unchanged:
   ```powershell
   node -e "const fs = require('fs'); const crypto = require('crypto'); console.log(crypto.createHash('sha256').update(fs.readFileSync('data/database.json')).digest('hex'));"
   ```
   Expected: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`.
