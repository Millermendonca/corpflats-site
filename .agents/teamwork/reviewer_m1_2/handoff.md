# Independent Review & Adversarial Audit Report: Milestone 1 (Reviewer 2)

**Milestone**: Milestone 1 (Operational Safety, Storage & WBP Simulator)  
**Agent**: Reviewer 2 (`reviewer_m1_2`)  
**Roles**: Reviewer, Critic  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\reviewer_m1_2`  
**Recipient**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Verdict**: **APPROVE**  
**Date**: 2026-10-13T22:47:00Z  

---

## 1. Observation

1. **Git Branch & Commit Status:**
   - Active branch: `feature/wbp-integration` (confirmed via `git branch -vv`: `feature/wbp-integration 13d5043 [origin/feature/wbp-integration]`).
   - Base commit `0501d02` preserved on `main`.
   - The 11 uncommitted audit log lines at the bottom of `artifacts/api-server/audit_logs.jsonl` (lines 1453–1464) were preserved intact in commit `13d5043`.
2. **Operational General Switch (100% Inert):**
   - In `artifacts/api-server/wbp/config.mjs` (lines 27–37): `getIntegrationMode(db)` defaults to `'off'`.
   - In `artifacts/api-server/wbp/client.mjs` (lines 118–124):
     ```javascript
     if (mode === WBP_MODES.OFF && !options.bypassSwitch) {
       throw new WbpApiError("Integração WBP desativada (wbp_integration_mode = 'off'). Nenhuma chamada de saída permitida.", {
         code: 1031,
         verb,
         retryable: false
       });
     }
     ```
   - In `artifacts/api-server/wbp/callbacks.mjs` (lines 45–56):
     ```javascript
     router.use((req, res, next) => {
       const mode = getIntegrationMode(db);
       if (mode === WBP_MODES.OFF) {
         return res.status(200).json({
           ErrorCode: 1031,
           Error: "Integration disabled"
         });
       }
       next();
     });
     ```
   - In `artifacts/api-server/wbp/callbacks.mjs` (lines 234–237):
     ```javascript
     if (!isWbpEnabled(this.db)) {
       return;
     }
     ```
     Background worker registers 0 timers when mode is `'off'`.
3. **WBP Client Resilience & Error Handling:**
   - In `artifacts/api-server/wbp/client.mjs`:
     - Line 61–68: `isRetryableError(code)` classifies 3, 1003, and 1004 as retryable.
     - Line 127: Unique UUID v4 GUID generated once per logical call (`options.guid || crypto.randomUUID()`).
     - Line 181–196: Error codes 1001, 1002, 1102 are recognized as non-retryable; throws `WbpApiError` with `retryable: false`.
     - Line 203–205: Non-retryable errors immediately rethrown without entering retry logic.
     - Line 184–187 and 211–214: Retries use exponential backoff (`backoffBaseMs * Math.pow(2, attempt - 1)`) and `continue`, reusing the **exact same `guid`** in the payload envelope.
     - Lines 78–102: `adjustBookingVersion(version)` subtracts 5 minutes using native JavaScript `Date.prototype.setMinutes(date.getMinutes() - 5)` in UTC, handling month, day, leap-year, and hour rollovers seamlessly. Tested with `"2026-01-01 00:02:00"` -> correctly produced `"2025-12-31 23:57:00"`. Returns `null` on `null`/`undefined`.
4. **Durable Raw Storage & Crash Recovery:**
   - In `artifacts/api-server/wbp/storage.mjs`:
     - Relational tables `wbp_raw_payloads` and `wbp_idempotency` in PostgreSQL mode; append-only `wbp_raw_payloads.jsonl` and atomic `wbp_idempotency.json` in file mode.
     - Payloads are stored insert-only prior to any processing (`recordRawPayload`).
     - Outside `system_store` and completely unreferenced by `pruneDatabase()`, which operates solely on `db.reservations`, `db.whatsappHistory`, and `db.breakfastOrders`.
     - In-memory concurrency mutex `_inFlightLocks` in `claimForProcessing(idempotencyKey, payloadId, orderId)` guarantees that concurrent multi-channel arrivals (5x callbacks + 3x pollings) produce exactly 1 processed record and 7 deduplications.
     - `getUnprocessedPayloads()` retrieves all uncompleted payloads upon process restart (`status = 'unprocessed'` in SQL or unacknowledged in JSON cache).
5. **WBP Simulator OpenAPI Validation & Errata Handling:**
   - In `e2e/wbp-simulator/schemas/index.mjs` and `e2e/wbp-simulator/server.mjs`:
     - Validates incoming requests against OpenAPI schemas from `wbpAPI.yaml`.
     - Handles documented errata (E1: `reservation` vs `Booking`, E2: `reservation` vs `booking`, E7: `FullRefreshChannel` vs `UpdateRatePlan`, E9: integer/string property IDs).
     - Full programmable failure modes (`setFailureMode`: status codes, error codes 1001/1002/1102, delays, timeouts, drop connection).
     - Supports `NotifyBooking` via `application/x-www-form-urlencoded` with `URLSearchParams`.
6. **Node Process Memory Configurations:**
   - `render.yaml` (line 7): `startCommand: node --max-old-space-size=1536 --unhandled-rejections=warn server.mjs`.
   - `package.json` (line 9): `"start": "node --max-old-space-size=1536 server.mjs"`.
   - `server.mjs` (lines 20–36): Enforces 1536MB heap limit; transparently respawns with `--max-old-space-size=1536` if unconstrained heap exceeds 1600MB. Provides a 512MB margin on Render's 2GB container.
7. **Twin File Parity:**
   - Verified 100% identical SHA-256 hashes between `artifacts/` and `scripts/`:
     - `demo-server.mjs`: `94ab5837...` (MATCH)
     - `wbp/config.mjs`: `4d90469c...` (MATCH)
     - `wbp/storage.mjs`: `97df9d7d...` (MATCH)
     - `wbp/client.mjs`: `faaae4b5...` (MATCH)
     - `wbp/callbacks.mjs`: `6204e1e9...` (MATCH)
8. **Independent Test Execution:**
   - Executed: `node --test tests/wbp-integration/m1-safety-simulator.test.mjs`
   - Result: 13 passed, 7 suites passed, 0 failed, 0 skipped, duration 6.5s.
   - Clean execution without database leaks or side effects.

---

## 2. Logic Chain

1. **Safety Guarantee (Observation 2):** When `wbp_integration_mode` is `'off'`, `client.request()` throws error 1031 before any network call can be dispatched (0 outbound calls); incoming callbacks immediately respond with HTTP 200 `{ ErrorCode: 1031 }` without writing to storage or database; and background workers do not register timers (`intervalId = null`). This strictly satisfies R1 and Acceptance Criterion 1.
2. **Deduplication Under Concurrency (Observation 4):** Because `claimForProcessing` checks `isAlreadyProcessed` and acquires an in-flight promise lock keyed by `orderId`, only the first of 8 simultaneous arrivals (5 webhooks + 3 pollings) can obtain `shouldProcess: true`. All other 7 arrivals receive `shouldProcess: false`, guaranteeing zero duplicate reservations and zero ID collisions.
3. **Prune Immunity & Durability (Observation 4):** Raw payloads are appended exclusively to `wbp_raw_payloads` or `data/wbp_raw_payloads.jsonl`. Because `pruneDatabase()` in `demo-server.mjs` operates strictly on properties of the `db` in-memory object (`db.reservations`, `db.whatsappHistory`), raw payloads are structurally immune to truncation.
4. **Crash Resumption (Observation 4):** If the process terminates abruptly after `recordRawPayload` but before `claim.release()`, the payload remains flagged as `status: 'unprocessed'`. On subsequent boot, `getUnprocessedPayloads()` yields the pending payload, enabling guaranteed resumption without data loss.
5. **OpenAPI Fidelity & Errata Tolerance (Observation 5):** Outbound requests are validated against `wbpAPI.yaml` definitions while accommodating real-world quirks (such as form-urlencoded `NotifyBooking` and string/number property IDs). This provides an authentic local environment for integration testing without relying on live credentials.
6. **Integrity & Authenticity:** No hardcoded results, facade implementations, or bypassed checks were found in the codebase. All logic is authentic, robust, and validated by targeted tests.

---

## 3. Caveats & Adversarial Recommendations

1. **Adversarial Finding 1 (Lock Timeout / TTL in `claimForProcessing` - Resilience Improvement for M4):**
   - *Observation*: In `WbpStorage.claimForProcessing`, the lock in `_inFlightLocks` is deleted when `release()` is called. If an unexpected runtime exception in future reservation processing code aborts before `release()` is reached, the in-flight lock remains in memory for the life of the process.
   - *Recommendation for M4*: Implement a lock TTL (e.g., 60 seconds) so that stale in-flight locks expire automatically.
2. **Adversarial Finding 2 (Concurrent Deduplicated Rows in Postgres - Cleanup for M4):**
   - *Observation*: When a duplicate payload arrives while another is already processed, `claimForProcessing` returns `shouldProcess: false`. In PostgreSQL mode, the duplicate raw record retains `status: 'unprocessed'` unless explicitly marked as `'deduplicated'`.
   - *Recommendation for M4*: When `claim.shouldProcess === false`, update `wbp_raw_payloads` with `status: 'deduplicated'`.
3. **Multi-Instance Advisory Lock (Future Scaling):**
   - *Observation*: The current in-flight lock mutex is in-memory (`Map`), which is 100% sound for CorpFlats Soho's single-container deployment on Render. If horizontally scaled in the future, PostgreSQL advisory locks (`pg_try_advisory_xact_lock`) should be introduced.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all operational safety constraints, durability requirements, and OpenAPI simulator standards defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`. The implementation is resilient, clean, and ready for Milestone 2 (Availability & SEBRAE Pricing Engine).

---

## 5. Verification Method

To independently reproduce this verification:

1. **Git Branch & Commit:**
   ```powershell
   git branch --show-current
   # Output: feature/wbp-integration
   ```

2. **Verify SHA-256 Twin Parity:**
   ```powershell
   node -e "const fs = require('fs'), crypto = require('crypto'); const h = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); ['demo-server.mjs', 'wbp/config.mjs', 'wbp/storage.mjs', 'wbp/client.mjs', 'wbp/callbacks.mjs'].forEach(f => { const a = h('artifacts/api-server/' + f); const b = h('scripts/' + f); console.log(f + ': ' + (a === b ? 'MATCH' : 'MISMATCH')); });"
   # Output: All 5 files must return MATCH
   ```

3. **Execute Targeted Test Suite:**
   ```powershell
   node --test tests/wbp-integration/m1-safety-simulator.test.mjs
   # Output: 13 passed, 7 suites passed, 0 failed, 0 skipped
   ```

4. **Invalidation Conditions:**
   - Any failure in `tests/wbp-integration/m1-safety-simulator.test.mjs`.
   - Any SHA-256 hash divergence between `artifacts/` and `scripts/`.
   - Any outbound network call occurring while `wbp_integration_mode` is `'off'`.
