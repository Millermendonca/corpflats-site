# Reviewer 2 & Adversarial Critic Handoff Report — Milestone 4

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **Targeted Test Execution & Results**:
   - Command:
     ```powershell
     node --test tests/wbp-integration/m4-reservations-inbox.test.mjs
     ```
   - Result:
     ```
     # tests 22
     # suites 8
     # pass 22
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 3905.9439
     Exit code: 0
     ```

2. **Real Database & Audit Log Integrity**:
   - `data/database.json` SHA-256: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882` (100% untouched).
   - In `artifacts/api-server/demo-server.mjs:6869`, `AUDIT_LOG_FILE` isolates audit logs to `os.tmpdir()` when `NODE_ENV === "test"`.

3. **100% Twin File Parity**:
   All 6 pairs of mirrored files between `artifacts/api-server/` and `scripts/` have identical SHA-256 hashes:
   - `wbp/reconciler.mjs`: `55f7d555d8`
   - `wbp/alerts.mjs`: `37ac468af4`
   - `wbp/inbox.mjs`: `06b500d596`
   - `wbp/callbacks.mjs`: `e72e0f5795`
   - `wbp/ari-sync.mjs`: `83c3107c67`
   - `demo-server.mjs`: `eb27d671f0`

4. **Direct Code Inspection Findings**:
   - **Quarantine Triggers**:
     In `artifacts/api-server/wbp/inbox.mjs:409`:
     ```javascript
     reason, // OVERBOOKING | CONFLICT | MAINTENANCE_BLOCKED | CHECKED_IN_CANCELLATION | MODIFICATION_CONFLICT | AMBIGUOUS_MATCH | MALFORMED_PAYLOAD
     ```
     However, a project-wide search reveals that `MAINTENANCE_BLOCKED` and `MALFORMED_PAYLOAD` appear **only** in that comment. Neither `processIncomingOTA`, `allocateFairShareFlat`, nor `createWbpCallbackRouter` ever assigns or routes with `reason: "MAINTENANCE_BLOCKED"` or `reason: "MALFORMED_PAYLOAD"`.
     - When payload dates are missing or invalid, `normalizeOtaBooking` throws an error or `allocateFairShareFlat` returns `INVALID_DATES`, but `processIncomingOTA:801` unconditionally routes with hardcoded `reason: "OVERBOOKING"`.
     - When candidate flats are blocked due to maintenance (`flat_maintenance`, `room_block`, or `serviceOrders`), `allocateFairShareFlat` returns `reason: "OVERBOOKING"` and `processIncomingOTA` logs `OVERBOOKING`.
   - **Reconciliation Scoring ("Problema B")**:
     In `artifacts/api-server/wbp/reconciler.mjs:276-285`:
     ```javascript
     const finalScore = Math.max(0, Math.min(100, score));
     const qualifiesSafe = exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80;
     const isSafeMatch = qualifiesSafe;
     const isAmbiguous = !isSafeMatch && finalScore >= 50;
     ```
     When `exactChannelMatch` (20 pts), `exactDateMatch` (30 pts), and `nameSim >= 0.85` (25 pts) match, but there is no phone in the PMS and the price difference exceeds 2%, total score is `20 + 30 + 25 = 75 pts`.
     Because `qualifiesSafe` tests `finalScore >= 80`, `qualifiesSafe` evaluates to `false` and `isAmbiguous` evaluates to `true`, incorrectly sending a safe reservation to Quarantine as `AMBIGUOUS_MATCH`.
     Parent Directive 2026-10-14T02:04:36Z explicitly warned of this exact case:
     `"Problema B: hoje, se canal (20) + datas exatas (30) + nome com similaridade 0.85..0.94 (25 pts) e sem telefone/preço digitado no PMS = 75 pts < 80 → cairia em ambíguo... Correção: isSafeMatch DEVE exigir obrigatoriamente exactChannelMatch && exactDateMatch && nameSim >= 0.85 (e ajustar o score para >= 80 nesse caso)"`.
   - **Schedulers Unstarted in Server**:
     In `artifacts/api-server/demo-server.mjs:778`:
     `wbpWorker` and `wbpAlertsManager` are instantiated, but `wbpWorker.start()` and `wbpAlertsManager.startDailySummaryScheduler(db)` are never called. Consequently, background polling (every 30 min) and the 08:00 handover alert do not run autonomously in server operation.

---

## 2. Logic Chain

1. **Integrity & Functional Completeness of Quarantine Engine (Feature 20)**:
   - Observation: Dispatch Mission Item 2 commands: *"Verify all 7 quarantine triggers: OVERBOOKING, CONFLICT, MAINTENANCE_BLOCKED, CHECKED_IN_CANCELLATION, MODIFICATION_CONFLICT, AMBIGUOUS_MATCH, MALFORMED_PAYLOAD"*.
   - Logic: A comment listing 7 trigger names while the implementation contains code paths for only 5 triggers represents an incomplete implementation. An incoming payload with corrupted or invalid stay dates should not be labeled `OVERBOOKING` (which implies a capacity exhaustion issue rather than bad payload data), nor should a booking blocked by maintenance orders or room blocks be indistinguishable from pure capacity overbooking.
   - Inference: Both `MAINTENANCE_BLOCKED` and `MALFORMED_PAYLOAD` must be explicitly identified and routed to `db.wbpQuarantine`.

2. **Reconciler Determinism & Safe Link Guard (Feature 22)**:
   - Observation: Parent Directive 2026-10-14T02:04:36Z explicitly instructed adjusting the score to >= 80 when `exactChannelMatch && exactDateMatch && nameSim >= 0.85`.
   - Logic: In real PMS operations, hotel staff frequently enter guest reservations with only a name and dates, leaving phone numbers blank or recording gross OTA amounts that differ by more than 2% from net OTA totals. Under the current implementation, any such reservation achieves only 75 points. The condition `finalScore >= 80` fails, classifying the reservation as `isAmbiguous = true`.
   - Inference: The test passed only because the test fixture included an exact price match (`1100.00` vs `1100.00`) granting an extra 5 points to hit 80. In production, this causes legitimate matches to be wrongly quarantined.

3. **Autonomous Execution of Background Polling & Daily Alerts (Features 18 & 24)**:
   - Observation: `wbpWorker.start()` and `startDailySummaryScheduler(db)` are implemented in module classes but not called in `demo-server.mjs`.
   - Logic: F18 requires 30-minute background polling and F24 requires the 08:00 handover alert. While HTTP trigger endpoints exist, the system must trigger these routines autonomously when the integration is enabled in production (`process.env.NODE_ENV !== "test"`).
   - Inference: `demo-server.mjs` must start these background services when the integration is enabled and stop them when disabled.

---

## 3. Caveats

- In `tests/wbp-integration/m4-reservations-inbox.test.mjs`, all 22 test cases pass cleanly, demonstrating that the implemented features (Fair-share allocation, PropertyCollect handling, checked-in cancellation safety guard, structured diffs, WhatsApp/SERPRO automations, and PIX suppression) are structurally sound.
- No other caveats.

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

### Findings Summary:

1. **[Critical - Missing Implementation / Trigger Coverage]**:
   - **What**: Quarantine triggers `MAINTENANCE_BLOCKED` and `MALFORMED_PAYLOAD` are absent from execution logic despite being documented in `inbox.mjs:409`.
   - **Where**: `artifacts/api-server/wbp/inbox.mjs` and `scripts/wbp/inbox.mjs`.
   - **Fix**:
     - In `normalizeOtaBooking` / `processIncomingOTA`: safely catch missing/invalid dates and payload structures, routing to `db.wbpQuarantine` with `reason: "MALFORMED_PAYLOAD"`.
     - In `allocateFairShareFlat` / `processIncomingOTA`: when zero flats are available, inspect if the block is due to maintenance (`flat_maintenance`, `room_block`, or `serviceOrders`); if capacity was lost specifically to maintenance/blocks, route with `reason: "MAINTENANCE_BLOCKED"`.

2. **[Major - Logic Defect / Directive Non-Compliance]**:
   - **What**: Reconciler safe matching fails (`qualifiesSafe = false`, `isAmbiguous = true`) when `exactChannelMatch && exactDateMatch && nameSim >= 0.85` without contact or price match (score = 75 < 80).
   - **Where**: `artifacts/api-server/wbp/reconciler.mjs:276-285` and `scripts/wbp/reconciler.mjs`.
   - **Fix**:
     In `computeReconciliationScore`, ensure that when `exactChannelMatch && exactDateMatch && nameSim >= 0.85`, the score is adjusted to meet the threshold:
     ```javascript
     if (exactChannelMatch && exactDateMatch && nameSim >= 0.85) {
       score = Math.max(score, 80);
     }
     const finalScore = Math.max(0, Math.min(100, score));
     const qualifiesSafe = exactChannelMatch && exactDateMatch && nameSim >= 0.85 && finalScore >= 80;
     ```

3. **[Major - Schedulers Unstarted in Server Runtime]**:
   - **What**: `wbpWorker.start()` (30-min polling) and `wbpAlertsManager.startDailySummaryScheduler(db)` (08:00 handover alert) are never started in `demo-server.mjs`.
   - **Where**: `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
   - **Fix**:
     In `demo-server.mjs`, when `process.env.NODE_ENV !== "test"`:
     - On server boot: if `isWbpEnabled(db)`, start both schedulers.
     - In `POST /api/wbp/mode`: if mode becomes `auto`, start schedulers; if mode becomes `off`, stop schedulers.

4. **[Minor - Test Suite Gap]**:
   - **What**: `tests/wbp-integration/m4-reservations-inbox.test.mjs` does not assert quarantine routing for `CONFLICT`, `MODIFICATION_CONFLICT`, `MAINTENANCE_BLOCKED`, or `MALFORMED_PAYLOAD`.
   - **Where**: `tests/wbp-integration/m4-reservations-inbox.test.mjs`.
   - **Fix**: Add test cases covering these quarantine reasons.

---

## 5. Verification Method

To verify after the worker applies the requested changes:

1. Run the targeted M4 test suite:
   ```powershell
   node --test tests/wbp-integration/m4-reservations-inbox.test.mjs
   ```
   Assert all tests pass with code 0.

2. Verify Reconciler safe match without price/phone bonus:
   ```powershell
   node -e "import('./artifacts/api-server/wbp/reconciler.mjs').then(m => { const res = m.computeReconciliationScore({ channel: 'booking', checkinDate: '2026-11-20', checkoutDate: '2026-11-24', guestName: 'Lucas M. Ferreira' }, { channel: 'booking', checkinDate: '2026-11-20', checkoutDate: '2026-11-24', guestName: 'Lucas Ferreira' }); console.log('Score:', res.score, 'isSafeMatch:', res.isSafeMatch); if (!res.isSafeMatch) process.exit(1); });"
   ```
   Expected: `isSafeMatch: true`.

3. Verify 100% SHA-256 twin parity across all files:
   ```powershell
   node -e "const fs = require('fs'); const crypto = require('crypto'); const files = ['wbp/reconciler.mjs', 'wbp/alerts.mjs', 'wbp/inbox.mjs', 'wbp/callbacks.mjs', 'wbp/ari-sync.mjs', 'demo-server.mjs']; for (const f of files) { const h1 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/' + f)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('scripts/' + f)).digest('hex'); if (h1 !== h2) process.exit(1); } console.log('ALL TWINS MATCH 100%');"
   ```

4. Verify real database file remains untouched:
   ```powershell
   node -e "const fs = require('fs'); const crypto = require('crypto'); const h = crypto.createHash('sha256').update(fs.readFileSync('data/database.json')).digest('hex'); if (!h.startsWith('e37d74b7')) process.exit(1); console.log('DB OK');"
   ```
