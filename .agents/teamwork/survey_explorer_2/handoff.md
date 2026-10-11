# Handoff Report — Survey Explorer 2

## 1. Observation
- **Authoritative Request**: In `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (section `2026-10-11T12:53:32Z`), requirements R1 to R4 specify:
  - Multi-step reservation modification flow with `/modify-preview` availability simulation and pricing breakdown.
  - Mandatory payment settlement before dates are committed if `additionalAmountToPay > 0`.
  - Mandatory invalidation of check-in signature (`needsReSignature = true`) and dispatch of re-signing link via WhatsApp/email whenever dates or flat change.
  - Real-time synchronization of reception panel, garage panel, and housekeeping schedules.
- **Current Modification Implementation in Frontend**:
  - `artifacts/limpeza/src/pages/guest-portal.tsx` line 106 defines modal states: `modifyModalOpen`, `modCheckinDate`, `modCheckoutDate`, `modGuestCount`, `modReason`, `modifying`, `modifyError`, `modifySuccess`.
  - Lines 1914-1922 and lines 3034-3044 contain the `"Modificar Reserva"` trigger buttons.
  - In `guest-portal.tsx` lines 324-358, `handleConfirmModify` performs a direct `POST /api/pms/guest-portal/:code/modify` with `{ newCheckinDate, newCheckoutDate, newGuestCount, reason }` without prior preview endpoint invocation or payment checkout.
- **Current Modification Implementation in Backend**:
  - In `scripts/demo-server.mjs` lines 15456-15715, `/api/pms/guest-portal/:code/modify`:
    - Checks calendar conflict on the flat (lines 15488-15502).
    - Computes `additionalAmountToPay` and `refundAmount` (lines 15505-15548).
    - **Immediately alters reservation dates in database**: `r.checkinDate = newCheckinDate; r.checkoutDate = newCheckoutDate;` (lines 15615-15616) **regardless of whether `additionalAmountToPay > 0`**.
    - Does NOT set `r.needsReSignature = true` (lines 15607-15618).
- **Current Re-signature Architecture**:
  - In `scripts/demo-server.mjs` lines 13726-13768, the Admin PMS PUT/PATCH endpoint sets `r.needsReSignature = true` and `g.needsReSignature = true` when dates/flat change.
  - In `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` line 2067, an existing amber banner renders when `reservation?.needsReSignature || guestList[selectedGuestIndex - 1]?.needsReSignature` is true.
  - In `artifacts/limpeza/src/pages/guest-portal.tsx` lines 448-469, `isPreCheckinDone` does NOT check `needsReSignature`, so old completed status persists. There is no top re-signature banner.
  - In `scripts/demo-server.mjs` lines 19350-19475 (`POST /api/pms/pre-checkin`), submitting the check-in form did NOT reset `needsReSignature = false`, which would leave reservations flagged indefinitely.
- **Reception Tablet & Operations Sync**:
  - In `scripts/demo-server.mjs` line 17248, `/api/reception/today` evaluates `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`. If `needsReSignature` is true, physical entry is blocked at the portaria.
  - In `artifacts/limpeza/src/pages/reception-tablet.tsx` line 196, polling runs every 15 seconds.
  - In `artifacts/limpeza/src/pages/garage-dashboard.tsx` line 67, `/api/pms/garage/daily-sheet` loads authorized vehicles based on current reservation stay dates.
- **Twin-Server Parity & Frontend Build**:
  - `Get-FileHash artifacts\api-server\demo-server.mjs, scripts\demo-server.mjs`: Both have identical SHA-256 hash `4FDDE099E92A3036D49E7C1ED5E1E57CF3568719D0E7573D4AC6F6AB9B92CAEB`.
  - Frontend build: `npm run build` in `artifacts/limpeza` exited with code 0 (`✓ built in 45.37s`), producing bundles in `artifacts/limpeza/dist/public/`.
  - TypeScript: `guest-portal.tsx` and `guest-pre-checkin.tsx` have zero compilation errors.

## 2. Logic Chain
1. From Observation 1 & 2, the current guest portal modification modal allows guests to extend stay dates without paying beforehand because the endpoint directly updates `checkinDate` and `checkoutDate` upon form submission.
2. Therefore, to satisfy Requirement R1 and R2, the flow must be split into:
   - Step 1: Preview simulation calling `/api/pms/guest-portal/:code/modify-preview`, showing availability status badge and pricing breakdown.
   - Step 2: If `additionalAmountToPay > 0`, generating a provisional modification intent (`/modify-intent`) with PIX QR Code/Copia e Cola and Mercado Pago card link, maintaining original dates untouched until payment verification.
3. From Observation 3, when dates change, Brazilian lodging regulations require renewing the FNRH declaration because the dates and nights specified in the forensic signed document diverge from the actual stay.
4. From Observation 4 & 5, setting `r.needsReSignature = true` will automatically cause the reception tablet (`reception-tablet.tsx`) to show check-in as pending, preventing key handoff until re-signed.
5. In `guest-portal.tsx`, a prominent banner must alert the guest and link to `/pre-checkin/${code}?resign=1`. In `guest-pre-checkin.tsx`, `?resign=1` should fast-track the guest to Step 3 (Signature Canvas) since all personal information and photos are already retained in the database.
6. Upon signing, `POST /api/pms/pre-checkin` must clear `needsReSignature`, regenerate the forensic PDF with SHA-256 hash, and email it to the reception.

## 3. Caveats
- No caveats regarding frontend build stability: `npm run build` is fully functional and creates valid production artifacts.
- Assumption: The payment verification for modification extensions can leverage the existing Inter PIX polling and Mercado Pago preference patterns already present in `demo-server.mjs`.

## 4. Conclusion
The frontend and backend architecture has been completely surveyed and mapped. The current codebase has solid building blocks (PIX polling in `guest-portal.tsx`, re-signature banner in `guest-pre-checkin.tsx`, portaria blocking in `reception-tablet.tsx`), but currently lacks the Step 1 preview simulation, Step 2 provisional payment settlement guardrail, guest portal re-signature banner, and backend clearing of `needsReSignature`. The implementation plan detailed in `survey_report.md` provides all exact endpoints, component states, and UI specifications ready for implementation.

## 5. Verification Method
1. Inspect `artifacts/limpeza/src/pages/guest-portal.tsx` lines 324-358 and lines 3117-3323 to verify current single-step modal logic.
2. Inspect `scripts/demo-server.mjs` lines 15456-15715 to verify `/api/pms/guest-portal/:code/modify`.
3. Run `npm run build` in `artifacts/limpeza` to confirm clean compilation:
   ```powershell
   npm --prefix artifacts/limpeza run build
   ```
4. Verify SHA-256 byte parity between server copies:
   ```powershell
   Get-FileHash artifacts\api-server\demo-server.mjs, scripts\demo-server.mjs
   ```
