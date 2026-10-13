# Handoff Report: Milestone 3 — Multi-Step Reservation Modification Modal Blueprint

**Sender**: M3 Explorer 1 (`f4e1de33-cfe1-4b4f-8547-e548d6c6d19b`)  
**Recipient**: Parent Orchestrator (`494db1f9-cfb2-46e9-8b9f-419a8aa9586c`)  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m3_explorer_1`  
**Target Codebase File**: `artifacts/limpeza/src/pages/guest-portal.tsx`  
**Reference Specification**: `analysis.md` in the working directory  

---

## 1. Observation

1. **Milestone 1 Endpoints**:
   - `scripts/demo-server.mjs` (lines 16109-16304): `POST /api/pms/guest-portal/:code/modify-preview` implemented as a read-only calendar availability checker returning `{ available, conflictMessage, dailyRate, duration, extraNights, additionalAmountToPay, refundAmount, requiresPayment, requiresReSignature, isUnder24h, nonRefundableReduction, policyNotice }`. Returns 409 Conflict if destination flat is double-booked.
   - `scripts/demo-server.mjs` (lines 16306-16549): `POST /api/pms/guest-portal/:code/modify-checkout` generates a 30-minute provisional hold in `r.pendingModification`, generates PIX dynamic/static payload (`pixQrCodeUrl`, `pixCopiaECola`, `pixTxId`) and Mercado Pago Checkout preference (`mpCheckoutUrl`), keeping original dates intact until payment.
   - `scripts/demo-server.mjs` (lines 16551-16815): `GET /api/pms/guest-portal/:code/modify-status?pendingId=...` verifies settlement with Banco Inter and Mercado Pago, triggers atomic commit with mutex locking (`activeModificationCommits`), updates dates, sets `needsReSignature = true`, and returns `{ success, paid, status, committed, newCheckinDate, newCheckoutDate, flatNumber, needsReSignature, reSignatureUrl }`.
   - `scripts/demo-server.mjs` (lines 16817-16895): `POST /api/pms/guest-portal/:code/modify-cancel-pending` removes `r.pendingModification`, logs audit trail, and preserves original dates.
   - `scripts/demo-server.mjs` (lines 16898-17249): `POST /api/pms/guest-portal/:code/modify` blocks with `402 PAYMENT_REQUIRED` if `additionalAmountToPay > 0`, but commits immediately if cost is zero, setting `needsReSignature = true`.

2. **Existing Implementation in `artifacts/limpeza/src/pages/guest-portal.tsx`**:
   - Lines 105-114: Basic state declarations `modCheckinDate`, `modCheckoutDate`, `modGuestCount`, `modReason`, `modifying`, `modifyError`, `modifySuccess`.
   - Lines 324-358: Handler `handleConfirmModify` performs a direct unsimulated call to `POST /modify`, which triggers `402 PAYMENT_REQUIRED` whenever extra nights are selected.
   - Lines 1914-1923: "Modificar Reserva" button opens `modifyModalOpen`.
   - Lines 3117-3323: Single-step dialog markup lacking simulation, conflict badge, hold timer, PIX QR Code/Copia e Cola, payment status polling, and re-signing CTA.
   - Main page does not yet display an alert banner when `reservation.needsReSignature === true`.

---

## 2. Logic Chain

1. **From Observation 1**: The backend requires a 2-stage interaction for extensions (Simulation `/modify-preview` followed by Hold & Checkout `/modify-checkout`), rejecting direct modification with 402 `PAYMENT_REQUIRED`.
2. **From Observation 2**: The frontend currently skips simulation and hold creation, causing guest modification requests with additional nights to fail immediately upon submission.
3. **Connecting Step 1 (Preview)**: By integrating `POST /modify-preview` on date changes, the frontend immediately flags calendar collisions (409 Conflict) and presents a transparent cost breakdown (`dailyRate`, `extraNights`, `additionalAmountToPay`, `refundAmount`, 24h rule).
4. **Connecting Step 2 (Checkout)**: By calling `POST /modify-checkout` when `requiresPayment` is true, a 30-minute hold is established. Presenting PIX (QR Code image + Copia e Cola button) alongside Mercado Pago card link, paired with automated background polling on `/modify-status` (cadence: 2.5s) and a visible 30-min countdown timer, guarantees automatic commit upon payment. Providing `handleCancelHold` allows the guest to abort cleanly.
5. **Connecting Step 3 (Success & Re-signature)**: Once `/modify-status` reports `committed: true` or zero-cost `/modify` succeeds, transitioning to Step 3 with a dedicated CTA linking to `/pre-checkin/:code?resign=1` fulfills Requirement R3.
6. **Main Page Guardrail**: Adding a persistent top banner on `guest-portal.tsx` when `reservation.needsReSignature === true` ensures the guest is reminded to re-sign even after closing the modal.

---

## 3. Caveats

- **External Channels (OTAs)**: The backend rejects modifications for reservations from external OTAs (Booking, Airbnb) with 403 `EXTERNAL_CHANNEL`. The UI already guards the button with `directChannels.includes(channel)`.
- **Payment Gateway Credentials in Test Mode**: In test environments where Banco Inter mTLS is mocked, `/modify-status` supports simulated settlement via query parameter `simulatePayment=true`.
- **Pre-checkin Route Param**: Re-signing link targets `/pre-checkin/:code?resign=1`, which is handled by Milestone 2 in `guest-pre-checkin.tsx`.

---

## 4. Conclusion

A complete, production-grade drop-in blueprint for `artifacts/limpeza/src/pages/guest-portal.tsx` has been designed and documented in `analysis.md`. It covers:
1. Multi-step state management (`preview` → `checkout` → `success`).
2. Automatic simulation and cost calculation via `/modify-preview`.
3. 30-minute hold management with countdown timer, PIX QR Code & Copia e Cola, Card redirect, and active polling on `/modify-status`.
4. Graceful hold release via `/modify-cancel-pending`.
5. Prominent re-signature CTAs and top page banner for `needsReSignature = true`.

---

## 5. Verification Method

To verify the proposed blueprint:
1. **Source Inspection**: Review `analysis.md` sections 4.1 through 4.5 for complete code blocks matching React/TypeScript types, Lucide icons, and Tailwind styling.
2. **Backend Compatibility**: Verify that the endpoints in `scripts/demo-server.mjs` lines 16109-16895 accept and respond with the exact schemas specified.
3. **Automated M1 Test Coverage**: Inspect `tests/m1-reservation-modification-settlement.test.mjs` (Tier 1 through Tier 5) which validates all simulation, hold, polling, cancellation, and re-signing invariants expected by this UI.
4. **Invalidation Conditions**: If Milestone 1 endpoint schemas are altered, or if re-signing query parameter differs from `?resign=1`, update the corresponding handler calls in the blueprint.
