## 2026-10-14T03:02:47Z
You are the Milestone 4 Remediation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m4_fix`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m4_wbp_2\handoff.md` (detailed findings from Reviewer 2)
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m4_wbp_2\handoff.md` (exact bug reports and test cases from Challenger 2)

Your Mission:
Remediate the 5 technical defects identified during Gate 4:

1. Defect 1: Collision Blindness in `handleOtaModification` (Challenger 2 Finding 1)
   - In `artifacts/api-server/wbp/availability.mjs:121` (and mirror `scripts/wbp/availability.mjs`):
     `checkFlatBlockedOnNight` must safely handle primitive string or number `flat` values:
     ```javascript
     export function checkFlatBlockedOnNight(flat, nightDate, db = {}, options = {}) {
       const nowMs = Number(options.nowMs || Date.now());
       const flatObj = typeof flat === "object" && flat !== null ? flat : { number: String(flat) };
       const flatIdStr = flatObj.id != null ? String(flatObj.id) : "";
       const flatNumStr = flatObj.number != null ? String(flatObj.number) : "";
     ```
   - In `artifacts/api-server/wbp/inbox.mjs:571` (and mirror `scripts/wbp/inbox.mjs`):
     Pass structured flat reference:
     ```javascript
     const currentFlatRef = { id: existing.flatId, number: existing.flatNumber };
     for (const night of nights) {
       const check = checkFlatBlockedOnNight(currentFlatRef, night, db, {
         excludeReservationId: existing.id
       });
       if (check.isBlocked) {
         sameFlatFree = false;
         break;
       }
     }
     ```

2. Defect 2: False-Positive Reconciler Ambiguity for Unrelated Guests on Same Dates (Challenger 2 Finding 2)
   - In `artifacts/api-server/wbp/reconciler.mjs:284` & `341` (and mirror `scripts/wbp/reconciler.mjs`):
     Enforce a minimum name similarity threshold for ambiguity:
     ```javascript
     const qualifiesSafe = exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80;
     const isSafeMatch = qualifiesSafe;
     // Only classify as ambiguous if there is plausible guest name similarity
     const isAmbiguous = !isSafeMatch && finalScore >= 50 && nameSim >= 0.50;
     const isNoMatch = !isSafeMatch && !isAmbiguous;
     ```

3. Defect 3: Safe Match Score Adjustment (Reviewer 2 Finding 2 / Parent Directive "Problema B")
   - In `artifacts/api-server/wbp/reconciler.mjs` (and mirror `scripts/wbp/reconciler.mjs`), inside `computeReconciliationScore`:
     Ensure that when `exactChannelMatch && exactDateMatch && nameSim >= 0.85`, the score is adjusted to meet the threshold:
     ```javascript
     if (exactChannelMatch && exactDateMatch && nameSim >= 0.85) {
       score = Math.max(score, 80);
     }
     ```

4. Defect 4: Quarantine Triggers Coverage for `MAINTENANCE_BLOCKED` and `MALFORMED_PAYLOAD` (Reviewer 2 Finding 1)
   - In `artifacts/api-server/wbp/inbox.mjs` (and mirror `scripts/wbp/inbox.mjs`):
     - In `normalizeOtaBooking` / `processIncomingOTA`: safely catch missing or invalid stay dates or corrupted payload structure, routing to `db.wbpQuarantine` with `reason: "MALFORMED_PAYLOAD"`.
     - In `allocateFairShareFlat` / `processIncomingOTA`: when candidate flats are 0, check if capacity was lost specifically to maintenance/blocks (`flat_maintenance`, `room_block`, or `serviceOrders`); if so, route with `reason: "MAINTENANCE_BLOCKED"`.
     - In `tests/wbp-integration/m4-reservations-inbox.test.mjs`: add tests asserting quarantine routing for `MAINTENANCE_BLOCKED` and `MALFORMED_PAYLOAD`.

5. Defect 5: Autonomous Schedulers in Server Runtime (Reviewer 2 Finding 3)
   - In `artifacts/api-server/demo-server.mjs` (and mirror `scripts/demo-server.mjs`):
     When `process.env.NODE_ENV !== "test"`:
     - On server boot: if `isWbpEnabled(db)`, start `wbpWorker.start()` and `wbpAlertsManager.startDailySummaryScheduler(db)`.
     - In `POST /api/wbp/mode`: if mode changes to `auto`, start schedulers; if mode becomes `off`, stop schedulers.

6. Twin Parity:
   - Ensure 100% byte-for-byte SHA-256 parity between `artifacts/` and `scripts/` across all modified twin file pairs:
     `availability.mjs`, `inbox.mjs`, `reconciler.mjs`, `demo-server.mjs`, `alerts.mjs`, `callbacks.mjs`, `ari-sync.mjs`.

7. Run Targeted Tests (exclusively!):
   - `node --test tests/wbp-integration/challenger-m4-quarantine-reconciliation.test.mjs` (all 25/25 tests must pass, 0 fail!).
   - `node --test tests/wbp-integration/challenger-m4-webhooks-concurrency.test.mjs` (all pass, 0 fail!).
   - `node --test tests/wbp-integration/m4-reservations-inbox.test.mjs` (all pass, 0 fail!).
   - `node --test tests/wbp-integration/m3-ari-sync.test.mjs` (all pass, 0 fail!).
   - Verify `data/database.json` baseline SHA-256 (`e37d74b7...`) and `artifacts/api-server/audit_logs.jsonl` remain 100% untouched.

8. Git Commit & Push:
   - Verify branch is `feature/wbp-integration`.
   - Commit and `git push` to `origin feature/wbp-integration`.
   - Write handoff report in `handoff.md` in your working directory and notify orchestrator.
