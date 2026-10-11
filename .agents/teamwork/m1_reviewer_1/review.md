# Review & Adversarial Challenge Report — Milestone 1 (Reservation Modification Settlement Engine)

**Reviewer**: m1_reviewer_1 (Roles: reviewer, critic)  
**Parent Agent**: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c  
**Date**: 2026-10-11T14:02:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Review Summary

The implementation of Milestone 1 provides a well-structured foundation for the reservation modification flow:
- `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` maintain strict 100% byte-for-byte SHA-256 parity (`E0AF6D18EA04702F6880FE9EFA9E50EBBBDAB895EF561CA2F69210A5523AD159`).
- Core endpoints (`/modify-preview`, `/modify-checkout`, `/modify-status`, `/modify-cancel-pending`, and direct guarded `/modify`) conform to the functional contract.
- The 15 sequential test cases in `tests/m1-reservation-modification-settlement.test.mjs` pass cleanly (15/15 passed, 0 failed, 8.05s).
- Baseline suites (`tests/bot-actions-api.test.mjs`, `tests/tariff-engine.test.mjs`) and the frontend production build (`artifacts/limpeza`) pass without regressions.
- No integrity violations (hardcoded test results or fake implementations) were found.

**HOWEVER**, under adversarial stress testing (`tests/challenger-m1-adversarial-modification.test.mjs`), a **CRITICAL race condition** was uncovered:
When multiple polling requests hit `GET /api/pms/guest-portal/:code/modify-status` concurrently during payment verification (a common real-world scenario with guest polling, multiple browser tabs, or webhook retries), `commitPendingModification` is executed asynchronously multiple times before `r.pendingModification` is cleaned up. This results in **duplicate payment records in `r.payments` and severe customer balance corruption** (in the stress test, balance was multiplied, setting `totalAmount` to R$ 6400 instead of R$ 800).

Because financial balance integrity is non-negotiable, the verdict is **REQUEST_CHANGES** to address this concurrency flaw before Milestone 1 clearance.

---

## 2. Findings

### [Critical] Finding 1: Concurrency Race Condition in `/modify-status` Leading to Multiple Commits & Balance Corruption

- **What**: Parallel or concurrent polling requests to `GET /api/pms/guest-portal/:code/modify-status` with confirmed payment result in `commitPendingModification` executing multiple times.
  - In adversarial stress testing (`tests/challenger-m1-adversarial-modification.test.mjs`, Challenge 6.1), 15 concurrent polling requests resulted in 14+ duplicate payment records added to `r.payments`, inflating `r.totalAmount` and `r.paidAmount` from the expected R$ 800 to R$ 6400.
- **Where**:
  - `scripts/demo-server.mjs` (and twin mirror `artifacts/api-server/demo-server.mjs`):
    - Lines 16452-16456 (inside `modify-status` handler):
      ```javascript
      if (paymentVerified && paymentDetails) {
        const commitRes = await commitPendingModification(r, pending, paymentDetails);
      ```
    - Lines 15616-15682 (inside `commitPendingModification`):
      ```javascript
      r.totalAmount = oldTotalAmount + additionalPaid;
      r.paidAmount = oldPaidAmount + additionalPaid;
      ...
      r.payments.push(payRecord);
      ```
    - Line 15821 (cleanup happens late after multiple awaits/operations):
      ```javascript
      delete r.pendingModification;
      ```
- **Why**:
  1. In `modify-status`, when multiple requests arrive concurrently, they all check `if (!r.pendingModification)`. Since `r.pendingModification` is present, all concurrent requests proceed.
  2. Each request performs `await checkInterPixCobStatus(...)`, `await checkInterBankingExtratoPixForPending(...)`, or simulated test check. During each `await`, the Node.js event loop processes the next request, meaning all concurrent requests reach `paymentVerified = true`.
  3. None of the requests mark `pending` as in-flight or locked (`_isCommitting` or `status = "committing"`) synchronously before yielding.
  4. Each request then invokes `await commitPendingModification(...)`. Inside `commitPendingModification`, `r.totalAmount` is incremented by `additionalPaid` and `payRecord` is pushed to `r.payments` for every invocation without verifying whether `r.payments` already contains an entry for `pending.pendingId` or whether `pending` was already settled.
- **Suggested Fix Direction**:
  1. **Idempotent Guard in `commitPendingModification`**:
     At the top of `commitPendingModification(r, pending, ...)`:
     ```javascript
     if (pending._committed || (Array.isArray(r.payments) && r.payments.some(p => p.pendingId && p.pendingId === pending.pendingId))) {
       return { success: true, committed: true, reservation: r, alreadyCommitted: true };
     }
     if (pending._committing) {
       return { success: true, committed: true, reservation: r, committing: true };
     }
     pending._committing = true;
     ```
  2. **Synchronous Immediate Flagging**:
     As soon as `paymentVerified` is detected, or at the immediate entry of `commitPendingModification`, set `pending._committing = true` before any async call or DB save.
  3. **Strict Payment Deduplication**:
     Verify that `r.payments.find(p => p.pendingId === pending.pendingId)` does not already exist before incrementing `r.totalAmount` or pushing into `r.payments`.

---

### [Minor] Finding 2: `newGuestCount: 0` Falsy Fallback Instead of Clamping to Minimum 1

- **What**: Passing `newGuestCount: 0` in `/modify-preview` or `/modify-checkout` does not clamp to 1, but instead falls back to the existing `r.guestCount` (e.g. 2).
- **Where**:
  - `scripts/demo-server.mjs` line 15932 and line 16098:
    ```javascript
    const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));
    ```
- **Why**: In JavaScript, `Number(0)` is `0`, which is falsy. Therefore, `Number(0) || r.guestCount` evaluates to `r.guestCount`.
- **Suggested Fix Direction**:
  Use explicit null/undefined check:
  ```javascript
  const rawGuests = newGuestCount != null ? Number(newGuestCount) : (r.guestCount || 1);
  const guestsNum = Math.max(1, Math.min(6, isNaN(rawGuests) ? (r.guestCount || 1) : rawGuests));
  ```

---

## 3. Verified Claims

| Claim | Method | Result | Notes |
|---|---|---|---|
| Twin-Server SHA-256 Parity | `Get-FileHash` across both files | **PASS** | Hash: `E0AF6D18EA04702F6880FE9EFA9E50EBBBDAB895EF561CA2F69210A5523AD159` |
| Node Syntax Check | `node --check` | **PASS** | Exit code 0 on both scripts |
| Worker Automated Suite | `node --test tests/m1-reservation-modification-settlement.test.mjs` | **PASS** | 15/15 tests passed (duration ~8.05s) |
| Baseline Bot Actions API | `node --test tests/bot-actions-api.test.mjs` | **PASS** | 5/5 tests passed |
| Baseline Tariff Engine | `node --test tests/tariff-engine.test.mjs` | **PASS** | 8/8 tests passed |
| Frontend Production Build | `npm run build` in `artifacts/limpeza` | **PASS** | Built cleanly in 55.94s |
| Calendar Hold Integration | Inspected `/reservations/availability`, `/quote`, `/bot-actions/*` | **PASS** | All routes check `r.pendingModification` |
| Direct `/modify` Security Guard | Simulated unpaid extension via POST `/modify` | **PASS** | Returns HTTP 402 `PAYMENT_REQUIRED` |
| Re-Signature Invalidation | Checked `needsReSignature`, `fnhrCompleted`, `preCheckinCompleted` | **PASS** | Fully reset on date/flat modification |
| Integrity Checks | Source grep for test fixtures / hardcoded results | **PASS** | Zero hardcoded test codes or fake mocks |

---

## 4. Adversarial Stress Test Results

Executed `node --test tests/challenger-m1-adversarial-modification.test.mjs`:
- Total Test Cases: 25 subtests across 8 challenge suites
- Passed: 23 subtests
- Failed: 2 subtests
  1. Challenge 2.2: `Zero guest count (0) is gracefully clamped to 1 without crash` -> FAILED (received 2 instead of 1 due to `||` falsy check).
  2. Challenge 6.1: `15 concurrent polling requests with payment confirmation commit exactly ONCE without duplicate payments or balance corruption` -> FAILED (totalAmount asserted `6400 !== 800` due to async concurrency race condition).

---

## 5. Remediation Plan for Implementer (`m1_worker`)

1. **Fix Concurrency Guard in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`**:
   - Guard `commitPendingModification` against concurrent executions using an in-flight check (`pending._committing`) and idempotency check (`pending._committed` or existing payment by `pendingId`).
   - Deduplicate `r.payments.push` and `r.totalAmount` increment so that even if invoked multiple times concurrently, the mutation only executes once.
2. **Fix Guest Clamping in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`**:
   - Replace `Number(newGuestCount) || r.guestCount || 1` with explicit null check and clamping.
3. **Verify Mirror Parity**:
   - Ensure SHA-256 byte-for-byte parity is preserved between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
4. **Re-run Test Suites**:
   - `node --test tests/m1-reservation-modification-settlement.test.mjs`
   - `node --test tests/challenger-m1-adversarial-modification.test.mjs`
   - Both test suites must pass 100% with exit code 0.
