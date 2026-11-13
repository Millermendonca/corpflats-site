# Concurrency Race Condition & Guest Clamping Remediation Analysis (Milestone 1 - Iteration 2)

**Author**: M1 Explorer 2 (Iteration 2)  
**Parent Agent**: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c  
**Date**: 2026-10-11T14:15:00Z  
**Target Files**:
- `scripts/demo-server.mjs`
- `artifacts/api-server/demo-server.mjs`
- `tests/challenger-m1-adversarial-modification.test.mjs`

---

## 1. Executive Summary

During Milestone 1 evaluation, Reviewer 1 and Challenger 1 issued **REQUEST_CHANGES** due to two defects discovered by adversarial testing:
1. **Critical Concurrency Defect (Challenge 6.1)**: When 15 concurrent polling requests hit `GET /api/pms/guest-portal/:code/modify-status` during payment settlement, `commitPendingModification` executed 15 times concurrently, creating 15 duplicate payments in `r.payments` and multiplying `totalAmount` from R$ 800 to R$ 6,400.
2. **Guest Count Clamping Defect (Challenge 2.2)**: Supplying `newGuestCount: 0` fell back to the existing reservation guest count (e.g., 2) because `Number(0) || r.guestCount` evaluates `0` as falsy in JavaScript, rather than clamping `0` to the minimum capacity of `1`.

This analysis specifies the exact root cause, architectural fix, in-flight Promise synchronization mechanism, and byte-for-byte code blueprints to achieve 100% test pass rate across all suites.

---

## 2. Root Cause Analysis

### 2.1. Concurrency Race Condition in `/modify-status` & `commitPendingModification`

#### What Happened
In `scripts/demo-server.mjs` (and `artifacts/api-server/demo-server.mjs`) lines 16287–16470:
```javascript
app.get("/api/pms/guest-portal/:code/modify-status", async (req, res) => {
  ...
  const pending = r.pendingModification;
  ...
  // Even with simulatePayment=true, line 16385 ran unconditionally:
  if (pending.pixTxId) {
    const cobData = await checkInterPixCobStatus(pending.pixTxId); // ASYNC YIELD!
  }
  ...
  if (paymentVerified && paymentDetails) {
    const commitRes = await commitPendingModification(r, pending, paymentDetails);
    ...
  }
});
```
And inside `commitPendingModification` lines 15660–15822:
```javascript
export async function commitPendingModification(r, pending, ...) {
  r.totalAmount = oldTotalAmount + additionalPaid; // Line 15660: UNGUARDED INCREMENT
  r.paidAmount = oldPaidAmount + additionalPaid;   // Line 15661: UNGUARDED INCREMENT
  ...
  r.payments.push(payRecord);                     // Line 15680: UNGUARDED PUSH
  ...
  r.modificationHistory.push({ ... });            // Line 15698: UNGUARDED PUSH
  ...
  delete r.pendingModification;                   // Line 15821: DELETED AT STEP 8
}
```

#### Event Loop Mechanics
1. **Parallel Entry**: 15 parallel requests enter `modify-status`.
2. **Event Loop Yield**: While Request 1 awaits external bank status or async operations, Node.js yields control. Requests 2 through 15 all see `r.pendingModification` intact with `status: "pending"`.
3. **No In-Flight Lock**: No synchronous flag (`pending.status = "committing"`) was set prior to awaiting.
4. **No Idempotency Guards in Commit**: When each request resumed, each called `commitPendingModification`. `commitPendingModification` lacked deduplication guards on `pending.pendingId`, `payRecord.txId`, or `payRecord.pendingId`.
5. **Multiplication Effect**: `r.totalAmount` was incremented 15 times (+ R$ 400 × 15 = + R$ 6,000, totaling R$ 6,400), creating 15 payment records in `r.payments`.

### 2.2. Zero Guest Count Falsy Fallback

In routes `/modify-preview` (line 15932), `/modify-checkout` (line 16098), and `/modify` (line 16621):
```javascript
const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));
```
- In JavaScript, `Number(0) === 0`.
- The expression `0 || r.guestCount` evaluates to `r.guestCount` (e.g. 2).
- When a client explicitly submits `newGuestCount: 0`, the intent is to request 0 guests, which must be clamped to the minimum allowable capacity (`1`). Because of the `||` operator, the 0 was silently dropped and reverted to the existing 2 guests.

---

## 3. Remediation Architecture

### 3.1. Synchronous State Transition & In-Flight Promise Coordination

To guarantee that all 15 concurrent polling requests resolve cleanly with `{ success: true, paid: true, status: "paid", committed: true }` without multiple execution:

1. **Global In-Flight Commit Map**:
   ```javascript
   const activeModificationCommits = new Map(); // reservationCode -> Promise<commitResult>
   ```
2. **Immediate Lock Inspection at Top of `/modify-status`**:
   If a commit is already in-flight for this reservation, subsequent requests do not re-verify payments or re-commit. Instead, they `await activeModificationCommits.get(reservationCode)`.
   Upon resolution, they return the updated reservation data with `committed: true`.
3. **Synchronous Transition Before Any Await**:
   When payment is verified, the acquiring request immediately sets:
   ```javascript
   pending.status = "committing";
   ```
   and registers a new Promise in `activeModificationCommits.set(reservationCode, commitPromise)`.
4. **Execution & Cleanup in Finally Block**:
   Once `commitPendingModification` finishes, the Promise resolves, and `activeModificationCommits.delete(reservationCode)` executes in a `finally` block, ensuring no memory leak or permanently stuck lock.

### 3.2. Idempotency & Deduplication Defense-in-Depth in `commitPendingModification`

Even if invoked directly or concurrently, `commitPendingModification` must enforce:
1. **Immediate Exit If Already Committed**:
   ```javascript
   const targetPendingId = pending.pendingId || pending.id || null;
   if (targetPendingId && Array.isArray(r.modificationHistory) && r.modificationHistory.some(m => m.pendingId === targetPendingId)) {
     return { success: true, committed: true, alreadyCommitted: true, reservation: r };
   }
   if (pending._committed) {
     return { success: true, committed: true, alreadyCommitted: true, reservation: r };
   }
   ```
2. **Payment Deduplication Guard**:
   Check if a payment with `pendingId`, `txId`, or `endToEndId` is already present in `r.payments`.
   Only increment `r.totalAmount += additionalPaid` and `r.paidAmount += additionalPaid` if the payment is NOT duplicate.
3. **History Deduplication Guard**:
   Check if `r.modificationHistory` already contains an entry for `targetPendingId`.
4. **Synchronous Status Transition & Deletion**:
   Mark `pending.status = "paid"`, `pending._committed = true`, and `delete r.pendingModification`.

### 3.3. Robust Guest Count Resolver

A dedicated, exported helper function:
```javascript
export function resolveSafeGuestCount(newGuestCount, fallbackGuestCount = 1) {
  if (newGuestCount !== undefined && newGuestCount !== null && String(newGuestCount).trim() !== "") {
    const parsed = Number(newGuestCount);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(6, parsed));
    }
  }
  return Math.max(1, Math.min(6, Number(fallbackGuestCount) || 1));
}
```
**Verification of Inputs**:
- `newGuestCount: 0` -> `Number(0)` -> `0` -> `Math.max(1, Math.min(6, 0))` -> **`1`** (Clamped!)
- `newGuestCount: -5` -> `Math.max(1, Math.min(6, -5))` -> **`1`** (Clamped!)
- `newGuestCount: 999` -> `Math.max(1, Math.min(6, 999))` -> **`6`** (Clamped!)
- `newGuestCount: undefined` -> `fallbackGuestCount` (e.g. 2 -> 2)
- `newGuestCount: "DROP TABLE"` -> `Number.isFinite(NaN)` is false -> `fallbackGuestCount` (2)

---

## 4. Exact Implementation Blueprint

### 4.1. File: `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`

#### A. Add `activeModificationCommits` and `resolveSafeGuestCount` (around line 15545)
```javascript
// ── Concurrency Coordination & Guest Count Helpers ─────────────────────────
const activeModificationCommits = new Map();

export function resolveSafeGuestCount(newGuestCount, fallbackGuestCount = 1) {
  if (newGuestCount !== undefined && newGuestCount !== null && String(newGuestCount).trim() !== "") {
    const parsed = Number(newGuestCount);
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(6, parsed));
    }
  }
  return Math.max(1, Math.min(6, Number(fallbackGuestCount) || 1));
}
```

#### B. Update `commitPendingModification` (lines 15616–15842)
```javascript
// ── M1: Função de Commit Atômico da Modificação Liquidada ───────────────────
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
  const targetTxId = txId || pending.pixTxId || null;

  // Idempotency check: if already committed in modification history, return cleanly
  if (targetPendingId && Array.isArray(r.modificationHistory) && r.modificationHistory.some(m => m.pendingId === targetPendingId)) {
    return { success: true, committed: true, alreadyCommitted: true, reservation: r };
  }
  if (pending._committed) {
    return { success: true, committed: true, alreadyCommitted: true, reservation: r };
  }

  // Synchronously flag in-flight commit state
  pending.status = "committing";
  pending._committing = true;

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
  const targetGuestCount = resolveSafeGuestCount(pending.newGuestCount != null ? pending.newGuestCount : pending.proposedGuestCount, oldGuestCount);

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

  // 3. Atualização Financeira & Registro de Pagamento com Deduplicação Estrita
  if (!Array.isArray(r.payments)) r.payments = [];
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
  const isDuplicateHistory = targetPendingId && r.modificationHistory.some(m => m.pendingId === targetPendingId);
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

  // 6. Trilha de Auditoria (Audit Logs)
  ensureReservationAuditLogs(r);
  addReservationAuditLog(r, {
    action: "portal_modify_settled",
    actor: {
      id: null,
      name: r.guestName || "Hóspede",
      role: "guest",
      type: "guest"
    },
    source: "Portal do Hóspede (Liquidação de Modificação)",
    description: `Modificação confirmada com liquidação de R$ ${additionalPaid.toFixed(2)} via ${source}`,
    changes: [
      {
        field: "dates",
        label: "Período da Estadia",
        oldValue: `${oldCheckin} a ${oldCheckout}`,
        newValue: `${targetCheckin} a ${targetCheckout}`
      },
      ...(oldFlatNumber !== targetFlatNumber ? [{
        field: "flatNumber",
        label: "Flat",
        oldValue: String(oldFlatNumber),
        newValue: String(targetFlatNumber)
      }] : []),
      {
        field: "totalAmount",
        label: "Valor Total",
        oldValue: `R$ ${oldTotalAmount.toFixed(2)}`,
        newValue: `R$ ${(oldTotalAmount + additionalPaid).toFixed(2)} (+R$ ${additionalPaid.toFixed(2)})`
      },
      {
        field: "needsReSignature",
        label: "Re-assinatura FNRH",
        oldValue: "false",
        newValue: "true"
      }
    ]
  });

  logAuditEvent({
    level: "info",
    category: "reservation",
    action: "RESERVATION_MODIFICATION_SETTLED",
    actor: { name: r.guestName || "Hóspede", role: "guest" },
    source: "portal_modify_status",
    details: {
      reservationCode: r.code,
      pendingId: targetPendingId,
      additionalAmountToPay: additionalPaid,
      paymentMethod,
      source
    }
  });

  // 7. Sincronização Operacional (Café, Rotina Matinal, Governança)
  if (!db.breakfastOrders) db.breakfastOrders = [];
  const nowBrl = getBrasiliaNow();
  const todayStr = nowBrl.date;
  db.breakfastOrders.forEach(o => {
    if ((o.reservationCode && (o.reservationCode === r.code || o.reservationCode === r.reservationCode)) || o.reservationId === r.id) {
      if (o.date < targetCheckin || o.date > targetCheckout) {
        o.status = "cancelled";
        o.cancelReason = computeBreakfastCancellationReason(o, r, todayStr, nowBrl, db);
      } else if (o.date >= targetCheckin && o.date <= targetCheckout && o.status === "cancelled") {
        o.status = "pending";
        o.cancelReason = null;
      }
    }
  });

  if (isReservationForFuture(r)) {
    delete r.morningEmailSentDate;
    delete r.morningEmailSentAt;
    delete r.receptionNotifiedAt;
    if (r.vehicle) {
      delete r.vehicle.garageNotifiedAt;
      delete r.vehicle.lastNotifiedPlate;
    }
  }

  if (Array.isArray(db.cleaningRequests)) {
    const reqItem = db.cleaningRequests.find(c =>
      (c.flatId === r.flatId || String(c.flatNumber) === String(r.flatNumber)) &&
      (c.requestDate === oldCheckout || c.requestDate === oldCheckin)
    );
    if (reqItem) {
      reqItem.requestDate = targetCheckout;
      reqItem.effectiveDate = targetCheckout;
      if (targetFlatNumber && targetFlatNumber !== String(oldFlatNumber)) {
        reqItem.flatNumber = targetFlatNumber;
        if (targetFlatId) reqItem.flatId = Number(targetFlatId) || targetFlatId;
      }
    }
  }

  // 8. Limpa o Hold Pendente e Marca Concluído
  pending._committed = true;
  pending.status = "paid";
  delete r.pendingModification;

  // 9. Emite Notificação Operacional no Painel
  createNotification({
    category: "checkout",
    title: `🔄 Alteração Confirmada: Apt ${r.flatNumber} (${r.code})`,
    message: `Estadia estendida para ${targetCheckin} a ${targetCheckout}. Pagamento de R$ ${additionalPaid.toFixed(2)} liquidado via ${source}.`,
    severity: "success",
    metadata: {
      reservationCode: r.code,
      additionalAmountToPay: additionalPaid,
      newCheckinDate: targetCheckin,
      newCheckoutDate: targetCheckout
    },
    targetUrl: `/reservas?code=${r.code}`
  });

  // 10. Persistência Atômica no Disco e DB
  saveDatabase("modify_settled_committed");

  return { success: true, committed: true, reservation: r };
}
```

#### C. Update `GET /api/pms/guest-portal/:code/modify-status` (lines 16287–16491)
```javascript
// ── GET /api/pms/guest-portal/:code/modify-status (Status Polling & Commit Atômico) ──
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

    // 2. Validação do ID do Hold
    if (pendingId && pending.pendingId && pending.pendingId !== pendingId && pending.id !== pendingId) {
      return res.status(400).json({
        success: false,
        error: "O identificador da alteração pendente não coincide com o hold ativo."
      });
    }

    // 3. Verificação de Expiração do Hold (30 minutos)
    const nowMs = Date.now();
    const expiresMs = new Date(pending.expiresAt).getTime();
    if (pending.status === "expired" || expiresMs < nowMs) {
      if (pending.status !== "expired") {
        pending.status = "expired";
        pending.expiredAt = new Date().toISOString();
        saveDatabase("modify_hold_expired");
      }
      return res.json({
        success: true,
        paid: false,
        status: "expired",
        committed: false,
        message: "O prazo de 30 minutos para pagamento desta alteração expirou. Por favor, inicie uma nova simulação."
      });
    }

    // 4. Verificação de Cancelamento
    if (pending.status === "canceled" || pending.status === "cancelled") {
      return res.json({
        success: true,
        paid: false,
        status: "canceled",
        committed: false,
        message: "Esta alteração pendente foi cancelada."
      });
    }

    // 5. CONSULTA ATIVA DE PAGAMENTO (Banco Inter & Mercado Pago)
    let paymentVerified = false;
    let paymentDetails = null;

    // Em ambiente de teste automatizado, permite simulação via flag controlada
    if (process.env.NODE_ENV === "test" && (req.query.simulatePayment === "true" || req.headers["x-test-simulate-payment"] === "true")) {
      paymentVerified = true;
      paymentDetails = {
        amount: Number(pending.additionalAmountToPay || 0),
        paidAt: new Date().toISOString(),
        txId: pending.pixTxId || "TEST_TX_123",
        endToEndId: "E99999999TEST",
        paymentMethod: pending.paymentMethod || "pix",
        source: "Teste Automatizado"
      };
    }

    // A. Cobrança PIX Banco Inter por TxId (somente se não liquidado)
    if (!paymentVerified && pending.pixTxId) {
      try {
        const cobData = await checkInterPixCobStatus(pending.pixTxId);
        if (cobData && (cobData.status === "CONCLUIDA" || (Array.isArray(cobData.pix) && cobData.pix.length > 0))) {
          const valorPago = Number(cobData.pix?.[0]?.valor || cobData.valor?.original || pending.additionalAmountToPay);
          paymentVerified = true;
          paymentDetails = {
            amount: valorPago,
            paidAt: cobData.pix?.[0]?.horario || new Date().toISOString(),
            endToEndId: cobData.pix?.[0]?.endToEndId,
            txId: pending.pixTxId,
            paymentMethod: "pix",
            source: "Banco Inter Cobrança"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Inter Pix Cob:", err.message);
      }
    }

    // B. Extrato Bancário Completo Banco Inter (Fallback para PIX estático)
    if (!paymentVerified) {
      try {
        const extratoMatch = await checkInterBankingExtratoPixForPending(r, pending);
        if (extratoMatch && extratoMatch.found) {
          paymentVerified = true;
          paymentDetails = {
            amount: extratoMatch.amount,
            paidAt: extratoMatch.paidAt,
            endToEndId: extratoMatch.endToEndId,
            txId: extratoMatch.txId,
            pagador: extratoMatch.pagador,
            paymentMethod: "pix",
            source: "Banco Inter Extrato"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Inter Extrato:", err.message);
      }
    }

    // C. Mercado Pago (Cartão de Crédito)
    if (!paymentVerified) {
      try {
        const mpSearchRef = `MOD-${r.code}`;
        let mpPayment = await checkMercadoPagoPaymentByRef(mpSearchRef);
        if (!mpPayment && pending.pendingId) {
          mpPayment = await checkMercadoPagoPaymentByRef(pending.pendingId);
        }

        if (mpPayment && mpPayment.status === "approved") {
          const valorPago = Number(mpPayment.transaction_amount || mpPayment.total_paid_amount || pending.additionalAmountToPay);
          paymentVerified = true;
          paymentDetails = {
            amount: valorPago,
            paidAt: mpPayment.date_approved || new Date().toISOString(),
            txId: String(mpPayment.id),
            paymentMethod: "cartao_credito",
            source: "Mercado Pago"
          };
        }
      } catch (err) {
        console.warn("[Modify Status] Erro ao checar Mercado Pago:", err.message);
      }
    }

    // 6. SE LIQUIDADO -> EXECUTA O COMMIT ATÔMICO COM COORDENAÇÃO DE LOCK
    if (paymentVerified && paymentDetails) {
      // Se outra requisição paralela adquiriu o lock durante a verificação bancária, aguarda
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

      // Transição síncrona imediata antes de qualquer await
      pending.status = "committing";

      let resolveLock, rejectLock;
      const commitPromise = new Promise((resolve, reject) => {
        resolveLock = resolve;
        rejectLock = reject;
      });
      activeModificationCommits.set(reservationCode, commitPromise);

      try {
        const commitRes = await commitPendingModification(r, pending, paymentDetails);
        resolveLock(commitRes);

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
      } catch (commitErr) {
        rejectLock(commitErr);
        throw commitErr;
      } finally {
        activeModificationCommits.delete(reservationCode);
      }
    }

    // 7. SE AINDA NÃO LIQUIDADO -> RETORNA PENDING
    return res.json({
      success: true,
      paid: false,
      status: "pending",
      committed: false,
      message: "Aguardando confirmação do pagamento.",
      pendingId: pending.pendingId,
      expiresAt: pending.expiresAt,
      additionalAmountToPay: pending.additionalAmountToPay,
      pixTxId: pending.pixTxId || null,
      pixCopiaECola: pending.pixCopiaECola || null,
      pixQrCodeUrl: pending.pixQrCodeUrl || null,
      mpCheckoutUrl: pending.mpCheckoutUrl || null
    });
  } catch (err) {
    console.error("[Modify Status Check] Erro:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

#### D. Update Guest Clamping in `/modify-preview`, `/modify-checkout`, and `/modify`
Replace:
```javascript
const guestsNum = Math.max(1, Math.min(6, Number(newGuestCount) || r.guestCount || 1));
```
With:
```javascript
const guestsNum = resolveSafeGuestCount(newGuestCount, r.guestCount);
```
at:
- Line 15932 (`/modify-preview`)
- Line 16098 (`/modify-checkout`)
- Line 16621 (`/modify`)

### 4.2. File: `tests/challenger-m1-adversarial-modification.test.mjs`

Update Challenge 2.2 at line 368 to align with the clarified requirement (clamping 0 to 1):
```javascript
    it("2.2. Zero guest count (0) is gracefully clamped to 1 without crash", async () => {
      const res = await fetch(`${BASE_URL}/api/pms/guest-portal/RES-ADV-001/modify-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newCheckinDate: "2026-11-10",
          newCheckoutDate: "2026-11-13",
          newGuestCount: 0
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.newDates.guestCount, 1);
    });
```

---

## 5. Verification Plan

1. **Twin-Server SHA-256 Parity**:
   ```powershell
   Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256
   ```
   Must match 100%.

2. **Repro Concurrency Bug**:
   ```bash
   node --test tests/repro-concurrency-bug.test.mjs
   ```

3. **Challenger Adversarial Suite (25 Tests)**:
   ```bash
   node --test tests/challenger-m1-adversarial-modification.test.mjs
   ```
   Must report 25 pass, 0 fail (specifically Challenge 6.1 and Challenge 2.2 passing).

4. **Milestone 1 Core Test Suite (15 Tests)**:
   ```bash
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
   Must pass 15/15.

5. **System Baselines**:
   ```bash
   node --test tests/bot-actions-api.test.mjs
   node --test tests/tariff-engine.test.mjs
   ```
