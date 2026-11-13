## 2026-10-11T13:25:53Z

You are M1 Worker for Milestone 1 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_worker_1
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive File Ownership:
You own exclusively:
- `scripts/demo-server.mjs`
- `artifacts/api-server/demo-server.mjs` (must remain 100% byte-for-byte SHA-256 identical with `scripts/demo-server.mjs`)
- `tests/m1-reservation-modification-settlement.test.mjs`

Inputs to Read:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_1\analysis.md` (Preview API & conflict engine blueprint)
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2\analysis.md` (Checkout & 30-min hold engine blueprint)
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_3\analysis.md` (Settlement commit, status polling & test suite blueprint)

Implementation Scope:
1. Implement `POST /api/pms/guest-portal/:code/modify-preview`:
   - Validates dates, duration, locator, and channel (403 for external OTA channels).
   - Multi-layer conflict checking: confirmed reservations (excluding current), active provisional holds, room blocks.
   - Calculates duration, daily rate, extra nights, additionalAmountToPay, and 24h cutoff refund policy.
   - Returns structured JSON payload per PROJECT.md interface contract.
2. Implement `POST /api/pms/guest-portal/:code/modify-checkout`:
   - Validates conflict on target flat.
   - Creates provisional hold `r.pendingModification = { pendingId, newCheckinDate, newCheckoutDate, newGuestCount, newFlatId, additionalAmountToPay, createdAt, expiresAt (now + 30 min), status: 'pending', pixTxId, pixQrCodeUrl, pixCopiaECola, mpPreferenceId, mpCheckoutUrl }`.
   - Generates PIX (dynamic Inter or static EMV BR Code with QRCode) and Mercado Pago preference.
   - Saves atomically to database via `saveDatabase()`.
   - Leaves `r.checkinDate` and `r.checkoutDate` untouched.
3. Integrate calendar conflict checking in server availability functions to respect active `pendingModification` blocks (with 30-minute expiration).
4. Implement `GET /api/pms/guest-portal/:code/modify-status?pendingId=...` and helper `commitPendingModification`:
   - Checks payment receipt for the pending hold via PIX or Mercado Pago.
   - Idempotently and atomically updates `r.checkinDate`, `r.checkoutDate`, increments `r.totalAmount` and `r.paidAmount`, appends to `r.payments`, logs in `r.modificationHistory` and `addReservationAuditLog`, invalidates signatures (`r.needsReSignature = true`, `r.fnhrCompleted = false`), removes `r.pendingModification`, and persists via `saveDatabase()`.
5. Implement `POST /api/pms/guest-portal/:code/modify-cancel-pending`:
   - Immediately clears `r.pendingModification` without touching original reservation dates.
6. Guard direct `POST /api/pms/guest-portal/:code/modify`:
   - If `additionalAmountToPay > 0`, reject with `402 Payment Required` and payload directing to `/modify-checkout`.
   - If `additionalAmountToPay === 0`, commit change and mandate `r.needsReSignature = true`.
7. Enforce byte-for-byte SHA-256 parity:
   - Ensure `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` have identical SHA-256 hashes.
8. Create comprehensive automated test suite in `tests/m1-reservation-modification-settlement.test.mjs`:
   - Test preview with availability & conflict error (409).
   - Test checkout with pending hold generation.
   - Test calendar conflict blocked by active pending hold.
   - Test cancel pending releases the hold without touching original dates.
   - Test payment verification & atomic commit (updating dates, payments, modificationHistory, and setting needsReSignature = true).
   - Test direct modify rejects unpaid extensions (402).
   - Test twin-server SHA-256 parity.
9. Execute tests using `node --test tests/m1-reservation-modification-settlement.test.mjs` and verify all pass with exit code 0.
10. Update progress.md, write handoff.md, and send completion message back to the orchestrator.
