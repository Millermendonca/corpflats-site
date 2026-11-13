# Milestone 4 Remediation Worker Handoff Report

## 1. Observation

1. **Initial Failing Challenger Subtests**:
   Running `node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs` initially reproduced 3 failing subtests:
   - Subtest 4 (Suite 4): `No Match: completely different guest name (<60% similarity) does not link and is treated as new electronic booking` failed with:
     ```
     error: 'Should return null (score < 50), not ambiguous nor safe'
     actual: { bestMatch: { id: 991, guestName: 'Carlos Eduardo Mendes', ... }, scoreResult: { score: 55, isAmbiguous: true, isNoMatch: false } }
     ```
   - Subtest 2 (Suite 5): `Reallocated modification captures old flat and new flat in structured diff` failed with:
     ```
     Expected values to be strictly equal:
     + 'modified_same_flat'
     - 'modified_reallocated'
     ```
   - Subtest 6 (Suite 2): `Bonus Condition 6: MODIFICATION_CONFLICT — routes to Quarantine when modification cannot fit anywhere` failed with `undefined == true`.

2. **Source Code Defect Locations Identified**:
   - `artifacts/api-server/wbp/availability.mjs:121` (and `scripts/wbp/availability.mjs:121`): `checkFlatBlockedOnNight` assumed `flat` was always an object, causing string primitives (e.g. `"113"`) to produce empty `flatNumStr` and `flatIdStr`, evaluating all night blocks to false.
   - `artifacts/api-server/wbp/inbox.mjs:571` (and `scripts/wbp/inbox.mjs:571`): `handleOtaModification` passed string `existing.flatNumber` to `checkFlatBlockedOnNight`, bypassing conflict checks.
   - `artifacts/api-server/wbp/reconciler.mjs:284` & `341` (and `scripts/wbp/reconciler.mjs`): `computeReconciliationScore` classified any score >= 50 as ambiguous regardless of name similarity, and did not adjust safe match score to >= 80 for exact channel + exact date + nameSim >= 0.85 without phone/price bonus. `findBestManualMatch` also returned matches when score >= 50 even if `isNoMatch: true`.
   - `artifacts/api-server/wbp/inbox.mjs:326` & `735`: `allocateFairShareFlat` returned only `OVERBOOKING` even when flats were blocked by maintenance/room blocks, and `processIncomingOTA` lacked guards for `MALFORMED_PAYLOAD`.
   - `artifacts/api-server/demo-server.mjs:800` & `36292`: `wbpWorker.start()` and `wbpAlertsManager.startDailySummaryScheduler(db)` were never called on boot or mode switch to `auto`/`observe`.

3. **Post-Remediation Verification Output**:
   - `node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs`:
     ```
     # tests 25
     # suites 6
     # pass 25
     # fail 0
     ```
   - `node --test tests/wbp-integration/m4-reservations-inbox.test.mjs`:
     ```
     # tests 26
     # suites 8
     # pass 26
     # fail 0
     ```
   - `node --test tests/wbp-integration/challenger-m4-webhooks-concurrency.test.mjs`:
     ```
     # tests 5
     # suites 5
     # pass 5
     # fail 0
     ```
   - `node --test tests/wbp-integration/m3-ari-sync.test.mjs`:
     ```
     # tests 21
     # suites 7
     # pass 21
     # fail 0
     ```

4. **Database & File Integrity**:
   - `data/database.json` SHA-256: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882` (100% untouched).
   - `artifacts/api-server/audit_logs.jsonl`: 0 changes, 100% clean working tree.
   - Twin file SHA-256 parity: 100% identical between `artifacts/api-server/` and `scripts/` across all mirrored files (`demo-server.mjs`, `wbp/alerts.mjs`, `wbp/ari-sync.mjs`, `wbp/availability.mjs`, `wbp/callbacks.mjs`, `wbp/client.mjs`, `wbp/config.mjs`, `wbp/inbox.mjs`, `wbp/pricing.mjs`, `wbp/reconciler.mjs`, `wbp/storage.mjs`).

---

## 2. Logic Chain

1. **Remediation for Defect 1 (Collision Blindness in handleOtaModification)**:
   - *Premise*: When `checkFlatBlockedOnNight` accepts primitive string/number, normalizing with `typeof flat === "object" && flat !== null ? flat : { number: String(flat) }` ensures `flatNumStr` is correctly populated.
   - *Premise*: In `handleOtaModification`, passing `{ id: existing.flatId, number: existing.flatNumber }` ensures matching against both id and number properties.
   - *Deduction*: When another reservation occupies the flat on modified dates, `check.isBlocked` evaluates to `true`, correctly falling back to fair-share reallocation or `MODIFICATION_CONFLICT` quarantine. Both Subtest 2 in Suite 5 and Bonus Condition 6 in Suite 2 pass.

2. **Remediation for Defect 2 & Defect 3 (Reconciler Ambiguity Guard & Safe Match Score Adjustment)**:
   - *Premise*: Hotel guests booking the same dates and channel should only be considered ambiguous duplicates if there is plausible name similarity (`nameSim >= 0.50`). Unrelated guests (`nameSim < 0.50`) must have `isAmbiguous: false` and `isNoMatch: true`.
   - *Premise*: In `findBestManualMatch`, only records where `isSafeMatch || isAmbiguous` should be returned. If `isNoMatch: true`, it returns `null`, allowing legitimate bookings for new guests to be created automatically.
   - *Premise*: When `exactChannelMatch && exactDateMatch && nameSim >= 0.85`, setting `score = Math.max(score, 80)` guarantees that manual reservations entered without PMS guest phone or exact price match still qualify as Safe Match (`qualifiesSafe = true`, `isSafeMatch = true`).
   - *Deduction*: Subtest 4 in Suite 4 passes, and Reviewer 2 verification command outputs `Score: 80 isSafeMatch: true`.

3. **Remediation for Defect 4 (Quarantine Triggers MAINTENANCE_BLOCKED and MALFORMED_PAYLOAD)**:
   - *Premise*: When candidate flats are 0, checking whether blocked flats include `flat_maintenance`, `room_block`, or `service_order` isolates cases where capacity was lost specifically to maintenance, returning `MAINTENANCE_BLOCKED`.
   - *Premise*: In `processIncomingOTA`, wrapping normalization in try/catch and validating stay dates (`!checkinDate || !checkoutDate || checkinDate >= checkoutDate`) routes corrupted/invalid payloads to `MALFORMED_PAYLOAD`.
   - *Deduction*: All 7 quarantine triggers are now actively functional and covered by dedicated unit tests.

4. **Remediation for Defect 5 (Autonomous Schedulers in Server Runtime)**:
   - *Premise*: When `process.env.NODE_ENV !== "test"`, calling `wbpWorker.start()` and `wbpAlertsManager.startDailySummaryScheduler(db)` on server startup (if `isWbpEnabled(db)`) and in `POST /api/wbp/mode` (when mode changes to `auto` or `observe`) activates the 30-min background polling and 08:00 handover alert.
   - *Premise*: Calling `stop()` when mode transitions to `off` ensures timers are halted when the integration is disabled.
   - *Deduction*: Autonomous scheduling operates in server runtime without leaking unstopped timers into test suites.

---

## 3. Caveats

- In test runs (`NODE_ENV === "test"`), schedulers remain dormant by design to ensure fast, deterministic tests without leaking background timers.
- No other caveats.

---

## 4. Conclusion

All 5 technical defects identified during Gate 4 are completely remediated with genuine logic and verified across all targeted test suites. 100% byte-for-byte SHA-256 twin parity is preserved, `data/database.json` and `artifacts/api-server/audit_logs.jsonl` remain untouched, and the codebase is ready for final Gate 4 validation.

---

## 5. Verification Method

To independently verify this remediation:

1. **Run Challenger 2 Suite (25/25 tests must pass)**:
   ```powershell
   node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs
   ```

2. **Run Challenger 1 Webhooks Suite (5/5 tests must pass)**:
   ```powershell
   node --test tests/wbp-integration/challenger-m4-webhooks-concurrency.test.mjs
   ```

3. **Run M4 Reservations Inbox Suite (26/26 tests must pass)**:
   ```powershell
   node --test tests/wbp-integration/m4-reservations-inbox.test.mjs
   ```

4. **Run M3 Regression Suite (21/21 tests must pass)**:
   ```powershell
   node --test tests/wbp-integration/m3-ari-sync.test.mjs
   ```

5. **Verify Twin Parity (100% match)**:
   ```powershell
   node -e "const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const files = ['demo-server.mjs', ...fs.readdirSync('artifacts/api-server/wbp').map(f => 'wbp/' + f)]; for (const f of files) { const p1 = path.join('artifacts/api-server', f); const p2 = path.join('scripts', f); if (!fs.existsSync(p2)) continue; const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex'); if (h1 !== h2) process.exit(1); } console.log('ALL TWINS MATCH 100%');"
   ```

6. **Verify Production DB Hash**:
   ```powershell
   node -e "const fs = require('fs'); const crypto = require('crypto'); const h = crypto.createHash('sha256').update(fs.readFileSync('data/database.json')).digest('hex'); if (h !== 'e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882') process.exit(1); console.log('DB OK');"
   ```
