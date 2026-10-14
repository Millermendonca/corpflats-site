# Handoff Report — Challenger 1: Vault Security, Reauth & Auto-Purge Stress

**Date**: 2026-10-14T04:53:00Z  
**From**: Challenger 1 (critic, specialist)  
**To**: Orchestrator (Conversation ID: `84d9f696-67d5-4529-bec4-c0232e9abea0`)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### Targeted Test Suite & Verbatim Output
- Authored isolated targeted test suite in `tests/wbp-integration/challenger-m5-vault-security.test.mjs` strictly adhering to `AGENTS.md` (isolated DB in `os.tmpdir()`, dynamic ports, `DATABASE_URL` deleted, `NODE_ENV="test"`).
- Executed exclusively via command:
  ```powershell
  node --test tests/wbp-integration/challenger-m5-vault-security.test.mjs
  ```
- **Verbatim Test Results**:
  ```
  TAP version 13
  # Subtest: Milestone 5 Challenger: Vault Security, Reauth & Auto-Purge Stress
      # Subtest: Challenge 1: Single-Use Token Burning Stress & Replay Flooding
          # Subtest: 1.1 Single-use token burning: 1st view succeeds, 10 concurrent replays 100% fail 403 Forbidden
          ok 1 - 1.1 Single-use token burning: 1st view succeeds, 10 concurrent replays 100% fail 403 Forbidden
          # Subtest: 1.2 Concurrent race condition flooding: 10 simultaneous requests with fresh token -> exactly 1 succeeds, 9 fail 403
          ok 2 - 1.2 Concurrent race condition flooding: 10 simultaneous requests with fresh token -> exactly 1 succeeds, 9 fail 403
      ok 1 - Challenge 1: Single-Use Token Burning Stress & Replay Flooding
      
      # Subtest: Challenge 2: Token Expiration Stress & Time Advance
          # Subtest: 2.1 Token expiration stress: simulated time advance past 5 minutes (301 seconds) is rejected with 403
          not ok 1 - 2.1 Token expiration stress: simulated time advance past 5 minutes (301 seconds) is rejected with 403
            ---
            duration_ms: 61.1199
            location: 'file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m5-vault-security.test.mjs:353:5'
            failureType: 'testCodeFailure'
            error: 'Expired token past 5 minutes MUST be rejected with HTTP 403 Forbidden. Got 200.'
            code: 'ERR_ASSERTION'
            name: 'AssertionError'
            expected: 403
            actual: 200
            operator: 'strictEqual'
            stack: |-
              TestContext.<anonymous> (file:///C:/Users/mille/OneDrive/Hotel/Documentos%20h%C3%B3spedes/Guest-Flow-Manager/tests/wbp-integration/challenger-m5-vault-security.test.mjs:394:14)
            ...
      not ok 2 - Challenge 2: Token Expiration Stress & Time Advance
      
      # Subtest: Challenge 3: Time-Travel Auto-Purge Stress
          # Subtest: 3.1 D+6 days card remains active; D+7 days card payload is permanently purged
          ok 1 - 3.1 D+6 days card remains active; D+7 days card payload is permanently purged
          # Subtest: 3.2 Reservation cancellation without penalty immediately purges card payload
          ok 2 - 3.2 Reservation cancellation without penalty immediately purges card payload
      ok 3 - Challenge 3: Time-Travel Auto-Purge Stress
      
      # Subtest: Challenge 4: Zero-Leakage Forensics & Anti-Exfiltration
          # Subtest: 4.1 Ingestion with known card & CVV produces ZERO plaintext occurrences across DB, state, logs and API
          ok 1 - 4.1 Ingestion with known card & CVV produces ZERO plaintext occurrences across DB, state, logs and API
      ok 4 - Challenge 4: Zero-Leakage Forensics & Anti-Exfiltration
  not ok 1 - Milestone 5 Challenger: Vault Security, Reauth & Auto-Purge Stress

  # tests 6
  # suites 5
  # pass 5
  # fail 1
  ```

### Code Observations
1. **`artifacts/api-server/wbp/vault.mjs` lines 450-460 & lines 480-490** (and twin `scripts/wbp/vault.mjs`):
   ```javascript
   createReauthToken(username, reservationId = null) {
     const token = crypto.randomUUID();
     const expiresInSeconds = 300; // 5 minutes
     const expiresAt = Date.now() + expiresInSeconds * 1000;
     ...
   }

   consumeReauthToken(token, reservationId = null) {
     if (!token || typeof token !== "string") return null;

     const entry = this._reauthTokens.get(token);
     if (!entry) return null;

     // Check expiration (strictly 5 minutes)
     if (Date.now() > entry.expiresAt || entry.used) {
       this._reauthTokens.delete(token);
       return null;
     }
     ...
   ```
2. **`artifacts/api-server/demo-server.mjs` lines 406-428**:
   The sandbox time-travel endpoint updates `global.__simulatedTimeOffsetMs`:
   ```javascript
   app.post("/api/test/time-travel", (req, res) => {
     const { offsetMs, targetHour, targetDate, reset } = req.body || {};
     if (reset) {
       global.__simulatedTimeOffsetMs = 0;
     } else if (typeof offsetMs === "number") {
       global.__simulatedTimeOffsetMs = offsetMs;
     ...
   ```
3. **Repository Standard for Time Travel**:
   Other time-sensitive services in the codebase (`artifacts/api-server/zapi-service.mjs`, `maid-automation-service.mjs`, and `demo-server.mjs`) consistently use `Date.now() + Number(global.__simulatedTimeOffsetMs || 0)` or `getEffectiveDate()`.
   `vault.mjs` completely ignores `global.__simulatedTimeOffsetMs`.
4. **Database Baseline Guard**:
   `data/database.json` SHA-256 remains `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882` (100% untouched).

---

## 2. Logic Chain

1. **Security Requirement (R6 & Feature 26)**:
   - Observation: Requirement R6 and Feature 26 dictate: "A visualização exige o token de redigitação de senha (expira em 5 min, uso único)".
   - Inference: A token issued at time $T$ must become invalid and rejected with HTTP 403 when consumed at any time $T' > T + 300\text{ seconds}$.
2. **Time-Travel Simulation**:
   - Observation: In `tests/wbp-integration/challenger-m5-vault-security.test.mjs`, a valid token was issued at $T$. The test advanced simulated time by 301 seconds using `POST /api/test/time-travel` with `{ offsetMs: 301000 }`.
   - Observation: Upon sending `POST /api/wbp/vault/view` with the token, the server returned **HTTP 200 OK** and decrypted the credit card payload, rather than rejecting with HTTP 403.
3. **Root Cause**:
   - Observation: `consumeReauthToken` compares `Date.now() > entry.expiresAt`. Because `Date.now()` reads the native unshifted hardware clock, and only a few milliseconds of wall-clock time elapsed, `Date.now() > entry.expiresAt` evaluated to `false`.
   - Inference: `CreditCardVault` is blind to `global.__simulatedTimeOffsetMs`. In any test or environment using time-travel to simulate elapsed time, tokens will NOT expire. Furthermore, if a server's time is adjusted via the time-travel simulation framework, credit cards remain exposed under tokens that should be expired.
4. **Auto-Purge & Zero-Leakage Robustness**:
   - Observation: Single-use burning (both serial replay and concurrent 10-request race condition), auto-purge on D+7 days, auto-purge on cancellation without penalty, and zero-leakage recursive scans across DB, raw payloads, logs, and API responses all PASSED with 0 violations.

---

## 3. Caveats

- In real wall-clock operation without time-travel simulation, waiting 301 real seconds would cause `Date.now()` to exceed `expiresAt`. However, all CI/CD, sandbox tests, and time-travel test harnesses depend on `global.__simulatedTimeOffsetMs`. Failing to integrate with `global.__simulatedTimeOffsetMs` causes time-travel tests to fail and violates the architecture specified in `ORIGINAL_REQUEST.md` (lines 161-164 and Verification Resources line 175).

---

## 4. Conclusion

**Verdict**: **REQUEST_CHANGES**

Worker `worker_m5_backend` must apply the following remediation to resolve the vulnerability:

1. **In `artifacts/api-server/wbp/vault.mjs` and `scripts/wbp/vault.mjs`**:
   Add a time resolution helper respecting `global.__simulatedTimeOffsetMs`:
   ```javascript
   function getEffectiveTimestamp() {
     return Date.now() + Number(global.__simulatedTimeOffsetMs || 0);
   }
   ```
   Use `getEffectiveTimestamp()` inside:
   - `createReauthToken`:
     ```javascript
     const expiresAt = getEffectiveTimestamp() + expiresInSeconds * 1000;
     ```
   - `consumeReauthToken`:
     ```javascript
     if (getEffectiveTimestamp() > entry.expiresAt || entry.used) {
       this._reauthTokens.delete(token);
       return null;
     }
     ```
   - `purgeExpiredCards`:
     ```javascript
     const effectiveNow = getEffectiveTimestamp();
     const defaultDate = new Date(effectiveNow).toISOString().slice(0, 10);
     const today =
       (typeof referenceDateOrOptions === "string"
         ? referenceDateOrOptions
         : referenceDateOrOptions?.currentDate) || defaultDate;
     ```
2. **In `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` line 1593**:
   Update `effectiveDate` fallback from `new Date().toISOString().slice(0, 10)` to `getTodayStr()`.
3. **Twin Parity**:
   Ensure identical byte-for-byte twin parity between `artifacts/api-server/` and `scripts/`.

---

## 5. Verification Method

Once `worker_m5_backend` applies the fix, verify independently with:
```powershell
node --test tests/wbp-integration/challenger-m5-vault-security.test.mjs
```
Expected result: **6 tests, 5 suites, 6 pass, 0 fail**.

Baseline database check:
```powershell
node -e "const crypto = require('crypto'); const fs = require('fs'); console.log(crypto.createHash('sha256').update(fs.readFileSync('data/database.json')).digest('hex'));"
```
Must output: `e37d74b7c78622903745709f781c92942be36732de878ac7543f6aeff7eb1882`.
