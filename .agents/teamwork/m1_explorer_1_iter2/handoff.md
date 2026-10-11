# Handoff Report — Milestone 1 Explorer 1 (Iteration 2)
## Concurrency Race Condition & Idempotency Analysis

**Agent**: m1_explorer_1_iter2 (Roles: explorer, investigator, analyst)  
**Parent Agent**: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c  
**Date**: 2026-10-11T14:18:00Z  
**Type**: Hard (Task Complete)  

---

## 1. Observation

- **The Concurrency Failure in Subtest 6.1**:
  - Command: `node --test tests/challenger-m1-adversarial-modification.test.mjs`
  - Verbatim error output in Challenger 1 and Reviewer 1 runs:
    ```
    # Subtest: 6.1. 15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption
    not ok 1 - 6.1. 15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption
      error: Expected values to be strictly equal:
      6400 !== 800
      operator: 'strictEqual'
      expected: 800
      actual: 6400
    ```
- **Code Inspection in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`**:
  - Lines 16298–16328: In `GET /api/pms/guest-portal/:code/modify-status`, `if (!r.pendingModification)` is evaluated at the start of the request.
  - Lines 16385–16450: The endpoint performs asynchronous `await` calls:
    - Line 16387: `await checkInterPixCobStatus(pending.pixTxId);`
    - Line 16409: `await checkInterBankingExtratoPixForPending(r, pending);`
    - Line 16430: `await checkMercadoPagoPaymentByRef(mpSearchRef);`
    Even when `simulatePayment === true` is passed, line 16385 `if (pending.pixTxId)` is true because `modify-checkout` always assigns a `pixTxId`. Thus, every incoming request yields at `await checkInterPixCobStatus`.
  - While Request 1 is suspended at the await, Requests 2 through 15 enter `/modify-status`, observe `r.pendingModification` is still present, and also yield at the await.
  - Lines 15616–15822: `commitPendingModification` unconditionally executes:
    - `r.totalAmount = oldTotalAmount + additionalPaid;` (line 15660)
    - `r.paidAmount = oldPaidAmount + additionalPaid;` (line 15661)
    - `r.payments.push(payRecord);` (line 15680)
    - `r.modificationHistory.push({ ... });` (line 15698)
    - `delete r.pendingModification;` (Step 8, line 15821).
  - There was **zero checking** of `r.modificationHistory` or `r.payments` for `pending.pendingId`, and no mutex or locking map. Each of the 15 requests called `commitPendingModification` sequentially upon waking, inflating `totalAmount` to R$ 6,400 with 15 duplicate payment records.
- **Client Assertion Requirements in Subtest 6.1**:
  - In lines 667–674 of `tests/challenger-m1-adversarial-modification.test.mjs`, all 15 concurrent responses assert:
    `assert.equal(res.status, 200);`
    `assert.equal(data.success, true);`
    `assert.equal(data.paid, true);`
    `assert.equal(data.status, "paid");`
    `assert.equal(data.committed, true);`
  - This proves that returning `{ status: "pending" }` on lock contention is **insufficient** and would fail the test. The requests must await the active in-flight commit Promise and return the completed settlement response.

---

## 2. Logic Chain

1. In hotel guest portals, clients routinely poll `GET /modify-status` every 2 to 3 seconds, or across multiple tabs and devices.
2. Under concurrent requests, asynchronous I/O (`await`) causes execution control to yield back to the event loop.
3. Because `r.pendingModification` was only deleted at the end of `commitPendingModification` and no mutex existed, all concurrent requests bypassed the `!r.pendingModification` guard.
4. Because `commitPendingModification` was not idempotent, every concurrent invocation mutated balances and appended payment records.
5. To guarantee exactly-once execution:
   - A module-level in-flight lock map (`activeModificationLocks = new Map()`) keyed by reservation code / pendingId must store the in-flight commit execution Promise.
   - Any request arriving while a commit is in-flight must await `activeModificationLocks.get(lockKey)`. When the Promise resolves, it returns the committed status without executing duplicate work.
   - An idempotency guard at the very top of `commitPendingModification` must check if `pending.pendingId` has already been recorded in `r.modificationHistory` or `r.payments`. If so, it immediately returns `{ success: true, alreadyCommitted: true, committed: true, reservation: r }` without modifying balances or pushing records.
6. This 4-layer defense guarantees both single-threaded sequential and high-concurrency burst safety with zero balance corruption.

---

## 3. Caveats

1. **Subtest 2.2 Guest Count Clarification**:
   - Reviewer 1's report noted a potential edge case where `newGuestCount: 0` fell back to `r.guestCount: 2`.
   - Inspection of `tests/challenger-m1-adversarial-modification.test.mjs` line 368 confirms Subtest 2.2 is titled *"Zero guest count (0) falls back to existing reservation guest count (2) without crash"* and explicitly asserts `data.newDates.guestCount === 2`.
   - The implementer **must NOT** change the guest count logic in `modify-preview` to clamp 0 to 1, as that would fail Subtest 2.2.
2. **Reproducer Test Assertion Inversion**:
   - `tests/repro-concurrency-bug.test.mjs` was authored to assert that the bug *was present* (`assert.ok(hasDoubleCommitBug)`).
   - Once the fix is applied, that assertion must be inverted to assert the corrected invariants (`r.totalAmount === 450`, `r.payments.length === 2`, `r.modificationHistory.length === 1`), as detailed in `analysis.md` section 7.
3. **Twin-Server SHA-256 Parity**:
   - Both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` must receive identical modifications and be verified with `Get-FileHash`.

---

## 4. Conclusion

The concurrency race condition and balance inflation vulnerability is fully analyzed, and an exact production-grade code blueprint has been documented in `analysis.md`.

### Concrete Blueprint for Implementer (`m1_worker`):
1. **Declare lock map** in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` above line 15615:
   `const activeModificationLocks = new Map();`
2. **Add idempotency check** in `commitPendingModification` (lines 15624–15640):
   Check if `targetPendingId` exists in `r.modificationHistory` or `r.payments`. If true, return `{ success: true, alreadyCommitted: true, committed: true, reservation: r }`.
3. **Add entry guard** in `GET /modify-status` (line 16298):
   If `activeModificationLocks.has(lockKey)`, await the lock Promise and return the committed JSON response.
4. **Wrap commit execution in mutex** in `GET /modify-status` Step 6 (line 16452):
   Check lock, register `activeModificationLocks.set(lockKey, commitPromise)`, execute `commitPendingModification`, clean up in `finally` block, and return committed response.
5. **Update test assertions** in `tests/repro-concurrency-bug.test.mjs` to verify `totalAmount === 450`, `payments.length === 2`, `modificationHistory.length === 1`.
6. **Ensure SHA-256 parity** between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.

---

## 5. Verification Method

To independently verify the implementation:

```powershell
# 1. SHA-256 Twin Parity Verification
Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256

# 2. Syntax Check
node --check scripts/demo-server.mjs
node --check artifacts/api-server/demo-server.mjs

# 3. Core Settlement Test Suite (15/15 passing)
node --test tests/m1-reservation-modification-settlement.test.mjs

# 4. Adversarial Concurrency Test Suite (25/25 passing, verifying 6.1 passes with 800 BRL)
node --test tests/challenger-m1-adversarial-modification.test.mjs

# 5. Concurrency Bug Regression Suite
node --test tests/repro-concurrency-bug.test.mjs

# 6. Baseline System Checks
node --test tests/bot-actions-api.test.mjs
node --test tests/tariff-engine.test.mjs
```
