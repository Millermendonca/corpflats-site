# Handoff Report — Milestone 1 Challenger 1: Adversarial Stress & Concurrency Audit

**Agent**: m1_challenger_1 (Archetype: empirical challenger, Roles: critic, specialist)  
**Parent Agent**: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c  
**Timestamp**: 2026-10-11T14:03:00Z  
**Type**: Hard (Task Complete)  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### A. Baseline Verification
- Test command: `node --test tests/m1-reservation-modification-settlement.test.mjs`
- Verbatim result:
  ```
  # tests 15
  # suites 1
  # pass 15
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 5197.0731
  ```
  The worker's 15 unit tests pass in isolation when executed sequentially.

### B. Adversarial Edge Case Suite
- Test suite: `tests/challenger-m1-adversarial-modification.test.mjs` (25 tests covering 8 stress areas)
- Result: 24 passed, 1 failed.
  - **Passed Tests**:
    1. Inverted dates (`checkinDate > checkoutDate`): Rejected with 400 `INVALID_DATES` on `/modify-preview`, `/modify-checkout`, and `/modify`. Original database state intact.
    2. Equal dates (`checkinDate === checkoutDate`, 0 nights): Rejected with 400 `INVALID_DATES`.
    3. Malformed date formats (`"15/11/2026"`, `"not-a-date"`): Rejected with 400 `INVALID_DATES`.
    4. Negative guest counts (`-5`): Clamped safely to 1.
    5. Excessive guest counts (`999`): Clamped safely to 6.
    6. Non-existent flatId (`99999`): Returns 404 `FLAT_NOT_FOUND` in `/modify-preview`.
    7. Non-existent reservation code (`RES-GHOST-999`): Returns 404 across all 5 endpoints.
    8. Cancelled reservation (`status: "cancelada"`): Returns 400 `RESERVATION_CANCELLED`.
    9. Zero-amount price modifications: Correctly calculates `additionalAmountToPay: 0`, does not create unnecessary holds on `/modify-checkout`, and allows direct confirmation via `POST /modify` while setting `needsReSignature = true`.
    10. Expired holds: Polling `/modify-status` detects expiration, releases flat calendar immediately, and rejects exploit attempts to commit an expired hold.
    11. Tampered / mismatched `pendingId`: Returns 400 Bad Request on both `/modify-status` and `/modify-cancel-pending`.
    12. Server resilience: 100KB payload and SQL injection strings return clean 400/404 responses without server crashes or unhandled exceptions.
  - **Failed Test (Subtest 6.1)**:
    ```
    # Subtest: 6.1. 15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption
    not ok 1 - 6.1. 15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption
      ---
      duration_ms: 3843.3091
      failureType: 'testCodeFailure'
      error: |-
        Expected values to be strictly equal:
        
        6400 !== 800
        
      code: 'ERR_ASSERTION'
      name: 'AssertionError'
      expected: 800
      actual: 6400
    ```

### C. Minimal Bug Reproducer
- Test file: `tests/repro-concurrency-bug.test.mjs`
- Test command: `node --test tests/repro-concurrency-bug.test.mjs`
- Verbatim output:
  ```
  === REPRO RESULTS ===
  Initial totalAmount: 300, additional: 150
  Expected totalAmount: 450
  Actual totalAmount: 750
  Actual paidAmount: 750
  Actual payments count: 4 (expected: 2, 1 initial + 1 mod)
  Actual modificationHistory count: 3 (expected: 1)
  =====================
  # tests 1
  # suites 1
  # pass 1
  # fail 0
  ```
- **Code Inspection of Vulnerability**:
  - In `scripts/demo-server.mjs` (and `artifacts/api-server/demo-server.mjs`) lines 16298-16470:
    ```javascript
    app.get("/api/pms/guest-portal/:code/modify-status", async (req, res) => {
      ...
      if (!r.pendingModification) { ... }
      const pending = r.pendingModification;
      ...
      // Async operations (Inter PIX status check, Extrato check, Mercado Pago check)
      if (pending.pixTxId) {
        const cobData = await checkInterPixCobStatus(pending.pixTxId);
        ...
      }
      ...
      if (paymentVerified && paymentDetails) {
        const commitRes = await commitPendingModification(r, pending, paymentDetails);
        ...
      }
    ```
  - In `commitPendingModification(r, pending, ...)` lines 15616-15822:
    ```javascript
    export async function commitPendingModification(r, pending, ...) {
      ...
      r.totalAmount = oldTotalAmount + additionalPaid;
      r.paidAmount = oldPaidAmount + additionalPaid;
      ...
      r.payments.push(payRecord);
      ...
      r.modificationHistory.push({ ... });
      ...
      delete r.pendingModification; // ONLY deleted at step 8
    ```
  - Because `modify-status` yields control across `await` points before and during `commitPendingModification`, multiple concurrent polling requests (fired e.g. when the guest portal UI polls every 2 seconds, or from multiple browser tabs/devices) enter `modify-status` before the first request finishes deleting `r.pendingModification`.
  - Furthermore, `commitPendingModification` does NOT check whether `r.pendingModification` has already been deleted, does NOT check whether `pending.pendingId` was already committed in `r.modificationHistory`, and does NOT employ an in-memory lock/mutex.
  - Consequence: Each concurrent request commits the modification independently, compounding `r.totalAmount`, adding duplicate payment records to `r.payments`, and appending duplicate history entries to `r.modificationHistory`.

---

## 2. Logic Chain

1. **Premise**: In the CorpFlats Guest Portal architecture, guests stay on the payment checkout screen while a timer polls `GET /api/pms/guest-portal/:code/modify-status` every 2 to 3 seconds. Multiple requests can easily be in-flight concurrently (network jitter, slow upstream bank API calls, multiple tabs open, or aggressive client retries).
2. **Observation**: `GET /modify-status` performs multiple asynchronous `await` calls (e.g. querying Banco Inter or Mercado Pago). During these `await` suspension points, subsequent polling requests arrive and inspect `r.pendingModification`.
3. **Flaw**: Because `r.pendingModification` is not locked, marked as processing, or checked for prior commit:
   - Request A detects payment verified and calls `commitPendingModification(r, pending, paymentDetails)`.
   - While Request A is executing, Request B also sees `r.pendingModification` intact, verifies payment, and also calls `commitPendingModification(r, pending, paymentDetails)`.
   - Both invocations increment `r.totalAmount += additionalPaid` and push duplicate payment entries to `r.payments`.
4. **Empirical Proof**:
   - In `tests/repro-concurrency-bug.test.mjs`, firing just 3 concurrent requests multiplied `additionalPaid` 3 times: `totalAmount` became 750 BRL instead of 450 BRL, and `r.payments` recorded 4 payments instead of 2.
   - In `tests/challenger-m1-adversarial-modification.test.mjs`, 15 concurrent requests inflated the balance from 800 BRL to 6,400 BRL with 15 duplicate payments.
5. **Impact**: Critical financial data corruption in production (overcharging guest accounts, incorrect ledger reports, duplicate accounting records).

---

## 3. Caveats

- **Scope of Defect**: The race condition is isolated to concurrent calls to `GET /api/pms/guest-portal/:code/modify-status` when payment is verified.
- **Robust Areas**: All other aspects of Milestone 1 demonstrated exceptional resilience:
  - Inverted / equal / malformed dates are strictly rejected with 400 Bad Request.
  - Guest counts are bounded without server crashes.
  - Non-existent flats / reservations return 404 without leaking internal errors.
  - Cancelled reservations are blocked from modification.
  - Zero-amount modifications work cleanly without generating spurious holds.
  - Expired holds correctly prevent subsequent date commits.
  - The server handles 100KB payloads and injection characters without crashing or throwing unhandled exceptions.
- **Parity**: The twin-server files (`scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`) remained in byte-for-byte SHA-256 parity throughout testing.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

The implementer must resolve the concurrent double-commit vulnerability in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`:

### Recommended Mitigations for Implementer:
1. **Idempotency Guard in `commitPendingModification`**:
   - Check if `r.modificationHistory` already contains an entry for `pending.pendingId || pending.id`:
     ```javascript
     if (Array.isArray(r.modificationHistory) && r.modificationHistory.some(m => m.pendingId === pending.pendingId)) {
       return { success: true, alreadyCommitted: true, reservation: r };
     }
     ```
   - Check if `!r.pendingModification` or if `r.pendingModification.status === "committing"` before processing:
     ```javascript
     if (!r.pendingModification || r.pendingModification.status === "committing" || r.pendingModification.status === "paid") {
       return { success: true, alreadyCommitted: true, reservation: r };
     }
     ```
2. **Immediate In-Flight Lock in `/modify-status`**:
   - Before awaiting payment checks or commit, set:
     ```javascript
     if (r._isCommittingModification) {
       return res.json({ success: true, status: "pending", message: "Processando liquidação..." });
     }
     ```
     Or maintain an in-memory lock set: `const activeModificationLocks = new Set();` keyed by `r.code` or `pending.pendingId`.
3. **Synchronous Status Transition**:
   - As soon as payment is verified, mark `pending.status = "paid"` or delete `r.pendingModification` synchronously before awaiting external operations, ensuring any concurrent request immediately hits branch 1 (`if (!r.pendingModification)`).
4. **Maintain Parity**:
   - Apply identical edits to both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` to keep SHA-256 parity.

---

## 5. Verification Method

To verify the bug and subsequent fix, run:

1. **Minimal Concurrency Reproducer**:
   ```bash
   node --test tests/repro-concurrency-bug.test.mjs
   ```
   *Currently fails the single-commit invariant by producing `totalAmount: 750` instead of `450`.* Once fixed, `totalAmount` must equal `450`, `payments.length` must equal `2`, and `modificationHistory.length` must equal `1`.

2. **Comprehensive Adversarial Suite**:
   ```bash
   node --test tests/challenger-m1-adversarial-modification.test.mjs
   ```
   Expected result after fix: 25 passing tests, 0 failures, exit code 0.

3. **Baseline Milestone 1 Test Suite**:
   ```bash
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
   Must continue to pass 15/15 tests with exit code 0.
