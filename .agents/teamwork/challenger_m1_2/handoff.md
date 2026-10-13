# Handoff Report: Challenger 2 (Fault Injection, Timeout Handling & Schema Validation)

**Agent**: Challenger 2 (`challenger_m1_2`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\challenger_m1_2`  
**Recipient**: Orchestrator (`84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Verdict**: **APPROVE**  
**Date**: 2026-10-13T22:48:00Z  

---

## 1. Observation

1. **Adversarial Test Script Execution:**
   - Command: `node --test tests/wbp-integration/challenger-m1-faults.test.mjs`
   - Output:
     ```
     TAP version 13
     # Subtest: Challenger 2: Fault Injection, Timeout Handling & Schema Validation
         # Subtest: 1. OpenAPI Schema Validation: Rejection of Invalid Payloads
             ok 1 - schema validator rejects payloads missing common envelope fields (guid, pms_cid, shared_secret, verb)
             ok 2 - schema validator rejects endpoint-specific missing required fields across all verbs
             ok 3 - simulator HTTP server rejects invalid payload missing required fields with HTTP 400
             ok 4 - simulator HTTP server rejects ARIUpdate with invalid dates or missing inventory
             ok 5 - empirical probe: simulator behavior under default configuration (strictSchemas: false)
         ok 1 - 1. OpenAPI Schema Validation: Rejection of Invalid Payloads
         # Subtest: 2. Terminal Error Codes: Strict Non-Retry Behavior
             ok 1 - does NOT retry on Error 1001 (FAULT.OTA.LOGIN: Invalid credentials) — exactly 1 attempt
             ok 2 - does NOT retry on Error 1002 (FAULT.OTA.NOTENABLED: Channel not enabled) — exactly 1 attempt
             ok 3 - does NOT retry on Error 1102 (FAULT.OTA.CURRENCY: Currency mismatch) — exactly 1 attempt
             ok 4 - verifies terminal error non-retry across HealthCheck, GetBookingList, GetBookingId, AckBooking
         ok 2 - 2. Terminal Error Codes: Strict Non-Retry Behavior
         # Subtest: 3. Transient Errors & Timeouts: Retries and GUID Preservation
             ok 1 - retries on transient Error 1003 (FAULT.OTA.OFFLINE) reusing the EXACT SAME GUID across all attempts
             ok 2 - retries on transient Error 1004 (FAULT.OTA.BROKEN) reusing the EXACT SAME GUID
             ok 3 - succeeds when transient error recovers on retry attempt, preserving same GUID
             ok 4 - retries on HTTP timeout (delay > client timeoutMs) reusing the EXACT SAME GUID across attempts
             ok 5 - retries on network socket drop (connection dropped) reusing the EXACT SAME GUID
             ok 6 - caller-supplied custom GUID is preserved across retries and returned on ARIUpdate
         ok 3 - 3. Transient Errors & Timeouts: Retries and GUID Preservation
     ok 1 - Challenger 2: Fault Injection, Timeout Handling & Schema Validation
     # tests 15
     # suites 4
     # pass 15
     # fail 0
     # cancelled 0
     # skipped 0
     # duration_ms 1852.2768
     ```

2. **OpenAPI Schema Validation Inspection (`e2e/wbp-simulator/schemas/index.mjs`):**
   - Lines 34-40: `if (!body.guid) errors.push("Campo obrigatório 'guid' ausente."); else if (!UUID_V4_REGEX.test(body.guid)) ...` correctly rejects missing or malformed non-UUID v4 GUIDs.
   - Lines 42-52: Validates mandatory presence of `pms_cid` and `shared_secret`.
   - Lines 105-139: In `ARIUpdate`, validates ISO 3-letter currency, non-empty `Inventory` array, `start_date` and `end_date` formatting and chronological ordering (`start_date <= end_date`), non-negative integer `units`, and valid decimal `rate`.
   - Lines 153-163: Validates presence of `booking_id` on both `GetBookingId` and `AckBooking`.

3. **Simulator HTTP Server Schema Rejection (`e2e/wbp-simulator/server.mjs`):**
   - Lines 89-96:
     ```javascript
     const validation = validateRequest(verb, req.body, { tolerant: !this.strictSchemas });
     if (!validation.valid && this.strictSchemas) {
       return res.status(400).json({
         success: false,
         errors: validation.errors.map((msg, i) => ({ id: 4000 + i, msg }))
       });
     }
     ```
   - When configured with `strictSchemas: true`, simulator HTTP server returns HTTP 400 Bad Request with `{ success: false, errors: [...] }`.
   - When instantiated with default options (`this.strictSchemas` is `false`), line 91 evaluates to false, causing the simulator to return HTTP 200 `{ success: true }` without rejecting invalid payloads.

4. **Terminal Error Codes Non-Retry (`artifacts/api-server/wbp/client.mjs`):**
   - Lines 61-68:
     ```javascript
     isRetryableError(code) {
       const num = Number(code);
       return [3, 1003, 1004].includes(num);
     }
     ```
   - Lines 202-205:
     ```javascript
     if (err instanceof WbpApiError && !err.retryable) {
       throw err;
     }
     ```
   - For Error 1001 (Invalid login), Error 1002 (Channel not enabled), and Error 1102 (Currency mismatch), `isRetryableError` returns `false`, `retryable` is set to `false`, and the error is re-thrown immediately on attempt 1.
   - In our empirical tests across `SetupProperty`, `ARIUpdate`, `HealthCheck`, `GetBookingList`, `GetBookingId`, and `AckBooking`, exactly 1 request was logged by the simulator with 0 retries.

5. **Transient Errors, Timeout Handling & GUID Preservation:**
   - In `client.mjs` lines 127-144, the unique UUID v4 `guid` is generated once before the `while (attempt < maxAttempts)` loop or received from caller options:
     `const guid = options.guid || crypto.randomUUID();`
   - During transient errors (codes 1003, 1004), socket hangups (`dropConnection`), and timeouts (`AbortError`), the client retries up to `maxRetries: 2` (3 attempts total) with exponential backoff (`delay = this.backoffBaseMs * Math.pow(2, attempt - 1)`).
   - In all empirical tests, attempts 1, 2, and 3 transmitted the exact same `guid` byte-for-byte.
   - When a transient error resolved on attempt 3, the client succeeded and returned `{ success: true }`.

---

## 2. Logic Chain

1. **Schema Validation Integrity:** Observations 1 and 2 prove that `validateRequest()` strictly rejects missing common envelope fields (guid, verb, pms_cid, shared_secret), malformed UUIDs, and endpoint-specific fields across all 8 verbs.
2. **Terminal Non-Retry Rigor:** Observations 1 and 4 prove that the client never retries on fatal error codes 1001, 1002, and 1102, logging exactly 1 attempt on the server before immediately surfacing the failure to the application layer.
3. **Transient Idempotency & Fault Tolerance:** Observations 1 and 5 prove that the client handles network drops, timeouts, and transient channel outages by retrying with exponential backoff while preserving the identical GUID across all attempts, ensuring idempotency at the channel manager.
4. **Simulator Strict Mode Compatibility:** Observation 3 proves that when `strictSchemas: true` is enabled, the simulator faithfully enforces schema boundaries via HTTP 400 Bad Request.

---

## 3. Caveats

1. **Default Simulator Configuration Gap:** In `e2e/wbp-simulator/server.mjs`, schema validation rejection over HTTP requires `strictSchemas: true` (e.g. `new WBPSimulator({ strictSchemas: true })`). When using default options (`strictSchemas: false`), line 91 bypasses rejection. This does not impair Milestone 1 client correctness, but for subsequent milestones (M2–M4), workers should be instructed to instantiate `WBPSimulator({ strictSchemas: true })` or the team can make `strictSchemas: true` the default in `server.mjs`.

---

## 4. Conclusion

Milestone 1 satisfies all fault tolerance, timeout handling, and schema validation requirements.
All 15 adversarial tests in `tests/wbp-integration/challenger-m1-faults.test.mjs` pass cleanly with 0 failures.

**VERDICT**: **APPROVE**

---

## 5. Verification Method

To independently reproduce Challenger 2's empirical findings:

1. **Execute strictly isolated adversarial test suite:**
   ```powershell
   node --test tests/wbp-integration/challenger-m1-faults.test.mjs
   ```
   *Expected result: 15 passed, 0 failed, duration ~1.8s.*

2. **Invalidation Conditions:**
   - Any test failure in `tests/wbp-integration/challenger-m1-faults.test.mjs`.
   - Any modification that causes client retries on error codes 1001, 1002, or 1102.
   - Any modification causing transient retries to regenerate GUIDs instead of reusing the initial GUID.
