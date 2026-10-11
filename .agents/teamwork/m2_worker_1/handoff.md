# Milestone 2 Implementation Handoff Report

## 1. Observation
- **Modified files**:
  - `scripts/demo-server.mjs`
  - `artifacts/api-server/demo-server.mjs`
  - `scripts/zapi-service.mjs`
  - `artifacts/api-server/zapi-service.mjs`
  - `tests/m2-re-signature-operations-sync.test.mjs`
- **Exact SHA-256 Hashes & Verification**:
  - `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`: `8b6a5d9e37a2f89650e4613558dbaf1c51f795193d75d04e216bb41b3bbee128` (100% byte-for-byte identical, `true`)
  - `scripts/zapi-service.mjs` & `artifacts/api-server/zapi-service.mjs`: `3e7a17cb5216f476fa316178c916a5beac71e491e8ff4397b1fd5d9e7fc64846` (100% byte-for-byte identical, `true`)
  - `scripts/fnrh-pdf-service.mjs` & `artifacts/api-server/fnrh-pdf-service.mjs`: `845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b` (100% byte-for-byte identical, `true`)
- **Targeted Test Execution Results**:
  - `node --test tests/m2-re-signature-operations-sync.test.mjs`:
    ```text
    # tests 7
    # suites 1
    # pass 7
    # fail 0
    # cancelled 0
    # skipped 0
    # todo 0
    # duration_ms 3931.5331
    ```
  - `node --test tests/m1-reservation-modification-settlement.test.mjs`:
    ```text
    # tests 15
    # suites 1
    # pass 15
    # fail 0
    # cancelled 0
    # skipped 0
    # todo 0
    # duration_ms 14759.3705
    ```

## 2. Logic Chain
1. **Invalidation upon Stay Alteration**: When dates (`checkinDate`, `checkoutDate`) or accommodation (`flatId`, `flatNumber`) are modified in `PUT /api/pms/reservations/:id`, `commitPendingModification`, or `POST /api/pms/guest-portal/:code/modify`, helper `invalidateReservationCheckinSignatures(r, reason)` invalidates prior check-ins:
   - Sets `r.needsReSignature = true`, `r.reSignatureReason = reason`, `r.fnhrCompleted = false`, `r.signatureUrl = null`, and removes old PDF/forensic URLs.
   - Clears guest level signatures: `g.needsReSignature = true`, `g.hasCompletedCheckin = false`, `g.signatureUrl = null`.
   - In `PUT /api/pms/reservations/:id`, invalidation is enforced even if the request body carries stale guest arrays, preventing clobbering.
2. **Re-Signature & Clearance in Pre-Checkin**:
   - `POST /api/pms/pre-checkin` identifies re-signatures via `wasReSignature` (checking `r.needsReSignature`, `targetGuest.needsReSignature`, `req.body.resign === "1"`, or `req.query.resign === "1"`).
   - Generates updated FNRH PDF with cryptographic audit trail, SHA-256 hash, and canonical hash via `generateFnrhPdf`.
   - Clears flags: `targetGuest.needsReSignature = false`, `targetGuest.hasCompletedCheckin = true`. When titular signs or all guests sign, `r.needsReSignature = false`, `delete r.reSignatureReason`, `r.fnhrCompleted = true`.
   - Records forensic event in `db.fnrhAuditDocuments` and internal audit log.
3. **Automated Reception Document Delivery**:
   - Condition `shouldNotifyReception = Boolean(wasReSignature || isCheckinTodayOrPast)` dispatches immediate email to reception and garage with updated PDF attached.
   - Uses subject `[RE-ASSINATURA CHECK-IN] Termo Atualizado - Flat ${r.flatNumber} - ${validName}` and metadata `trigger: wasReSignature ? "re_signature_checkin" : "pre_checkin"`, `isReSignature: wasReSignature`, `fnrhSha256Hash`.
   - If check-in is future, `r.morningEmailSentDate` is NOT marked today, ensuring the 07:00 arrival routine will fire on the arrival day.
4. **Dynamic Check-in URL Tag & Multi-Channel Notifications**:
   - `getCheckinUrlSync` and `getCheckinUrl` append `?resign=1` (or `&resign=1`) when `reservation?.needsReSignature === true`.
   - `getCheckinUrl` bypasses Gov.br OAuth when `isReSign` is true, directing guest straight to digital check-in.
   - `dispatchReservationReSignatureNotifications(reservation, changes, options)` sends WhatsApp notifications (or logs/queues them) and mirror emails with template action buttons.
5. **Real-Time Reception Panel Sync**:
   - `GET /api/reception/today` detects `needsReSignature` on reservation/guests, setting `canAuthorizeEntry = false`, `allCheckinDone = false`, `entryBadgeType = "error"`, and `entryMessage = "Check-in Pendente (Re-assinatura de Termo Obrigatória)"`.
   - `POST /api/reception/checkin/:reservationId` returns HTTP 400 with `needsReSignature: true` when attempted before re-signing.
6. **Schedulers Synchronization**:
   - When check-in date changes: deletes `r.morningEmailSentDate`, `r.morningEmailSentAt`, `r.receptionNotifiedAt`, and vehicle notification flags.
   - Breakfast orders: cancels orders outside new stay window with `computeBreakfastCancellationReason`, un-cancels valid orders, and updates flat numbers if accommodation changed.
   - Housekeeping turnover: shifts turnover cleaning requests matching old checkout to the new checkout date, updating flat number.

## 3. Caveats
- No external test suites were executed, strictly adhering to `AGENTS.md` test policy prohibiting global test sweeps.
- If SMTP credentials are dummy/offline during test runs, `sendEmailAsync` captures the communication in `db.reservationCommunications` without failing tests.

## 4. Conclusion
Milestone 2 implementation is 100% complete, fully verified, and functionally integrated. All 7 end-to-end tests in `tests/m2-re-signature-operations-sync.test.mjs` and all 15 regression tests in `tests/m1-reservation-modification-settlement.test.mjs` pass cleanly with zero failures. Byte-for-byte SHA-256 parity between twin servers is strictly maintained.

## 5. Verification Method
- Parity command:
  ```bash
  node -e "const fs = require('fs'); const crypto = require('crypto'); const pairs = [['scripts/demo-server.mjs', 'artifacts/api-server/demo-server.mjs'], ['scripts/zapi-service.mjs', 'artifacts/api-server/zapi-service.mjs'], ['scripts/fnrh-pdf-service.mjs', 'artifacts/api-server/fnrh-pdf-service.mjs']]; pairs.forEach(([f1, f2]) => { const h1 = crypto.createHash('sha256').update(fs.readFileSync(f1)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync(f2)).digest('hex'); console.log(f1, '===', f2, ':', h1 === h2); });"
  ```
- Targeted test commands:
  ```bash
  node --test tests/m2-re-signature-operations-sync.test.mjs
  node --test tests/m1-reservation-modification-settlement.test.mjs
  ```
