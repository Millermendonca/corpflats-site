# Handoff Report: Survey Explorer 3

**Author**: Survey Explorer 3  
**Date**: 2026-10-11T13:20:00Z  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_3`  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **Check-in Document & PDF Engine**:
   - `scripts/fnrh-pdf-service.mjs` lines 71-116 and 485-534: `generateFnrhPdf()` generates an official PDF using `pdfkit` and `qrcode`, with forensic trail, QR Code to `/verificar-ficha/${documentUuid}`, canonical SHA-256 hash, and file SHA-256 hash. Uploads to Cloudflare R2 via `storage-service.mjs` and writes locally to `secure_uploads/fnrh_documents/Ficha_Checkin_${reservationId}_${cleanCpf}_${timestamp}.pdf`.
   - `scripts/fnrh-pdf-service.mjs` lines 540-583: `rebuildFnrhPdfOnTheFly()` enables dynamic PDF reconstruction when disk cache is lost.
   - `scripts/demo-server.mjs` lines 19555-19632: `POST /api/pms/pre-checkin` calls `generateFnrhPdf`, sets `r.checkedInAt`, `r.fnrhSha256Hash`, `r.fnrhDocumentUuid`, `targetGuest.hasCompletedCheckin = true`, and stores audit trail in `db.fnrhAuditDocuments`.
   - `scripts/demo-server.mjs` lines 19643-19694: Immediately sends email with FNRH and ID photo attachments via `sendEmailAsync()` to reception and garage if check-in is today or past (`isReservationForTodayOrPast(r)`). For future check-ins, email is held until the 07:00 morning routine.

2. **Reservation Modification & Re-Signature Logic Discrepancy**:
   - `scripts/demo-server.mjs` lines 13712-13768 (`PUT /api/pms/reservations/:id`): Admin PMS modification explicitly tests `isDatesOrFlatChanged`. If true and reservation had signed check-in, it sets:
     ```javascript
     r.fnhrCompleted = false;
     r.signatureUrl = null;
     r.checkedInAt = null;
     r.needsReSignature = true;
     r.reSignatureReason = "Alteração de acomodação (flat) ou período da estadia";
     delete r.fnrhPdfUrl;
     delete r.fnrhDocumentUuid;
     delete r.fnrhSha256Hash;
     ```
   - In stark contrast, `scripts/demo-server.mjs` lines 15456-15716 (`POST /api/pms/guest-portal/:code/modify`): Guest self-service modification:
     - Directly modifies `r.checkinDate = newCheckinDate` and `r.checkoutDate = newCheckoutDate` at line 15615 without payment verification.
     - Does **NOT** check or set `needsReSignature`.
     - Does **NOT** invalidate previous signatures or delete stale FNRH document links.
     - Has **NO** preview endpoint (`/modify-preview`).

3. **Automated WhatsApp and Email Notifications**:
   - `scripts/zapi-service.mjs` lines 497-518: Defines template `tpl_reservation_updated` with button `📝 Assinar Ficha Atualizada` pointing to `{{link_checkin_digital}}`.
   - `scripts/zapi-service.mjs` lines 1866-1869: Resolves `{{link_checkin_digital}}` via `getCheckinUrlSync(reservation, recipientGuestIndex, appOrigin, db)`.
   - `scripts/demo-server.mjs` line 14433: Admin edit dispatches `triggerImmediateWhatsApp("reservation_updated", resvForTrigger)`, but does NOT dispatch an explicit notification with the personalized re-signing link when `needsReSignature` is flagged.
   - `scripts/demo-server.mjs` lines 15651-15679: Portal modification sends an email update to reception, but sends NO WhatsApp message or guest email regarding re-signature.

4. **Operational Panels & Schedulers**:
   - `artifacts/limpeza/src/pages/reception-tablet.tsx` line 196: Polls `/api/reception/today` every 15 seconds (`setInterval(fetchToday, 15000)`).
   - `scripts/demo-server.mjs` lines 17248 & 17399: `/api/reception/today` checks:
     `hasCompletedCheckin: Boolean(r.fnhrCompleted && !r.needsReSignature)`
     and `hasPreCheckin: Boolean((r.fnhrCompleted && !r.needsReSignature) || someCheckinDone)`.
   - `artifacts/limpeza/src/pages/garage-dashboard.tsx`: Fetches `/api/pms/garage/daily-sheet` on mount, but has no auto-polling timer.
   - `scripts/demo-server.mjs` lines 30665-30747: 07:00 morning routine runs every 5 minutes (`setInterval(..., 300000)`), sending emails with FNRH PDF attachments for reservations with `r.checkinDate === todayStr`. Lines 14281-14289 and 15638-15646 clear `morningEmailSentDate` on date changes so the routine re-arms for the new date.

5. **Test Infrastructure**:
   - Test runner: native `node --test` with 65 test files in `tests/`.
   - `tests/reception-email-document-attachments.test.mjs`, `tests/m2-messaging-checkin-url.test.mjs`, and `tests/bot-actions-api.test.mjs` executed and passed 100%.
   - Test suites enforce byte-for-byte SHA-256 parity between `artifacts/api-server/` and `scripts/`.
   - No tests currently cover `/modify-preview`, pre-commit payment verification on extensions, guest-portal re-signature invalidation, or real-time panel re-signature status updates.

---

## 2. Logic Chain

1. **Premise**: Per Requirement R1 & R2, a modification that adds extra nights must preview costs and require payment settlement before modifying reservation dates in the database.
   - **Observation Reference**: Observation 2 shows `POST /api/pms/guest-portal/:code/modify` (line 15615) assigns new dates immediately even when `additionalAmountToPay > 0`, and no `/modify-preview` route exists.
   - **Deduction**: A separate `/api/pms/guest-portal/:code/modify-preview` endpoint must be created, and `/modify` must reject or create a pending payment intent until payment is verified.

2. **Premise**: Per Requirement R3, modifying dates or flat numbers must mandate re-signing and notify the guest.
   - **Observation Reference**: Observation 2 shows `PUT /api/pms/reservations/:id` has re-signature invalidation logic (`r.needsReSignature = true`), but `/api/pms/guest-portal/:code/modify` lacks it entirely. Furthermore, Observation 3 shows neither endpoint triggers an automated re-signature WhatsApp/email dispatch to the guest.
   - **Deduction**: Both modification pathways must standardize on setting `r.needsReSignature = true`, invalidating previous signatures, and immediately dispatching an automated communication with `{{link_checkin_digital}}` / `${appOrigin}/pre-checkin/${r.code}`.

3. **Premise**: Per Requirement R4, operational panels and schedulers must reflect modified dates, flat numbers, and re-signature requirements in real time.
   - **Observation Reference**: Observation 4 shows `/api/reception/today` already respects `!r.needsReSignature`, and polls every 15s. However, `garage-dashboard.tsx` lacks background polling, and guest portal (`guest-portal.tsx`) lacks a re-signature banner.
   - **Deduction**: Adding polling to the garage dashboard, exposing `needsReSignature` on the guest portal with a signing banner, and syncing breakfast orders and cleaning requests completes the operational loop.

---

## 3. Caveats

1. **External Payment Gateways**: In local test environments without live credentials, Banco Inter PIX and Mercado Pago APIs operate via simulated fallback or sandbox modes. Test suites must mock payment receipt or use test fixtures to verify post-settlement date commitments.
2. **Twin-Server Parity**: Any changes made to `scripts/demo-server.mjs`, `scripts/mail-service.mjs`, or `scripts/zapi-service.mjs` must be mirrored byte-for-byte in `artifacts/api-server/` to satisfy project parity rules and automated parity tests.
3. **Frontend Build**: Changes in `artifacts/limpeza/src` require executing `npm run build` in `artifacts/limpeza` to ensure production assets in `artifacts/limpeza/dist/` are generated without TypeScript errors.

---

## 4. Conclusion

The investigation confirms that all underlying building blocks (FNRH PDF generation with SHA-256 forensic hashing, Z-API templating, reception email delivery with attachments, and reception panel polling) exist and are functional. However, the modification flow in the guest portal lacks simulation (`/modify-preview`), payment guardrails on extension, re-signature invalidation, automated guest communication with direct re-signing links, and real-time garage panel polling. Implementing these components alongside a dedicated E2E test suite in `tests/` will achieve 100% compliance with the authoritative requirements.

---

## 5. Verification Method

To independently verify the observations and conclusions:

1. **Verify Existing Tests and Parity**:
   ```powershell
   node --test tests/reception-email-document-attachments.test.mjs
   node --test tests/m2-messaging-checkin-url.test.mjs
   node --test tests/fnrh-pdf-multi-guest-resilience.test.mjs
   ```

2. **Verify Modification Routes in Server Code**:
   - Inspect `scripts/demo-server.mjs` lines 15456-15716: Verify that `/api/pms/guest-portal/:code/modify` updates dates without payment settlement and does not set `needsReSignature`.
   - Inspect `scripts/demo-server.mjs` lines 13712-13768: Verify that `PUT /api/pms/reservations/:id` sets `needsReSignature = true` on date/flat changes.

3. **Verify Reception Polling**:
   - Inspect `artifacts/limpeza/src/pages/reception-tablet.tsx` line 196: Verify 15s polling interval.
   - Inspect `artifacts/limpeza/src/pages/guest-pre-checkin.tsx` lines 2067-2077: Verify existing re-signature alert banner.
