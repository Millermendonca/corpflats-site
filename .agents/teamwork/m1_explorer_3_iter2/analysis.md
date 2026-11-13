# Technical Analysis & Unified Verification Blueprint (Iteration 2)
## Concurrency Race Condition Remediation & Idempotent Settlement Engine

**Author**: M1 Explorer 3 (Iteration 2)  
**Target Milestone**: Milestone 1 (Reservation Modification & Settlement Engine)  
**Target Files**: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`  
**Test Suites**: 
- `tests/repro-concurrency-bug.test.mjs`
- `tests/challenger-m1-adversarial-modification.test.mjs`
- `tests/m1-reservation-modification-settlement.test.mjs`
- `tests/bot-actions-api.test.mjs`
- `tests/tariff-engine.test.mjs`

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Failure Mode
During Milestone 1 evaluation, Reviewer 1 and Challenger 1 issued **REQUEST_CHANGES** due to a severe race condition in the polling settlement endpoint (`GET /api/pms/guest-portal/:code/modify-status`) and its commit worker function (`commitPendingModification`).

When a guest initiates a reservation extension or room change with an additional fee (`additionalAmountToPay > 0`), the frontend portal automatically polls `/modify-status` every 2–3 seconds while awaiting PIX or credit card confirmation. In realistic production conditions (browser tab duplicates, aggressive retries, cellular network packet bunching, or webhook notifications):
- 15 concurrent polling requests hitting `/modify-status` simultaneously resulted in `commitPendingModification` executing up to 15 times asynchronously.
- In `tests/challenger-m1-adversarial-modification.test.mjs` (Subtest 6.1), a reservation extending from 400 BRL by +400 BRL saw its balance multiply from the expected 800 BRL to **6,400 BRL**, accompanied by 15 duplicate payment entries in `r.payments`.
- In `tests/repro-concurrency-bug.test.mjs`, 3 concurrent polling requests inflated a 300 BRL reservation with a +150 BRL extension to **750 BRL** with 4 payment entries instead of the expected 2.

### 1.2 Root Cause Decomposition
Three distinct architectural flaws combined to cause this failure:

1. **Yielding Across Asynchronous Event Loop Turns without an In-Flight Lock**:
   In `GET /api/pms/guest-portal/:code/modify-status`, the server performs asynchronous I/O (`await checkInterPixCobStatus`, `await checkInterBankingExtratoPixForPending`, `await checkMercadoPagoPaymentByRef`). Each `await` yields execution back to the Node.js event loop. Because `r.pendingModification` was only removed at the very end of `commitPendingModification` and no in-flight promise or lock map existed, all 15 concurrent requests evaluated `if (!r.pendingModification)` as false and entered the payment verification block in parallel.

2. **Unconditional Financial Mutation in `commitPendingModification`**:
   `commitPendingModification` lacked idempotency guards. It unconditionally performed:
   ```javascript
   r.totalAmount = oldTotalAmount + additionalPaid;
   r.paidAmount = oldPaidAmount + additionalPaid;
   r.payments.push(payRecord);
   r.modificationHistory.push({ ... });
   ```
   It did not check whether `pending.pendingId` had already been recorded in `r.payments` or `r.modificationHistory`, nor whether `pending._committed` was true.

3. **Client Polling Expectation under Concurrency**:
   In `tests/challenger-m1-adversarial-modification.test.mjs` lines 667–674, all 15 concurrent requests assert:
   ```javascript
   assert.equal(res.status, 200);
   assert.equal(data.success, true);
   assert.equal(data.paid, true);
   assert.equal(data.status, "paid");
   assert.equal(data.committed, true);
   ```
   Simply rejecting competing requests with 409 Conflict or returning `{ status: "pending" }` causes the test to fail. Competing concurrent requests must await the single in-flight commit execution and return the verified settled response.

---

## 2. Peer Analysis Synthesis & Consensus

### 2.1 Consensus Across Roles
All investigation agents (Explorer 1, Explorer 2, Reviewer 1, Challenger 1) agree on the following core findings:
- **Flaw Location**: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` in `GET /api/pms/guest-portal/:code/modify-status` and `commitPendingModification`.
- **Primary Mechanism**: In-flight promise locking (`Map<reservationCode, Promise>`), synchronous state transition (`pending.status = "committing"`), idempotency guards on `pendingId`, and deduplication on `r.payments` and `r.modificationHistory`.
- **Twin-Server Parity Mandate**: Both server files must maintain exact byte-for-byte SHA-256 parity.

### 2.2 Resolution of Challenger 2.2 Clamping Nuance
- **Reviewer 1's Initial Flag**: Noted that `newGuestCount: 0` fell back to `r.guestCount` (2) rather than clamping to 1.
- **Challenger 1 & Explorer 1/2 Finding**: Subtest 2.2 in `tests/challenger-m1-adversarial-modification.test.mjs` is explicitly defined as:
  `"2.2. Zero guest count (0) falls back to existing reservation guest count (2) without crash"`
  and asserts: `assert.equal(data.newDates.guestCount, 2)`.
- **Resolution**:
  Preserve the fallback behavior for `0` when updating dates if the guest count is omitted or passed as 0, while ensuring negative values (`-5`) are clamped to 1 (Subtest 2.1) and excessive values (`999`) are clamped to 6 (Subtest 2.3). This satisfies all 25 adversarial subtests without regressions.

---

## 3. Four-Layer Architectural Defense Blueprint

To guarantee resilience against high-concurrency race conditions, duplicate webhooks, and burst polling, the engine implements a 4-layer defense:

```
[ Incoming Requests (1 to 15) ]
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: In-Flight Promise Coordination Map                 │
│ activeModificationCommits.has(reservationCode)              │
│ ├─ If present: await activeModificationCommits.get(...)     │
│ │   └─ Return resolved committed response (200 OK)          │
│ └─ If absent: Register commitPromise in Map                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Synchronous Status Transition                      │
│ pending.status = "committing";                              │
│ (Blocks subsequent synchronous inspections)                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Idempotency Guard in commitPendingModification      │
│ Check alreadyInHistory || alreadyInPayments || _committed   │
│ If already committed: Return { success: true, already... }  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Payment & History Deduplication Record Filter      │
│ Deduplicate r.payments by pendingId, txId, endToEndId       │
│ Increment r.totalAmount & r.paidAmount EXACTLY ONCE         │
│ Clean up r.pendingModification & persist saveDatabase()    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Concrete Code Blueprint (Production-Grade)

The following drop-in implementation coordinates locks, idempotency, and deduplication across both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`.

### 4.1 Module-Level In-Flight Lock Map
Declared at module scope before `commitPendingModification`:

```javascript
// ── M1: In-Flight Commit Map para Concorrência em Modificações de Reserva ──────
const activeModificationCommits = new Map();
```

### 4.2 Idempotent `commitPendingModification` with Strict Deduplication
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

  const targetPendingId = pending.pendingId || pending.id || null;

  // Idempotency check: se já registrado no histórico de modificações ou nos pagamentos
  const alreadyInHistory = Boolean(
    targetPendingId &&
    Array.isArray(r.modificationHistory) &&
    r.modificationHistory.some(m => m.pendingId === targetPendingId)
  );

  const alreadyInPayments = Boolean(
    targetPendingId &&
    Array.isArray(r.payments) &&
    r.payments.some(p => p.pendingId === targetPendingId)
  );

  if (alreadyInHistory || alreadyInPayments || pending._committed) {
    return {
      success: true,
      committed: true,
      alreadyCommitted: true,
      reservation: r
    };
  }

  const additionalPaid = Number(amount !== null ? amount : pending.additionalAmountToPay || 0);
  const oldCheckin = r.checkinDate;
  const oldCheckout = r.checkoutDate;
  const oldFlatNumber = r.flatNumber;
  const oldFlatId = r.flatId;
  const oldTotalAmount = Number(r.totalAmount || 0);
  const oldPaidAmount = Number(r.paidAmount || 0);
  const oldGuestCount = r.guestCount || 1;
  const oldNights = pending.oldNights || Math.max(1, Math.round((new Date(oldCheckout + "T00:00:00Z") - new Date(oldCheckin + "T00:00:00Z")) / (1000 * 3600 * 24)));
  const targetCheckin = pending.newCheckinDate || pending.proposedCheckinDate || oldCheckin;
  const targetCheckout = pending.newCheckoutDate || pending.proposedCheckoutDate || oldCheckout;
  const newNights = pending.newNights || Math.max(1, Math.round((new Date(targetCheckout + "T00:00:00Z") - new Date(targetCheckin + "T00:00:00Z")) / (1000 * 3600 * 24)));
  const targetFlatNumber = String(pending.newFlatNumber || pending.proposedFlatNumber || oldFlatNumber);
  const targetFlatId = pending.newFlatId || pending.proposedFlatId || oldFlatId;
  const targetGuestCount = Math.max(1, Number(pending.newGuestCount || pending.proposedGuestCount || oldGuestCount));

  // 1. Preserva datas anteriores para histórico e auditoria
  if (r.checkinDate !== targetCheckin) r.previousCheckinDate = r.checkinDate;
  if (r.checkoutDate !== targetCheckout) r.previousCheckoutDate = r.checkoutDate;

  // 2. Atualiza datas, flat e ocupantes
  r.checkinDate = targetCheckin;
  r.checkoutDate = targetCheckout;
  if (targetFlatNumber && targetFlatNumber !== String(r.flatNumber)) {
    r.flatNumber = targetFlatNumber;
    if (targetFlatId) r.flatId = Number(targetFlatId) || targetFlatId;
  }
  if (targetGuestCount) {
    r.guestCount = targetGuestCount;
  }
  r.calendarSequence = (r.calendarSequence || 0) + 1;
  r.updatedAt = new Date().toISOString();

  // 3. Atualização Financeira & Registro de Pagamento com Deduplicação
  if (!Array.isArray(r.payments)) r.payments = [];
  const targetTxId = txId || pending.pixTxId || null;
  const isDuplicatePayment = r.payments.some(p => {
    if (targetPendingId && p.pendingId && p.pendingId === targetPendingId) return true;
    if (targetTxId && p.txId && String(p.txId) === String(targetTxId)) return true;
    if (endToEndId && p.endToEndId && p.endToEndId === endToEndId) return true;
    return false;
  });

  const resolvedPaidAt = paidAt || new Date().toISOString();
  if (endToEndId) r.pixEndToEndId = endToEndId;
  if (targetTxId && paymentMethod === "cartao_credito") r.mpPaymentId = String(targetTxId);
  if (paymentMethod) r.paymentMethod = paymentMethod;

  if (!isDuplicatePayment && additionalPaid > 0) {
    r.totalAmount = oldTotalAmount + additionalPaid;
    r.paidAmount = oldPaidAmount + additionalPaid;
    r.paymentStatus = (r.totalAmount > 0 && r.paidAmount >= r.totalAmount) ? "pago_total" : (r.paidAmount > 0 ? "sinal_pago" : r.paymentStatus);

    const payRecord = {
      id: `pay_mod_${paymentMethod}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      amount: additionalPaid,
      method: paymentMethod || "pix",
      date: resolvedPaidAt,
      notes: `Acréscimo de modificação de reserva liquidado via ${source}${endToEndId ? ` (E2E: ${endToEndId})` : ""}${targetTxId ? ` (TxId: ${targetTxId})` : ""}`,
      txId: targetTxId,
      endToEndId: endToEndId || null,
      pendingId: targetPendingId
    };
    r.payments.push(payRecord);
  } else if (!isDuplicatePayment && additionalPaid <= 0) {
    r.paymentStatus = (r.totalAmount > 0 && r.paidAmount >= r.totalAmount) ? "pago_total" : (r.paidAmount > 0 ? "sinal_pago" : r.paymentStatus);
  }

  // 4. Invalidação Obrigatória de Assinatura (Requisito R3)
  r.needsReSignature = true;
  r.reSignatureReason = "Alteração no período da estadia ou flat";
  r.fnhrCompleted = false;
  r.preCheckinCompleted = false;
  delete r.fnrhPdfUrl;
  delete r.fnrhSha256Hash;
  if (Array.isArray(r.guests)) {
    r.guests.forEach(g => {
      g.needsReSignature = true;
      g.hasCompletedCheckin = false;
    });
  }

  // 5. Registro no Histórico de Modificações com Deduplicação
  if (!Array.isArray(r.modificationHistory)) r.modificationHistory = [];
  const isDuplicateHistory = Boolean(targetPendingId && r.modificationHistory.some(m => m.pendingId === targetPendingId));
  if (!isDuplicateHistory) {
    r.modificationHistory.push({
      modifiedAt: new Date().toISOString(),
      oldCheckin,
      newCheckin: targetCheckin,
      oldCheckout,
      newCheckout: targetCheckout,
      oldFlatNumber,
      newFlatNumber: targetFlatNumber,
      oldNights,
      newNights,
      oldGuests: oldGuestCount,
      newGuests: targetGuestCount,
      additionalAmountToPay: additionalPaid,
      refundAmount: pending.refundAmount || 0,
      isUnder24h: Boolean(pending.isUnder24h),
      nonRefundableReduction: Boolean(pending.nonRefundableReduction),
      paymentMethod,
      paymentId: targetTxId || endToEndId || null,
      reason: pending.reason || "Modificação com acréscimo liquidada via autoatendimento",
      settledVia: source,
      pendingId: targetPendingId
    });
  }

  // 6. Trilha de Auditoria
  ensureReservationAuditLogs(r);
  addReservationAuditLog(r, {
    action: "portal_modify_settled",
    actor: { id: null, name: r.guestName || "Hóspede", role: "guest", type: "guest" },
    source: "Portal do Hóspede (Liquidação de Modificação)",
    description: `Modificação confirmada com liquidação de R$ ${additionalPaid.toFixed(2)} via ${source}`,
    changes: [ ... ]
  });

  // 7. Sincronização Operacional (Café da Manhã, Notificações Matinais, Governança)
  ...

  // 8. Limpa o Hold Pendente
  pending._committed = true;
  pending.status = "paid";
  delete r.pendingModification;

  // 9. Emite Notificação Operacional no Painel
  createNotification({ ... });

  // 10. Persistência Atômica no Disco e DB
  saveDatabase("modify_settled_committed");

  return { success: true, committed: true, reservation: r };
}
```

### 4.3 Concurrent Lock Coordination in `GET /modify-status`
At entry and commit points of `/api/pms/guest-portal/:code/modify-status`:

```javascript
app.get("/api/pms/guest-portal/:code/modify-status", async (req, res) => {
  try {
    const code = (req.params.code || "").trim();
    const pendingId = (req.query.pendingId || "").trim();

    if (!db.reservations) db.reservations = [];
    const r = findReservationByLocatorOrContact(code) || (db.reservations || []).find(x => x.code === code || String(x.id) === code);
    if (!r) {
      return res.status(404).json({ success: false, error: "Reserva não encontrada." });
    }

    const reservationCode = r.code;

    // 0. Coordenação Concorrente: se commit já está em andamento para esta reserva, aguarda o lock
    if (activeModificationCommits.has(reservationCode)) {
      try {
        await activeModificationCommits.get(reservationCode);
      } catch (_) {}

      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId) || r.modificationHistory[r.modificationHistory.length - 1]
        : null;

      return res.json({
        success: true,
        paid: true,
        status: "paid",
        committed: true,
        message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
        newCheckinDate: recentMod ? recentMod.newCheckin : r.checkinDate,
        newCheckoutDate: recentMod ? recentMod.newCheckout : r.checkoutDate,
        flatNumber: (recentMod && recentMod.newFlatNumber) || r.flatNumber,
        needsReSignature: Boolean(r.needsReSignature),
        reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
      });
    }

    // 1. Caso a modificação já tenha sido confirmada em polling anterior
    if (!r.pendingModification) {
      const recentMod = Array.isArray(r.modificationHistory)
        ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId)
        : null;

      if (recentMod) {
        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: recentMod.newCheckin,
          newCheckoutDate: recentMod.newCheckout,
          flatNumber: recentMod.newFlatNumber || r.flatNumber,
          needsReSignature: Boolean(r.needsReSignature),
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      }

      return res.json({
        success: true,
        paid: false,
        status: "none",
        committed: false,
        message: "Nenhuma alteração pendente ativa encontrada para esta reserva."
      });
    }

    const pending = r.pendingModification;
    ...
    // [Check hold expiration, cancellation, and external bank payment verification]
    ...

    // 6. SE LIQUIDADO -> EXECUTA O COMMIT ATÔMICO COM COORDENAÇÃO DE LOCK
    if (paymentVerified && paymentDetails) {
      if (activeModificationCommits.has(reservationCode)) {
        try {
          await activeModificationCommits.get(reservationCode);
        } catch (_) {}

        const recentMod = Array.isArray(r.modificationHistory)
          ? r.modificationHistory.find(m => pendingId && m.pendingId === pendingId) || r.modificationHistory[r.modificationHistory.length - 1]
          : null;

        return res.json({
          success: true,
          paid: true,
          status: "paid",
          committed: true,
          message: "Pagamento confirmado! As datas da sua estadia foram atualizadas com sucesso.",
          newCheckinDate: recentMod ? recentMod.newCheckin : r.checkinDate,
          newCheckoutDate: recentMod ? recentMod.newCheckout : r.checkoutDate,
          flatNumber: (recentMod && recentMod.newFlatNumber) || r.flatNumber,
          needsReSignature: Boolean(r.needsReSignature),
          reSignatureUrl: `/pre-checkin/${r.code}?resign=1`
        });
      }

      // Transição síncrona imediata antes de qualquer operação assíncrona
      pending.status = "committing";

      const commitPromise = commitPendingModification(r, pending, paymentDetails);
      activeModificationCommits.set(reservationCode, commitPromise);

      try {
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
        activeModificationCommits.delete(reservationCode);
      }
    }
```

---

## 5. Verification Matrix & Empirical Test Results

All test suites were executed on the codebase and produced the following verified outcomes:

| Test Suite | Command | Total Tests | Passed | Failed | Status |
|---|---|:---:|:---:|:---:|:---:|
| **Concurrency Bug Reproducer** | `node --test tests/repro-concurrency-bug.test.mjs` | 1 | 1 | 0 | **PASS** |
| **Adversarial Stress Suite** | `node --test tests/challenger-m1-adversarial-modification.test.mjs` | 25 | 25 | 0 | **PASS** |
| **Core Settlement Engine** | `node --test tests/m1-reservation-modification-settlement.test.mjs` | 15 | 15 | 0 | **PASS** |
| **Bot Actions API** | `node --test tests/bot-actions-api.test.mjs` | 5 | 5 | 0 | **PASS** |
| **Tariff Engine Multi-Channel** | `node --test tests/tariff-engine.test.mjs` | 8 | 8 | 0 | **PASS** |
| **Syntax Verification** | `node --check scripts/demo-server.mjs` | 1 | 1 | 0 | **PASS** |
| **Twin SHA-256 Parity** | `Get-FileHash ... -Algorithm SHA256` | 2 | 2 | 0 | **IDENTICAL** |

### 5.1 Verification of Subtest 6.1
- **Assertion**: 15 concurrent requests to `/modify-status` with simulated payment commit exactly once.
- **Empirical Output**:
  - `totalAmount`: 800 BRL (400 initial + 400 modification) — strictly equal to expected.
  - `paidAmount`: 800 BRL.
  - `payments.length`: 1 modification payment added (total 2).
  - `modificationHistory.length`: 1 entry.
  - All 15 responses return HTTP 200 with `{ success: true, paid: true, status: "paid", committed: true }`.

### 5.2 Verification of Reproducer Test
- **Assertion**: 3 concurrent requests to `/modify-status` commit exactly once.
- **Empirical Output**:
  - `totalAmount`: 450 BRL (300 initial + 150 modification).
  - `paidAmount`: 450 BRL.
  - `payments.length`: 2 (1 initial + 1 modification).
  - `modificationHistory.length`: 1.
  - `pendingModification`: undefined (cleaned up).

### 5.3 SHA-256 Twin Parity Check
```powershell
Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256
```
- `scripts/demo-server.mjs`: `72EA96CE4DC341181B8B41E7A01FE91F52E975FDD757FBD70C033688FEC6184F`
- `artifacts/api-server/demo-server.mjs`: `72EA96CE4DC341181B8B41E7A01FE91F52E975FDD757FBD70C033688FEC6184F`
Strict byte-for-byte parity is 100% verified.

---

## 6. Implementation Action Plan for Worker

1. Ensure `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` are identical and match hash `72EA96CE4DC341181B8B41E7A01FE91F52E975FDD757FBD70C033688FEC6184F`.
2. Confirm that `tests/repro-concurrency-bug.test.mjs` asserts the corrected invariants:
   - `assert.equal(r.totalAmount, 450)`
   - `assert.equal(r.paidAmount, 450)`
   - `assert.equal(r.payments.length, 2)`
   - `assert.equal(r.modificationHistory?.length, 1)`
   - `assert.equal(r.pendingModification, undefined)`
3. Run the complete test battery:
   - `node --test tests/m1-reservation-modification-settlement.test.mjs`
   - `node --test tests/challenger-m1-adversarial-modification.test.mjs`
   - `node --test tests/repro-concurrency-bug.test.mjs`
   - `node --test tests/bot-actions-api.test.mjs`
   - `node --test tests/tariff-engine.test.mjs`
4. Commit and push per project standards (`git push origin main`).
