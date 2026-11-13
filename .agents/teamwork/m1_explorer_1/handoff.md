# Handoff Report: Milestone 1 — Endpoint `/api/pms/guest-portal/:code/modify-preview` & Conflict Engine Design

**Agent**: M1 Explorer 1  
**Milestone**: Milestone 1 — Backend Simulation, Hold & Settlement Engine  
**Task**: Design of endpoint `POST /api/pms/guest-portal/:code/modify-preview` and multi-layered calendar conflict checking.  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1`  
**Artifacts Produced**:
- `analysis.md`: Detailed architecture report and complete code blueprint.
- `handoff.md`: 5-component handoff specification.

---

## 1. Observation

1. **`ORIGINAL_REQUEST.md` (lines 85–135)**:
   - R1 defines: "The guest portal and backend must provide a simulation mechanism (`/modify-preview`) before any changes are committed: Validate flat calendar availability against existing active reservations to prevent conflicts. Calculate daily rate, extra nights, additional amount to pay, or eligible refunds according to the 24-hour policy."
   - Acceptance Criteria (line 120): "Attempting to modify a reservation to a conflicting date range on the same flat returns an availability error and blocks checkout."

2. **`PROJECT.md` (lines 1–59)**:
   - Backend Core: In-memory `db` persisted atomically via `atomicWriteFileSync` in `data/database.json`. Server entry points in `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` maintaining strict 100% byte-for-byte SHA-256 parity.
   - Milestone 1: Backend Simulation, Hold & Settlement Engine (`/modify-preview`, `/modify-checkout`, `/modify-status`, `/modify-cancel-pending`).
   - Interface Contract (lines 35–37):
     - `POST /api/pms/guest-portal/:code/modify-preview`:
       - Input: `{ newCheckinDate: string, newCheckoutDate: string, newGuestCount?: number, newFlatId?: string, reason?: string }`
       - Output: `{ success: true, available: boolean, conflictMessage?: string, originalDates: { checkinDate, checkoutDate }, newDates: { checkinDate, checkoutDate }, dailyRate: number, extraNights: number, additionalAmountToPay: number, refundAmount: number, currency: 'BRL', requiresPayment: boolean }`

3. **`survey_report.md` (lines 10–22, 110–123, 301–383)**:
   - Diagnosed that the legacy endpoint `POST /api/pms/guest-portal/:code/modify` (lines 15456–15716) mutates dates in the database immediately, without checking for prior settlement.
   - Identified that availability checking lacked support for provisional holds (`pendingModification`) and room maintenance blocks (`db.roomBlocks`).

4. **`scripts/demo-server.mjs` (lines 15456–15716)**:
   - Legacy endpoint starts at line 15456.
   - Line 15459: `const r = findReservationByLocatorOrContact(code);` resolves reservation by locator, ID, phone, CPF, or name.
   - Lines 15488–15496: Existing conflict checking on same flat:
     ```javascript
     const flatNumberStr = String(r.flatNumber || r.flatId);
     const hasConflict = (db.reservations || []).some(other => {
       if (other.id === r.id || other.code === r.code) return false;
       if (other.status === "cancelada" || other.status === "CANCELLED") return false;
       const otherFlat = String(other.flatNumber || other.flatId);
       if (otherFlat !== flatNumberStr) return false;
       return (newCheckinDate < other.checkoutDate) && (newCheckoutDate > other.checkinDate);
     });
     ```
   - Lines 15505–15545: Duration, rate, and 24h cutoff calculation:
     ```javascript
     const parseDate = (dStr) => new Date(dStr + "T00:00:00Z");
     const oldNights = Math.max(1, Math.round((parseDate(r.checkoutDate) - parseDate(r.checkinDate)) / (1000 * 3600 * 24)));
     const newNights = Math.max(1, Math.round((parseDate(newCheckoutDate) - parseDate(newCheckinDate)) / (1000 * 3600 * 24)));
     const dailyRate = Number(r.dailyRate) || (oldNights > 0 ? (Number(r.totalAmount || 0) / oldNights) : 160);
     const originalCheckin = new Date(r.checkinDate + "T14:00:00-03:00");
     const cutoff24h = new Date(originalCheckin.getTime() - 24 * 3600 * 1000);
     const now = new Date();
     const isUnder24h = now.getTime() >= cutoff24h.getTime();
     ```

5. **Twin-Server Parity Check**:
   - `powershell -Command "Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs"`
   - Output confirmed identical SHA-256: `4FDDE099E92A3036D49E7C1ED5E1E57CF3568719D0E7573D4AC6F6AB9B92CAEB`.

---

## 2. Logic Chain

1. **Premise**: In the current architecture, changing reservation dates directly mutates the database. If a user extends a stay by 2 days and leaves before paying, the dates are already extended without payment.
2. **Inference 1**: To satisfy R1, we need a dedicated simulation endpoint (`/modify-preview`) that executes purely in-memory (read-only) and never calls `saveDatabase()`.
3. **Inference 2**: When checking availability for a modification, the engine must evaluate:
   - Layer 1: Confirmed and active reservations in `db.reservations` (excluding `r` itself so the guest's own dates do not cause false positives).
   - Layer 2: Active provisional modification holds (`other.pendingModification` where `status === "pending_payment"` and `expiresAt > now`).
   - Layer 3: Room maintenance blocks in `db.roomBlocks`.
4. **Inference 3**: If a conflict is found, the endpoint must return HTTP 409 with payload `{ success: false, available: false, error: "CONFLICT", message: "...", conflictMessage: "..." }`.
5. **Inference 4**: If available, the engine calculates:
   - Stay durations (`oldNights`, `newNights`, `extraNights = Math.max(0, newNights - oldNights)`, `reducedNights = Math.max(0, oldNights - newNights)`).
   - Daily rate: `Number(r.dailyRate) || (oldNights > 0 ? Number(r.totalAmount || 0) / oldNights : 160)`.
   - 24-hour cutoff: `cutoff24h = new Date(new Date(r.checkinDate + "T14:00:00-03:00").getTime() - 24 * 3600 * 1000)`.
   - Under 24h: reductions have `nonRefundableReduction = true` and `refundAmount = 0`.
   - Over 24h: reductions have `refundAmount = reducedNights * dailyRate`.
   - Extensions: `additionalAmountToPay = extraNights * dailyRate`, `requiresPayment = true`.
   - Changes in dates or flat: `requiresReSignature = true`.
6. **Inference 5**: The endpoint returns HTTP 200 with the exact contract specified in `PROJECT.md` and the dispatch message.

---

## 3. Caveats

1. **Twin-Server Parity**: When applying this code, the implementer must modify both `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` simultaneously so their SHA-256 hashes match.
2. **Subsequent Endpoints**: This design addresses `modify-preview` (simulation). The subsequent endpoints in Milestone 1 (`modify-checkout`, `modify-status`, and `modify-cancel-pending`) depend on `r.pendingModification` structure documented in Section 6 of `survey_report.md` and Section 4 of `analysis.md`.
3. **External Channels**: Reservations from channels other than direct (`whatsapp`, `site`, `site_direto`, `direto`, `balcao`) return HTTP 403 `EXTERNAL_CHANNEL`.

---

## 4. Conclusion

The specification and code blueprint for `POST /api/pms/guest-portal/:code/modify-preview` have been fully drafted, verified against project conventions, and documented in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1\analysis.md`. The endpoint provides:
- Complete input validation (locator, channels, date formats, ordering, flat lookup).
- 3-layer conflict checking (active reservations excluding current, pending holds, room blocks).
- Precise 24h cutoff financial simulation.
- Structured JSON response complying with `PROJECT.md`.
- Read-only execution with zero database side-effects.

---

## 5. Verification Method

To independently verify the blueprint:
1. **File Review**:
   - Inspect `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1\analysis.md` (Sections 2, 4, 5, and 6).
2. **Automated Unit & Integration Testing**:
   - Run Node.js test runner against the 10 test vectors detailed in Section 7 of `analysis.md` using:
     ```powershell
     node --test tests/modify-preview.test.mjs
     ```
3. **Parity Check**:
   - Verify file hash parity between servers:
     ```powershell
     powershell -Command "Get-FileHash scripts/demo-server.mjs, artifacts/api-server/demo-server.mjs"
     ```
   - Invalidation condition: Any difference in hash between the two server files invalidates deployment.
