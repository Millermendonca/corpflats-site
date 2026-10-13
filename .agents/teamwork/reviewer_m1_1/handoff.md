# Review & Adversarial Critic Report: Milestone 1 (Operational Safety, Storage & WBP Simulator)

**Reviewer**: Reviewer & Critic 1 (`reviewer_m1_1`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_1`  
**Target Milestone**: Milestone 1 (Operational Safety, Storage & WBP Simulator)  
**Recipient**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Verdict**: **APPROVE**  
**Date**: 2026-10-13T22:46:00Z  

---

## Review Summary

**Verdict**: **APPROVE**  
**Integrity Attestation**: **VERIFIED — ZERO INTEGRITY VIOLATIONS**.
No hardcoded test outputs, no facade implementations, no shortcuts bypassing intended tasks, and no fabricated logs or self-certifying mock shortcuts were detected. All components implement genuine logic, real I/O, authentic HTTP networking, and robust schema validation.

---

## 1. Observation

1. **Git Branch & Commit Hygiene:**
   - Command: `git branch --show-current` executed in Guest-Flow-Manager root returned `feature/wbp-integration`.
   - Command: `git status` confirmed `On branch feature/wbp-integration`, `Your branch is up to date with 'origin/feature/wbp-integration'`.
   - Command: `git log -n 1 --oneline` confirmed commit `13d5043 feat(wbp): implement Milestone 1 operational safety, durable storage & WBP simulator`.
   - Working tree has zero unstaged modifications in project source files; 11 audit log lines in `artifacts/api-server/audit_logs.jsonl` were preserved intact.

2. **SHA-256 Byte-for-Byte Twin Parity:**
   - Evaluated checksums across all twin pairs between `artifacts/api-server/` and `scripts/`:
     - `demo-server.mjs`: `94ab58374d761261d04c217523ec363450bc6ece570d223b66fb8caeee99d657` -> **MATCH**
     - `wbp/callbacks.mjs`: `6204e1e9df3fc236ac57c5e6436b69b61187928efb78b5eab0730e605730a5b8` -> **MATCH**
     - `wbp/client.mjs`: `faaae4b595d543d137b48467fadcbfe33457f38087dafa2e83a405d9f8250115` -> **MATCH**
     - `wbp/config.mjs`: `4d90469c16804acb06779600811bb222a0460bdefc9d04ed8051ee66686d0d84` -> **MATCH**
     - `wbp/storage.mjs`: `97df9d7d507b46518ac751684a1e17b04da76ab0bd26d182bf9cce6d2a06fb91` -> **MATCH**
   - Directory contents between `artifacts/api-server/wbp` and `scripts/wbp` are identical: `['callbacks.mjs', 'client.mjs', 'config.mjs', 'storage.mjs']`.

3. **Operational Safety Switch Implementation:**
   - `artifacts/api-server/wbp/config.mjs` (lines 27-37): `getIntegrationMode(db)` prioritizes `process.env.WBP_INTEGRATION_MODE` -> `db.settings.wbp_integration_mode` -> defaults to `'off'`.
   - `artifacts/api-server/wbp/client.mjs` (lines 118-124): Outbound call guard checks `mode === WBP_MODES.OFF && !options.bypassSwitch` and throws `WbpApiError` with code `1031`, making 0 outbound network requests.
   - `artifacts/api-server/wbp/callbacks.mjs` (lines 44-56): Inbound callback middleware intercepts all `/api/callback/wbp/*` requests when `mode === 'off'` and responds with HTTP 200 `{ ErrorCode: 1031, Error: "Integration disabled" }` without storing any payloads or mutating state.
   - `artifacts/api-server/wbp/callbacks.mjs` (lines 234-237): `WbpBackgroundWorker.start()` verifies `isWbpEnabled(this.db)` and returns immediately without registering any `setInterval` timers if mode is `'off'`.

4. **Durable Storage & Idempotency Engine:**
   - `artifacts/api-server/wbp/storage.mjs`:
     - Creates isolated relational tables `wbp_raw_payloads` and `wbp_idempotency` outside PostgreSQL `system_store` blob (lines 47-75).
     - When PostgreSQL is unavailable (local/test mode), creates insert-only `data/wbp_raw_payloads.jsonl` and atomic `data/wbp_idempotency.json` (lines 82-96).
     - `recordRawPayload()` is strictly insert-only and executes prior to any business logic processing (lines 151-191).
     - `claimForProcessing()` implements in-memory mutex locking (`_inFlightLocks`) and persistence checking to ensure exactly-once processing (lines 230-281).
     - `getUnprocessedPayloads()` detects unacknowledged payloads on startup to resume processing after process crashes (lines 345-392).

5. **Local WBP Simulator & Schema Validation:**
   - `e2e/wbp-simulator/schemas/index.mjs`: Implements regex-based UUID v4 (`UUID_V4_REGEX`), ISO dates (`ISO_DATE_REGEX`), and WBP version timestamp validation against `wbpAPI.yaml`, while tolerating documented Errata E1-E10.
   - `e2e/wbp-simulator/server.mjs`: Full Express mock server listening on dynamic ports with programmable failure injection (`setFailureMode`: 1001, 1002, 1102, delays, timeouts, drop connection) and callback dispatchers (`sendBookingCreate`, `sendNotifyBooking` with form-urlencoded, `sendARIFullRefresh`, `sendRoomInfo`).

6. **Targeted Test Execution:**
   - Command executed strictly in accordance with AGENTS.md:
     `node --test tests/wbp-integration/m1-safety-simulator.test.mjs`
   - Test Results:
     - Tests: 13 passed, 0 failed, 0 skipped, 0 cancelled.
     - Suites: 7 passed.
     - Exit Code: 0.
     - Duration: ~6.5s.

---

## 2. Logic Chain

1. **Safety Switch Effectiveness (Observation 3):**
   - Step 1: Default mode evaluates to `'off'` in absence of explicit configuration.
   - Step 2: In `'off'` mode, `WBPClient.request()` aborts with `WbpApiError(code 1031)` before network dispatch, guaranteeing 0 outbound calls.
   - Step 3: In `'off'` mode, callback router intercepts calls before storage insertion and returns `{ ErrorCode: 1031 }`.
   - Step 4: Background polling timer is not registered (`worker.intervalId === null`).
   - Conclusion: Operational safety switch is 100% inert when `'off'`, satisfying Requirement R1 and Acceptance Criterion 1.

2. **Storage Durability & Isolation (Observation 4):**
   - Step 1: Raw payloads are written to dedicated tables (`wbp_raw_payloads`) or dedicated files (`wbp_raw_payloads.jsonl`).
   - Step 2: The PMS main state is stored in `db` (JSONB `system_store` / `data/database.json`), which is pruned by `pruneDatabase()`.
   - Step 3: Test 4 directly verified that pruning `oversizedDb` truncated reservations to 800 and logs to 500, while `wbp_raw_payloads` retained all 25 raw payloads (100% immune).
   - Conclusion: Raw storage is isolated, insert-only, and completely immune to `pruneDatabase()`, satisfying R1 and Acceptance Criterion 4.

3. **Concurrency & Idempotency (Observation 4 & Test Suite):**
   - Step 1: 5 webhook deliveries and 3 polling deliveries for the same `OrderId` were dispatched concurrently via `Promise.all`.
   - Step 2: `claimForProcessing` allowed the first delivery to acquire the lock (`shouldProcess: true`), while the other 7 were rejected with `IN_FLIGHT` or `ALREADY_PROCESSED`.
   - Step 3: Exactly 1 reservation processing execution occurred, and all 8 raw payloads were preserved in the audit log.
   - Conclusion: Idempotency under multi-channel concurrent delivery is verified, satisfying R1 and Acceptance Criterion 2.

4. **WBP Client Spec Conformance (Observation 5 & Test Suite):**
   - Step 1: All 8 outbound methods (`healthCheck`, `setupProperty`, `getRoomTypes`, `getRatePlans`, `sendARIUpdate`, `getBookingList`, `getBookingId`, `ackBooking`) pass OpenAPI validation against the simulator.
   - Step 2: `adjustBookingVersion()` subtracts 5 minutes from `wbp_booking_version` per specification.
   - Step 3: Retry mechanism reuses the exact same UUID v4 `guid` across retry attempts upon transient timeouts or error code 1003. Non-retryable errors (1001, 1002, 1102) terminate immediately.
   - Conclusion: WBP client and simulator satisfy Requirement R2 and Acceptance Criteria.

5. **Memory & Parity Conformance (Observations 1 & 2):**
   - Step 1: `render.yaml`, `package.json`, and `server.mjs` configure `--max-old-space-size=1536`, leaving 512MB headroom on Render's 2GB plan.
   - Step 2: SHA-256 hashes of all twin files in `artifacts/api-server/` and `scripts/` are 100% identical.
   - Conclusion: System complies with AGENTS.md and R10.

---

## 3. Adversarial Challenges & Stress-Testing

| # | Assumption / Scenario Challenged | Adversarial Test Applied | Result | Blast Radius / Defense |
|---|----------------------------------|--------------------------|--------|------------------------|
| **C1** | Invalid integration mode in env (e.g., `WBP_INTEGRATION_MODE="true"`) | Tested `getIntegrationMode()` with arbitrary and malformed string values | **PASSED** | Defaults safely to `'off'`, preventing unintended activation |
| **C2** | Outbound leakage when switch is `'off'` | Invoked `client.healthCheck()` and `sendARIUpdate()` while `'off'` | **PASSED** | Client throws code 1031 prior to `fetch()`; simulator request history remained exactly 0 |
| **C3** | Raw storage truncation by database housekeeping | Ran simulated `pruneDatabase()` on bloated database collections | **PASSED** | Raw payloads stored in dedicated file/table; 0 payload loss |
| **C4** | Race condition under 8 concurrent webhook + polling deliveries | Dispatched 5x `BookingCreate` + 3x `GetBookingId` simultaneously | **PASSED** | Exactly 1 execution processed, 7 deduplicated, all 8 raw logs saved |
| **C5** | Process termination between raw storage and processing | Wrote unacknowledged payload, instantiated fresh storage instance | **PASSED** | `getUnprocessedPayloads()` recovered unacknowledged item for resumption |
| **C6** | GUID drift across retry attempts | Simulated delay > timeout on `GetBookingList` triggering 2 retries | **PASSED** | All 3 HTTP attempts sent to simulator contained the exact same `guid` |
| **C7** | NotifyBooking webhook content encoding | Simulator dispatched NotifyBooking via `application/x-www-form-urlencoded` | **PASSED** | Ingested and parsed correctly by PMS callback router |

---

## 4. Caveats

1. **Live Channel Manager Credentials:** No live production credentials exist yet; all verifications were conducted against the local OpenAPI-compliant WBP Simulator, which accurately reflects `wbpAPI.yaml` and documented errata.
2. **Pre-existing minor divergence in mail-service.mjs:** As documented in the codebase exploration, `scripts/mail-service.mjs` had an existing 2-line difference on lines 939-940 prior to this milestone. This was intentionally left untouched to prevent out-of-scope regressions.

---

## 5. Conclusion

Milestone 1 satisfies all functional, architectural, safety, and integrity requirements.
- Branch `feature/wbp-integration` is clean, committed, and pushed.
- Operational safety switch is 100% inert when `'off'`.
- Raw storage is durable, insert-only, and completely immune to pruning.
- WBP Client and Simulator adhere to Build-To-Us v1.0 specifications.
- Memory limit is upgraded to 1536MB.
- Twin file parity is 100% byte-for-byte identical.
- Targeted test suite passes with 13/13 tests and 0 failures.

Explicit Verdict: **APPROVE**.

---

## 6. Verification Method

To independently reproduce this verification:

1. **Verify Git Branch and Clean Working Tree:**
   ```powershell
   git branch --show-current
   # Output: feature/wbp-integration
   git status -s
   ```

2. **Verify SHA-256 Twin Parity:**
   ```powershell
   node -e "const fs = require('fs'), crypto = require('crypto'); const h = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); ['demo-server.mjs', 'wbp/config.mjs', 'wbp/storage.mjs', 'wbp/client.mjs', 'wbp/callbacks.mjs'].forEach(f => { const a = h('artifacts/api-server/' + f); const b = h('scripts/' + f); console.log(f + ': ' + (a === b ? 'MATCH' : 'MISMATCH')); });"
   ```

3. **Run Strictly Targeted Milestone 1 Test Suite:**
   ```powershell
   node --test tests/wbp-integration/m1-safety-simulator.test.mjs
   ```
   *Expected result: 13 passed, 7 suites passed, 0 failed.*
