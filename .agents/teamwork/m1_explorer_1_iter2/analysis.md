# Technical Analysis & Blueprint: Reservation Modification Concurrency Race Condition Remediation

**Author**: M1 Explorer 1 (Iteration 2)  
**Date**: 2026-10-11T14:15:00Z  
**Target Module**: Reservation Modification Settlement Engine (`commitPendingModification` and `GET /api/pms/guest-portal/:code/modify-status`)  
**Target Files**: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` (must remain in 100% SHA-256 parity)

---

## 1. Executive Summary

During Milestone 1 testing, Reviewer 1 and Challenger 1 identified a critical financial concurrency race condition:
When multiple polling requests hit `GET /api/pms/guest-portal/:code/modify-status` simultaneously while payment is verified (e.g. 15 concurrent frontend polling requests or webhook retries), each request asynchronously executed `commitPendingModification`.
This compounded `r.totalAmount` (e.g. from R$ 400 + R$ 400 = R$ 800 up to R$ 6,400) and added 15 duplicate payment records to `r.payments`.

This analysis provides:
1. A rigorous diagnosis of the asynchronous event loop interleaving that permitted the race condition.
2. A critical evaluation of concurrent test requirements (why returning `{ status: "pending" }` during commit fails Subtest 6.1, and why Promise awaiting is strictly required).
3. An exact, production-grade 4-layer defense architecture with zero external dependencies.
4. Line-by-line before/after blueprints for `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.
5. Guidance on updating `tests/repro-concurrency-bug.test.mjs` to assert the remediated invariants.

---

## 2. Root Cause Analysis & Event Loop Interleaving

### 2.1 The Asynchronous Time-of-Check to Time-of-Use (TOCTOU) Window

In `GET /api/pms/guest-portal/:code/modify-status`:
1. **Initial Check (Line 16299)**:
   ```javascript
   if (!r.pendingModification) { ... }
   const pending = r.pendingModification;
   ```
   At the beginning of each request, the code checks if `r.pendingModification` exists. When 15 requests arrive concurrently, all 15 observe that `r.pendingModification` is present.

2. **Asynchronous Await Yield Points (Lines 16385–16450)**:
   ```javascript
   if (pending.pixTxId) {
     const cobData = await checkInterPixCobStatus(pending.pixTxId);
   }
   if (!paymentVerified) {
     const extratoMatch = await checkInterBankingExtratoPixForPending(r, pending);
   }
   if (!paymentVerified) {
     let mpPayment = await checkMercadoPagoPaymentByRef(...);
   }
   ```
   Crucially, even when `simulatePayment === true` sets `paymentVerified = true` in tests, line 16385 `if (pending.pixTxId)` is still evaluated. Since `modify-checkout` always assigns a `pixTxId`, every single request calls `await checkInterPixCobStatus(...)`.
   At this `await`, the Node.js event loop suspends the current request and yields to the next incoming request. Consequently, all 15 requests pass the `if (!r.pendingModification)` guard before *any* request has committed or deleted `r.pendingModification`.

3. **Unchecked Mutation in `commitPendingModification` (Lines 15659–15719)**:
   When Request 1 resumes from its await, it calls `commitPendingModification(r, pending, paymentDetails)`:
   - `r.totalAmount = oldTotalAmount + additionalPaid;`
   - `r.paidAmount = oldPaidAmount + additionalPaid;`
   - `r.payments.push(payRecord);`
   - `r.modificationHistory.push({ ... });`
   - `delete r.pendingModification;` (Step 8, line 15821).
   
   When Request 2 resumes from its await:
   - Request 2 already passed the `if (!r.pendingModification)` check and still holds the local variable `pending`.
   - `commitPendingModification` had **zero checks** verifying if `pending.pendingId` had already been recorded in `r.modificationHistory` or `r.payments`.
   - Request 2 reads `oldTotalAmount = Number(r.totalAmount || 0)`—which was *already incremented* by Request 1—and adds `additionalPaid` a second time!
   - Requests 3 through 15 sequentially compound the balance up to R$ 6,400.

---

## 3. Concurrency Requirement: Why Promise Awaiting is Mandatory

In `tests/challenger-m1-adversarial-modification.test.mjs`, Subtest 6.1 executes:
```javascript
const concurrentRequests = Array.from({ length: 15 }, () =>
  fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-CONCUR/modify-status?pendingId=${pendingId}&simulatePayment=true`)
);

const responses = await Promise.all(concurrentRequests);

for (const res of responses) {
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.paid, true);
  assert.equal(data.status, "paid");
  assert.equal(data.committed, true);
}
```

### The Pitfall of Simple Lock Rejection
If an in-flight lock simply returns `{ success: true, status: "pending", message: "Processando..." }` when lock contention occurs:
- Request 1 returns `{ status: "paid", committed: true }`.
- Requests 2 through 15 return `{ status: "pending", committed: false }`.
- **Subtest 6.1 immediately fails** on Request 2 with `AssertionError: 'pending' !== 'paid'`.

### The Solution: Shared In-Flight Promise Awaiting
Instead of rejecting or deferring concurrent requests:
1. When Request 1 detects payment and begins the commit, it stores its execution Promise in a module-level lock map: `activeModificationLocks.set(lockKey, commitPromise)`.
2. Requests 2 through 15 that arrive while the commit is executing simply `await activeModificationLocks.get(lockKey)`.
3. When Request 1 finishes, `commitPromise` resolves.
4. Requests 2 through 15 immediately wake up, observe that the reservation was successfully committed, and return the identical successful JSON payload:
   ```json
   {
     "success": true,
     "paid": true,
     "status": "paid",
     "committed": true,
     "message": "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
     "newCheckinDate": "2026-12-01",
     "newCheckoutDate": "2026-12-05",
     "flatNumber": "113",
     "needsReSignature": true,
     "reSignatureUrl": "/pre-checkin/RES-ADV-CONCUR?resign=1"
   }
   ```
5. All 15 requests receive HTTP 200 with `status: "paid", committed: true`.
6. `totalAmount`, `payments`, and `modificationHistory` are modified **exactly once**.

---

## 4. The 4-Layer Defense Architecture

```
Layer 1: Module-Level Lock Map
  const activeModificationLocks = new Map(); // lockKey -> Promise

Layer 2: Top-Level Fast Path Guard in GET /modify-status
  if (activeModificationLocks.has(lockKey)) {
    await activeModificationLocks.get(lockKey);
    return res.json(committedResponse);
  }

Layer 3: In-Flight Mutex & Serialization in Step 6 of /modify-status
  if (activeModificationLocks.has(lockKey)) {
    await activeModificationLocks.get(lockKey);
    return res.json(committedResponse);
  }
  // Acquire lock, execute commitPromise, release in finally block

Layer 4: Absolute Idempotency Guard in commitPendingModification
  if (targetPendingId in r.modificationHistory || targetPendingId in r.payments) {
    return { success: true, alreadyCommitted: true, committed: true, reservation: r };
  }
```

---

## 5. Exact Implementation Blueprint

### File Targets
1. `scripts/demo-server.mjs`
2. `artifacts/api-server/demo-server.mjs`

### Edit 1: Module-Level Lock Map Declaration
**Location**: Just above `commitPendingModification` (around line 15615).

```javascript
// ── M1: In-Flight Lock Map para Concorrência em Modificações de Reserva ──────
const activeModificationLocks = new Map();
```

---

### Edit 2: Strict Idempotency in `commitPendingModification`
**Location**: Inside `commitPendingModification` (lines 15616–15630).

#### Before:
```javascript
export async function commitPendingModification(r, pending, {
  amount = null,
  paidAt = null,
  endToEndId = null,
  txId = null,
  paymentMethod = "pix",
  source = "Banco Inter"
} = {}) {
  if (!r || !pending) return { success: false, error: "Reserva ou alteração pendente ausente." };

  const additionalPaid = Number(amount !== null ? amount : pending.additionalAmountToPay || 0);
```

#### After:
```javascript
export async function commitPendingModification(r, pending, {
  amount = null,
  paidAt = null,
  endToEndId = null,
  txId = null,
  paymentMethod = "pix",
  source = "Banco Inter"
} = {}) {
  if (!r || !pending) return { success: false, error: "Reserva ou alteração pendente ausente." };

  const targetPendingId = pending.pendingId || pending.id || `mod_${r.code}_${pending.newCheckinDate || r.checkinDate}_${pending.newCheckoutDate || r.checkoutDate}`;

  // 0. VERIFICAÇÃO DE IDEMPOTÊNCIA E PREVENÇÃO DE DOUBLE-COMMIT
  // A. Já registrado em modificationHistory?
  const alreadyInHistory = Boolean(
    targetPendingId &&
    Array.isArray(r.modificationHistory) &&
    r.modificationHistory.some(m => m.pendingId === targetPendingId)
  );

  // B. Já registrado em pagamentos da reserva?
  const alreadyInPayments = Boolean(
    targetPendingId &&
    Array.isArray(r.payments) &&
    r.payments.some(p => p.pendingId === targetPendingId)
  );

  // C. Hold já consumido ou marcado como pago anteriormente?
  const holdAlreadyCommitted = Boolean(
    !r.pendingModification ||
    (r.pendingModification && (r.pendingModification.status === "paid" || r.pendingModification.status === "committed"))
  );

  if (alreadyInHistory || alreadyInPayments || (holdAlreadyCommitted && alreadyInHistory)) {
    return {
      success: true,
      alreadyCommitted: true,
      committed: true,
      reservation: r
    };
  }

  const additionalPaid = Number(amount !== null ? amount : pending.additionalAmountToPay || 0);
```

---

### Edit 3: Top Guard in `GET /api/pms/guest-portal/:code/modify-status`
**Location**: Right after `if (!r) { ... }` in `modify-status` (around line 16298).

#### Before:
```javascript
    if (!r) {
      return res.status(404).json({ success: false, error: "Reserva não encontrada." });
    }

    // 1. Caso a modificação já tenha sido confirmada em polling anterior
    if (!r.pendingModification) {
      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId)
        : null;
```

#### After:
```javascript
    if (!r) {
      return res.status(404).json({ success: false, error: "Reserva não encontrada." });
    }

    const lockKey = String(r.code || pendingId || req.params.code);

    // Concorrência: se outra requisição está executando o commit desta reserva neste momento, aguarda a finalização
    if (activeModificationLocks.has(lockKey)) {
      try {
        await activeModificationLocks.get(lockKey);
      } catch (_) {}

      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId)
        : null;

      if (recentMod || !r.pendingModification) {
        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: recentMod?.newCheckin || r.checkinDate,
          newCheckoutDate: recentMod?.newCheckout || r.checkoutDate,
          flatNumber: recentMod?.newFlatNumber || r.flatNumber,
          needsReSignature: Boolean(r.needsReSignature),
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      }
    }

    // 1. Caso a modificação já tenha sido confirmada em polling anterior
    if (!r.pendingModification) {
      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId)
        : null;
```

---

### Edit 4: Settlement Execution In-Flight Lock & Mutex in Step 6
**Location**: Lines 16451–16471 of `modify-status`.

#### Before:
```javascript
    // 6. SE LIQUIDADO -> EXECUTA O COMMIT ATÔMICO
    if (paymentVerified && paymentDetails) {
      const commitRes = await commitPendingModification(r, pending, paymentDetails);
      if (!commitRes.success) {
        return res.status(500).json({ success: false, error: commitRes.error });
      }

      return res.json({
        success: true,
        paid: true,
        status: "paid",
        committed: true,
        message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
        newCheckinDate: r.checkinDate,
        newCheckoutDate: r.checkoutDate,
        flatNumber: r.flatNumber,
        needsReSignature: true,
        reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
      });
    }
```

#### After:
```javascript
    // 6. SE LIQUIDADO -> EXECUTA O COMMIT ATÔMICO COM IN-FLIGHT LOCK E SERIALIZAÇÃO
    if (paymentVerified && paymentDetails) {
      const lockKey = String(r.code || pending.pendingId || pendingId);

      // Se outra requisição simultânea já adquiriu o lock e está executando o commit:
      if (activeModificationLocks.has(lockKey)) {
        try {
          await activeModificationLocks.get(lockKey);
        } catch (_) {}

        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: r.checkinDate,
          newCheckoutDate: r.checkoutDate,
          flatNumber: r.flatNumber,
          needsReSignature: true,
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      }

      // Cria a Promise de commit e registra no Map de locks ativos
      let commitPromise;
      try {
        r._isCommittingModification = true;
        if (pending) pending._committing = true;

        commitPromise = commitPendingModification(r, pending, paymentDetails);
        activeModificationLocks.set(lockKey, commitPromise);

        const commitRes = await commitPromise;
        if (!commitRes.success) {
          return res.status(500).json({ success: false, error: commitRes.error });
        }

        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: r.checkinDate,
          newCheckoutDate: r.checkoutDate,
          flatNumber: r.flatNumber,
          needsReSignature: true,
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      } finally {
        delete r._isCommittingModification;
        if (pending) delete pending._committing;
        activeModificationLocks.delete(lockKey);
      }
    }
```

---

## 6. Guidance on Guest Count Clamping (Challenge 2.2 Clarification)

In Reviewer 1's report, note was made regarding `newGuestCount: 0`:
> "Failure 2 (Challenge 2.2 - Minor Clamping Edge Case): Zero guest count (0) falls back to existing r.guestCount (2)..."

### Investigation Finding:
Inspection of `tests/challenger-m1-adversarial-modification.test.mjs` line 368 reveals:
```javascript
it("2.2. Zero guest count (0) falls back to existing reservation guest count (2) without crash", async () => {
  const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
    ...
    body: JSON.stringify({
      newCheckinDate: "2026-11-10",
      newCheckoutDate: "2026-11-13",
      newGuestCount: 0
    })
  });
  const data = await res.json();
  assert.equal(data.newDates.guestCount, 2);
});
```
The test explicitly specifies that `newGuestCount: 0` **must fall back** to the reservation's existing `guestCount` (which is 2), and Challenger 1 recorded that Test 2.2 **PASSED**.
**Crucial Warning for Implementer**: Do **NOT** change the guest count logic in `modify-preview` to clamp 0 to 1, as that would break Subtest 2.2! The existing formula `Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1))` is strictly correct and expected by the test suite.

---

## 7. Guidance on Updating `tests/repro-concurrency-bug.test.mjs`

In `tests/repro-concurrency-bug.test.mjs`, lines 145–146 currently assert that the bug *exists*:
```javascript
const hasDoubleCommitBug = r.totalAmount > 450 || r.payments.length > 2 || r.modificationHistory?.length > 1;
assert.ok(hasDoubleCommitBug, "CONFIRMED: Concurrent requests caused double-commit / multiple additions");
```

Once the fix is applied, the bug is resolved, so `hasDoubleCommitBug` will be false. To transform this reproducer into a permanent regression test, update lines 104 and 145–146 to assert the correct invariant:

```javascript
  it("3 concurrent requests to /modify-status commit exactly once without duplicate payments or balance corruption", async () => {
    ...
    // 3. Inspect database state
    const db = getDb();
    const r = db.reservations.find(x => x.code === "RES-RACE-001");

    assert.equal(r.totalAmount, 450, "totalAmount must be exactly 450 (300 + 150)");
    assert.equal(r.paidAmount, 450, "paidAmount must be exactly 450");
    assert.equal(r.payments.length, 2, "Expected exactly 2 payments (1 initial + 1 modification)");
    assert.equal(r.modificationHistory?.length, 1, "Expected exactly 1 modificationHistory entry");
    assert.equal(r.pendingModification, undefined, "pendingModification must be cleaned up");
  });
```

---

## 8. Twin-Server SHA-256 Parity & Verification Instructions

### Synchronization Rule
Every change must be made identically to both servers:
1. `scripts/demo-server.mjs`
2. `artifacts/api-server/demo-server.mjs`

### Verification Commands
```powershell
# 1. Verify byte-for-byte parity
Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256

# 2. Syntax check
node --check scripts/demo-server.mjs
node --check artifacts/api-server/demo-server.mjs

# 3. Milestone 1 Core Test Suite (15/15 passing)
node --test tests/m1-reservation-modification-settlement.test.mjs

# 4. Milestone 1 Adversarial Suite (25/25 passing including 6.1)
node --test tests/challenger-m1-adversarial-modification.test.mjs

# 5. Concurrency Regression Suite
node --test tests/repro-concurrency-bug.test.mjs

# 6. Baseline System Verification
node --test tests/bot-actions-api.test.mjs
node --test tests/tariff-engine.test.mjs
```
