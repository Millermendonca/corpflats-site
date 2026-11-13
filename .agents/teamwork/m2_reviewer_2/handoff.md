# Milestone 2 Reviewer 2 Review & Adversarial Challenge Report

## 1. Observation
- **Inspected Files and Implementation Lines**:
  - `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`:
    - Line 13762: `export function invalidateReservationCheckinSignatures(r, reason)` clears `fnhrCompleted`, `preCheckinCompleted`, `signatureUrl`, `checkedInAt`, sets `needsReSignature = true`, `reSignatureReason = reason`, deletes all FNRH forensic keys (`fnrhPdfUrl`, `fnrhDownloadUrl`, `fnrhDocumentUuid`, `fnrhSha256Hash`, `fnrhVerifyUrl`, `fnrhSignedAt`, `fnrhAuditTrail`, `fnrhFileName`, `fnrhFilePath`, `r2Url`, `fnrhR2Url`), demotes `status` from `CHECKED_IN`/`checkin` to `confirmada`, and replicates the exact purge across all elements of `r.guests`.
    - Line 13928-13931 & 13979-14001: In `PUT /api/pms/reservations/:id`, if dates or flat change, `invalidateReservationCheckinSignatures` is invoked and then re-enforced after field assignment, preventing `req.body.guests` from restoring pre-modification completion status.
    - Lines 15908-15910: In `commitPendingModification`, `invalidateReservationCheckinSignatures` is called atomically upon payment confirmation.
    - Lines 17113-17115: In `POST /api/pms/guest-portal/:code/modify`, `invalidateReservationCheckinSignatures` is called unconditionally on direct modification.
    - Lines 19162-19165: In `GET /api/reception/today`, `if (isReSignatureNeeded)` forces `canAuthorizeEntry = false`, `entryBadgeType = "error"`, and `entryMessage = "Check-in Pendente (Re-assinatura de Termo Obrigatória)"`.
    - Lines 19400-19407: In `POST /api/reception/checkin/:reservationId`, rejects check-in attempts with HTTP 400 `{ error: "...", needsReSignature: true, reSignatureReason: ... }` when `r.needsReSignature === true`.
    - Lines 21495-21501: In `POST /api/pms/pre-checkin`, clears `targetGuest.needsReSignature = false`, generates forensic FNRH PDF with cryptographic audit trail and SHA-256 hash, and only sets `r.needsReSignature = false` when all guests have cleared re-signature.
    - Lines 21530-21587: In `POST /api/pms/pre-checkin`, when `wasReSignature` is true, immediately dispatches email to reception with subject `[RE-ASSINATURA CHECK-IN] Termo Atualizado - Flat ${r.flatNumber} - ${validName}`, attaching the newly compiled FNRH PDF and embedding `metadata.fnrhSha256Hash`. If check-in date is in the future, `r.morningEmailSentDate` is not marked today, preserving the 07:00 arrival trigger.
  - `scripts/zapi-service.mjs` & `artifacts/api-server/zapi-service.mjs`:
    - Lines 65-75 & 80-86: `getCheckinUrlSync` and `getCheckinUrl` detect `isResign = Boolean(reservation?.needsReSignature)`. When true, appends `?resign=1` (or `&resign=1`) and bypasses external Gov.br/Serpro URLs to force direct digital re-signing.
    - Line 1898 & 2095: In template rendering, `{{link_checkin_digital}}` maps to `linkCheckinDigital` generated via `getCheckinUrlSync`.
  - `scripts/mail-service.mjs` & `artifacts/api-server/mail-service.mjs`:
    - Lines 1579-1583 & 1615: `ensureReservationAttachmentsReady` checks `!reservation.needsReSignature && !titularGuestRecord?.needsReSignature`, blocking stale PDF attachments when re-signature is required.
- **Twin-Server Parity Check**:
  - `scripts/demo-server.mjs` vs `artifacts/api-server/demo-server.mjs`:
    - `8b6a5d9e37a2f89650e4613558dbaf1c51f795193d75d04e216bb41b3bbee128` (Match: `true`)
  - `scripts/zapi-service.mjs` vs `artifacts/api-server/zapi-service.mjs`:
    - `3e7a17cb5216f476fa316178c916a5beac71e491e8ff4397b1fd5d9e7fc64846` (Match: `true`)
  - `scripts/fnrh-pdf-service.mjs` vs `artifacts/api-server/fnrh-pdf-service.mjs`:
    - `845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b` (Match: `true`)
  - `scripts/mail-service.mjs` vs `artifacts/api-server/mail-service.mjs`:
    - `3f17611b44a6d54480434e7aa7b81d50bf436fc332523886a1548b5d036cc34c` (Match: `true`)
- **Strictly Targeted Test Executions**:
  - `node --test tests/m2-re-signature-operations-sync.test.mjs`:
    - Total tests: 7, Passed: 7, Failed: 0, Duration: ~4.7s.
  - `node --test tests/m1-reservation-modification-settlement.test.mjs`:
    - Total tests: 15, Passed: 15, Failed: 0, Duration: ~4.8s.
- **Integrity Violation Analysis**:
  - Zero hardcoded test IDs or results found in production source files.
  - Implementations execute genuine cryptographic SHA-256 calculation, actual PDF file generation, database mutation, and real email queue recording.

## 2. Logic Chain
1. **Re-Signature Invalidation Security**:
   - Observations show that both manual admin edits (`PUT /api/pms/reservations/:id`), portal automated settlements (`commitPendingModification`), and zero-cost direct modifications (`POST /api/pms/guest-portal/:code/modify`) invoke `invalidateReservationCheckinSignatures`.
   - In `PUT /api/pms/reservations/:id`, lines 13979-14001 actively guard against client-side request payload clobbering by resetting `needsReSignature = true` and `hasCompletedCheckin = false` after applying `req.body.guests`. Thus, an admin or caller cannot bypass invalidation by submitting pre-completed guest objects.
2. **Stale FNRH PDF Links & UUID Purging**:
   - Observations confirm that all FNRH reference keys (`fnrhPdfUrl`, `fnrhDownloadUrl`, `fnrhDocumentUuid`, `fnrhSha256Hash`, etc.) are deleted from both the root reservation and all nested guest objects upon modification.
   - In `GET /api/pms/pre-checkin/guest/:code`, URLs are only generated if `fnrhDocumentUuid` is present; because the UUID was deleted, no URLs are returned, preventing guest access to stale pre-modification agreements.
   - In `mail-service.mjs`, `ensureReservationAttachmentsReady` checks `!reservation.needsReSignature`, preventing stale documents from being attached to outbound emails while re-signature is pending.
3. **Reception Tablet Authorization Gate**:
   - `GET /api/reception/today` explicitly evaluates `isReSignatureNeeded = Boolean(r.needsReSignature)`. When true, `canAuthorizeEntry` is unconditionally set to `false`, with `entryBadgeType = "error"`.
   - `POST /api/reception/checkin/:reservationId` checks `if (r.needsReSignature && !req.body.adminOverride && !req.body.forceOverrideReSignature)` and terminates early with HTTP 400. Physical check-in cannot be authorized while re-signature is pending.
4. **Dynamic WhatsApp & Email Link Integrity**:
   - `getCheckinUrlSync` and `getCheckinUrl` in both `zapi-service.mjs` and `demo-server.mjs` evaluate `isResign = Boolean(reservation?.needsReSignature)`. When true, `?resign=1` is appended and Gov.br OAuth redirects are bypassed to deliver the direct CorpFlats re-signing interface.
   - In `zapi-service.mjs`, `{{link_checkin_digital}}` is bound to `getCheckinUrlSync`, ensuring that any automated WhatsApp notification dispatched while `needsReSignature === true` routes the guest to `/pre-checkin/:code?resign=1`.
5. **FNRH Re-Generation and Email Delivery with SHA-256 Hash**:
   - In `POST /api/pms/pre-checkin`, when `wasReSignature` is true, the server invokes `generateFnrhPdf` to compile a fresh PDF document with canonical SHA-256 calculation.
   - The email routine (`shouldNotifyReception = Boolean(wasReSignature || isCheckinTodayOrPast)`) triggers `sendEmailAsync` with subject prefix `[RE-ASSINATURA CHECK-IN]`, attaches the newly generated FNRH PDF, and records `metadata.fnrhSha256Hash`.
   - Test 5 in `tests/m2-re-signature-operations-sync.test.mjs` verified that this communication is captured in `db.reservationCommunications` with `trigger: "re_signature_checkin"` and the 64-character SHA-256 hash.
6. **Twin-Server Parity & Targeted Test Verification**:
   - Parity was confirmed byte-for-byte across all four server file pairs.
   - Targeted tests executed cleanly with 100% pass rates (7/7 in M2 suite, 15/15 in M1 suite).

## 3. Caveats
- Frontend UI visual presentation on reception tablets and guest portal forms will be further integrated and refined in Milestone 3.
- In `PUT /api/pms/reservations/:id`, if an admin manually extends a checkout date on a reservation with an unpaid balance, line 14624 routes the notification through `additional_daily_pending` rather than `dispatchReservationReSignatureNotifications`. However, `r.needsReSignature` is still strictly set to `true` in the database, and `{{link_checkin_digital}}` in that template still resolves with `?resign=1`.

## 4. Conclusion
Milestone 2 implementation is robust, cryptographically sound, and free of security bypasses or integrity violations. All requirements from `ORIGINAL_REQUEST.md` and `PROJECT.md` are fulfilled. Byte-for-byte parity is strictly maintained.

**VERDICT**: **APPROVE**

## 5. Verification Method
- **Twin-Server SHA-256 Parity**:
  ```powershell
  node -e "const fs = require('fs'); const crypto = require('crypto'); const pairs = [['scripts/demo-server.mjs', 'artifacts/api-server/demo-server.mjs'], ['scripts/zapi-service.mjs', 'artifacts/api-server/zapi-service.mjs'], ['scripts/fnrh-pdf-service.mjs', 'artifacts/api-server/fnrh-pdf-service.mjs'], ['scripts/mail-service.mjs', 'artifacts/api-server/mail-service.mjs']]; pairs.forEach(([f1, f2]) => { const h1 = crypto.createHash('sha256').update(fs.readFileSync(f1)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync(f2)).digest('hex'); console.log(f1, '===', f2, ':', h1 === h2); });"
  ```
- **Strictly Targeted Test Executions**:
  ```powershell
  node --test tests/m2-re-signature-operations-sync.test.mjs
  node --test tests/m1-reservation-modification-settlement.test.mjs
  ```
