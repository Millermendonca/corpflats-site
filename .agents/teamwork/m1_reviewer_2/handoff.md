# Review & Adversarial Challenge Report — Milestone 1: Reservation Modification Settlement Engine

**Reviewer**: m1_reviewer_2 (Roles: reviewer, critic)  
**Parent Agent**: 494db1f9-cfb2-46e9-8b9f-419a8aa9586c  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_reviewer_2`  
**Timestamp**: 2026-10-11T14:06:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Twin-Server SHA-256 Parity
Executed:
```powershell
Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256 | Format-List
```
Output verbatim:
```
Algorithm : SHA256
Hash      : E0AF6D18EA04702F6880FE9EFA9E50EBBBDAB895EF561CA2F69210A5523AD159
Path      : C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\scripts\demo-server.mjs

Algorithm : SHA256
Hash      : E0AF6D18EA04702F6880FE9EFA9E50EBBBDAB895EF561CA2F69210A5523AD159
Path      : C:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\artifacts\api-server\demo-server.mjs
```
Both files are 100% byte-for-byte identical.

### 1.2 Baseline Milestone 1 Test Suite
Executed:
```bash
node --test tests/m1-reservation-modification-settlement.test.mjs
```
Output verbatim:
```
TAP version 13
# Subtest: Milestone 1: Reservation Modification Settlement Engine Suite
    ok 1 - 0. Paridade byte-a-byte estrita entre scripts/demo-server.mjs e artifacts/api-server/demo-server.mjs
    ok 2 - 1. POST /modify-preview: Simula prorrogação com sucesso (read-only, sem mutação no banco)
    ok 3 - 2. POST /modify-preview: Detecta colisão de calendário com outra reserva confirmada (409 Conflict)
    ok 4 - 3. POST /modify-preview: Bloqueia canais externos (403 Forbidden)
    ok 5 - 4. POST /modify-preview: Valida datas inválidas (400 Bad Request)
    ok 6 - 5. POST /modify-checkout: Gera hold provisório de 30 minutos com PIX e mantém datas originais intactas
    ok 7 - 6. Conflito por Hold Ativo: Outra reserva é bloqueada de reservar período sob hold provisório
    ok 8 - 7. GET /api/reservations/availability: Flat sob hold ativo aparece como ocupado
    ok 9 - 8. POST /modify-cancel-pending: Libera o hold provisório e preserva as datas originais
    ok 10 - 9. Liberação confirmada: Período anteriormente bloqueado pelo hold volta a ficar disponível
    ok 11 - 10. Hold Expirado (30 Minutos): Polling em /modify-status detecta expiração e não altera datas
    ok 12 - 11. Direct POST /modify: Rejeita com 402 PAYMENT_REQUIRED quando há valor a pagar
    ok 13 - 12. Direct POST /modify: Permite alteração de custo zero e invalida assinatura (needsReSignature = true)
    ok 14 - 13. Payment Settlement & Atomic Commit: Confirmação de pagamento atualiza datas, adiciona payment e invalida assinatura
    ok 15 - 14. Idempotência de /modify-status: Consultas subsequentes confirmam status sem efeitos colaterais
ok 1 - Milestone 1: Reservation Modification Settlement Engine Suite
# tests 15
# suites 1
# pass 15
# fail 0
```
Duration: 6.8s. Exit code: 0.

### 1.3 Regression Suites & Frontend Build
- `tests/bot-actions-api.test.mjs`: 5/5 subtests passed (exit code 0).
- `tests/tariff-engine.test.mjs`: 8/8 subtests passed (exit code 0).
- `npm run build` in `artifacts/limpeza`: built clean in 57.48s (exit code 0).

### 1.4 Code Inspection: Implementation of Core Guardrails
1. **Conflict Detection**:
   - `scripts/demo-server.mjs:15524` (`hasReservationConflict`):
     - Evaluates active reservations against `targetFlatNumber` and `targetFlatId`.
     - Evaluates active provisional holds in `other.pendingModification` (`expiresAt < nowMs` lazily marks expired).
     - Evaluates room maintenance blocks in `db.roomBlocks`.
     - Wired into `/modify-preview` (line 15936), `/modify-checkout` (line 16102), and guarded `/modify` (line 16625).
2. **Hold and Dates Separation**:
   - `POST /modify-checkout` (line 16227): Writes exclusively to `r.pendingModification`. `r.checkinDate` and `r.checkoutDate` are never mutated before payment.
   - `POST /modify` (line 16683): Rejects positive amount differences immediately with HTTP 402 `PAYMENT_REQUIRED` before mutating any dates.
3. **Cancel & Abandon**:
   - `POST /modify-cancel-pending` (line 16529): Deletes `r.pendingModification` and logs audit trail. Original stay dates remain completely untouched.
   - Abandonment: Holds expire after 30 minutes (`expiresAt < nowMs`) and are ignored by conflict/availability checks.
4. **Payment Settlement & Atomic Commit**:
   - `commitPendingModification` (lines 15616-15842): Updates `checkinDate`, `checkoutDate`, increments `totalAmount` and `paidAmount`, pushes entry to `r.payments`, records entry to `r.modificationHistory`, invalidates pre-checkin (`r.needsReSignature = true`, `r.fnhrCompleted = false`), and atomically calls `saveDatabase("modify_settled_committed")`.
5. **Integrity Check**:
   - No hardcoded test responses or fake facade logic found. Real mathematical calculation of nights, daily rates, 24-hour cutoff policies, and live Banco Inter / Mercado Pago client calls.

### 1.5 Adversarial Vulnerability: Concurrency Race Condition in Status Polling
In `scripts/demo-server.mjs`:
- Line 16328: `const pending = r.pendingModification;` is assigned synchronously before network I/O.
- Lines 16385-16449: Multiple asynchronous calls await external banking APIs:
  - `await checkInterPixCobStatus(...)`
  - `await checkInterBankingExtratoPixForPending(...)`
  - `await checkMercadoPagoPaymentByRef(...)`
- Line 16453: `const commitRes = await commitPendingModification(r, pending, paymentDetails);`
- In `commitPendingModification` (lines 15616-15626):
  ```javascript
  export async function commitPendingModification(r, pending, { ... } = {}) {
    if (!r || !pending) return { success: false, error: "Reserva ou alteração pendente ausente." };
  ```
  **Vulnerability**: `commitPendingModification` does NOT check whether `r.pendingModification` is still attached or whether `pending.pendingId` has already been committed in `r.modificationHistory`.
- Empirical test execution of `tests/repro-concurrency-bug.test.mjs` (3 concurrent requests):
  ```
  Initial totalAmount: 300, additional: 150
  Expected totalAmount: 450
  Actual totalAmount: 750
  Actual paidAmount: 750
  Actual payments count: 4 (expected: 2, 1 initial + 1 mod)
  Actual modificationHistory count: 3 (expected: 1)
  ```
- Empirical test execution of `tests/challenger-m1-adversarial-modification.test.mjs` (15 concurrent requests):
  ```
  Expected values to be strictly equal:
  6400 !== 800
  ```
  The payment was committed 15 times!

---

## 2. Logic Chain

1. In Milestone 1, the core business objective is to prevent double-booking, block unpaid date changes, and provide atomic payment settlement for reservation modifications.
2. The implementation successfully implements all 5 endpoints, maintains strict byte-for-byte twin-server parity, and passes all 15 tests in `m1-reservation-modification-settlement.test.mjs`.
3. However, under adversarial review and concurrency stress-testing, an asynchronous Time-Of-Check to Time-Of-Use (TOCTOU) race condition exists in `GET /api/pms/guest-portal/:code/modify-status` and `commitPendingModification`:
   - During the async `await` on banking calls, multiple polling requests from the guest's browser/tabs enter the handler concurrently.
   - All concurrent requests capture the same `pending` object reference into local scope before any commit happens.
   - Once banking APIs resolve that payment is received, all concurrent requests invoke `commitPendingModification` with their cached `pending` reference.
   - Because `commitPendingModification` lacks an idempotency guard checking `!r.pendingModification` or `r.modificationHistory.some(m => m.pendingId === pending.pendingId)`, every concurrent request increments `r.totalAmount` and `r.paidAmount`, pushes another payment object into `r.payments`, and appends duplicate entries to `r.modificationHistory`.
4. In financial hotel software handling real PIX and credit card transactions, multiplying balances and duplicating payment records upon concurrent polling is a critical financial defect.
5. Therefore, the implementation cannot be approved until this idempotency guard is added.

---

## 3. Caveats

- In sequential polling (e.g. Test 14 where request 2 is issued strictly after request 1 completes), idempotency works correctly because `delete r.pendingModification` occurred before request 2 started. The bug only manifests when polling requests are concurrent / in-flight at the same time.
- No integrity violations (cheating, facade code, hardcoded mocks) were found; the implementation is genuine and well-architected, requiring only this specific concurrency defense.

---

## 4. Conclusion & Actionable Findings

### Explicit Verdict: **REQUEST_CHANGES**

### Findings Breakdown

#### [Critical] Finding 1: Concurrency Race Condition in `/modify-status` Multiplies Payments and Inflates `totalAmount`
- **Location**: `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs`:
  - `commitPendingModification` (lines 15616-15630)
  - `/modify-status` (lines 16328-16470)
- **Impact**: Concurrent polling requests from guest portal during bank network I/O commit multiple times, causing financial balance corruption in `data/database.json`.
- **Required Fix**:
  1. Add an idempotency check at the very top of `commitPendingModification`:
     ```javascript
     const pendingId = pending.pendingId || pending.id;
     if (!r.pendingModification || (pendingId && Array.isArray(r.modificationHistory) && r.modificationHistory.some(m => m.pendingId === pendingId))) {
       return { success: true, committed: true, alreadyCommitted: true, reservation: r };
     }
     ```
  2. In `GET /modify-status`: before calling `commitPendingModification`, check if `!r.pendingModification` or if `r.modificationHistory` already contains `pendingId`. If so, return `{ success: true, paid: true, status: "paid", committed: true, ... }` immediately.
  3. Ensure both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` receive the exact same fix to preserve 100% SHA-256 parity.

#### [Minor] Finding 2: Inconsistent Error Payload in `/modify-checkout` Conflict
- **Location**: `scripts/demo-server.mjs:16112`
- **Impact**: When conflict occurs, `/modify-preview` returns `{ success: false, available: false, error: "CONFLICT", message: ... }`, whereas `/modify-checkout` returns `{ error: "FLAT_UNAVAILABLE", message: ... }` without `success: false`.
- **Suggestion**: Include `success: false, error: "CONFLICT"` in `/modify-checkout` for uniform frontend error handling.

---

## 5. Verification Method

To independently verify after implementing the fix:

1. **Verify Baseline Parity & Suite**:
   ```powershell
   Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs -Algorithm SHA256
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
2. **Verify Concurrency Resilience**:
   ```bash
   node --test tests/repro-concurrency-bug.test.mjs
   node --test tests/challenger-m1-adversarial-modification.test.mjs
   ```
   Both test suites must pass 100% with no duplicate commits and exact balance matching (`totalAmount === 450` in repro, `totalAmount === 800` in challenger).
3. **Verify Regression & Build**:
   ```bash
   node --test tests/bot-actions-api.test.mjs
   npm run build --prefix artifacts/limpeza
   ```
