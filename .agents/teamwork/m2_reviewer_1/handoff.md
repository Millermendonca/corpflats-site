# Milestone 2 Reviewer 1 Handoff Report

## 1. Observation

- **Reviewed Files**:
  - `scripts/demo-server.mjs` & `artifacts/api-server/demo-server.mjs`
  - `scripts/zapi-service.mjs` & `artifacts/api-server/zapi-service.mjs`
  - `scripts/fnrh-pdf-service.mjs` & `artifacts/api-server/fnrh-pdf-service.mjs`
  - `tests/m2-re-signature-operations-sync.test.mjs`
  - `tests/m1-reservation-modification-settlement.test.mjs`

- **Byte-for-byte Parity Check**:
  Command:
  ```bash
  node -e "const fs = require('fs'); const crypto = require('crypto'); const files = ['demo-server.mjs', 'zapi-service.mjs', 'fnrh-pdf-service.mjs']; files.forEach(f => { const h1 = crypto.createHash('sha256').update(fs.readFileSync('scripts/' + f)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/' + f)).digest('hex'); console.log(f, 'scripts:', h1, 'artifacts:', h2, 'MATCH:', h1 === h2); });"
  ```
  Output:
  ```text
  demo-server.mjs scripts: 8b6a5d9e37a2f89650e4613558dbaf1c51f795193d75d04e216bb41b3bbee128 artifacts: 8b6a5d9e37a2f89650e4613558dbaf1c51f795193d75d04e216bb41b3bbee128 MATCH: true
  zapi-service.mjs scripts: 3e7a17cb5216f476fa316178c916a5beac71e491e8ff4397b1fd5d9e7fc64846 artifacts: 3e7a17cb5216f476fa316178c916a5beac71e491e8ff4397b1fd5d9e7fc64846 MATCH: true
  fnrh-pdf-service.mjs scripts: 845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b artifacts: 845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b MATCH: true
  ```

- **Targeted Test Execution Output**:
  1. `node --test tests/m2-re-signature-operations-sync.test.mjs`:
     ```text
     # tests 7
     # suites 1
     # pass 7
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 4466.4547
     ```
  2. `node --test tests/m1-reservation-modification-settlement.test.mjs`:
     ```text
     # tests 15
     # suites 1
     # pass 15
     # fail 0
     # cancelled 0
     # skipped 0
     # todo 0
     # duration_ms 5535.5883
     ```

- **Code Inspection Observations**:
  - `invalidateReservationCheckinSignatures(r, reason)` is defined at `scripts/demo-server.mjs:13762` and properly invoked at:
    - Line 13930 in `PUT /api/pms/reservations/:id` (with defensive re-application at lines 13980–14001 against stale payloads)
    - Line 15909 in `commitPendingModification`
    - Line 17114 in direct `POST /api/pms/guest-portal/:code/modify`
  - In `POST /api/pms/pre-checkin` (line 20918):
    - `wasReSignature` is detected at line 20958 (`r.needsReSignature || req.body.resign === "1" || req.body.isReSignature === true || req.query?.resign === "1"`).
    - `generateFnrhPdf` produces document and SHA-256 hash at line 21423.
    - Sets `r.fnrhSha256Hash = fnrhDocument.sha256Hash`, clears `targetGuest.needsReSignature = false`, and clears `r.needsReSignature = false` when all guests have completed re-signing.
    - Lines 21534–21586 trigger an immediate email to reception (`shouldNotifyReception = Boolean(wasReSignature || isCheckinTodayOrPast)`) with subject `[RE-ASSINATURA CHECK-IN] Termo Atualizado - Flat ${r.flatNumber} - ${validName}` and the updated FNRH PDF attached.
  - In `GET /api/reception/today` (lines 19066–19166):
    - When `r.needsReSignature` is true, sets `canAuthorizeEntry = false`, `allCheckinDone = false`, `entryBadgeType = "error"`, and `entryMessage = "Check-in Pendente (Re-assinatura de Termo Obrigatória)"`.
  - In `POST /api/reception/checkin/:reservationId` (lines 19401–19407):
    - Rejects check-in with HTTP 400 (`needsReSignature: true`) unless explicit administrative override is provided.
  - In `getCheckinUrl` and `getCheckinUrlSync` (`scripts/demo-server.mjs:5811`, `5933` and `scripts/zapi-service.mjs:65`):
    - When `isResign` is true, appends `?resign=1` (or `&resign=1`) and bypasses external Gov.br OAuth redirect to route guests directly to CorpFlats pre-checkin.
  - Operational Schedulers:
    - Deletion of `r.morningEmailSentDate` at lines 14468, 16013, 17140 allows the 07:00 arrival routine to trigger on the revised check-in date.
    - Breakfast orders cancellation/reactivation and room/flat updates occur at lines 14421–14445, 15999–16031, 17121–17135.
    - Housekeeping turnover requests shift to the new checkout date at lines 14241–14326, 16034–16047, 17183–17196.

- **Integrity Violation Scan**:
  - Zero hardcoded mock outputs or test identifiers in source code.
  - Zero facade or dummy implementations.
  - Real database mutation, cryptographic validation, and async delivery pipelines verified.

## 2. Logic Chain

1. Observations confirm that whenever reservation dates or accommodation flat change across any modification path (PMS Admin `PUT`, Portal settled `commitPendingModification`, or Portal direct `POST /modify`), `invalidateReservationCheckinSignatures` resets check-in completion and forensic certificate fields, marking `needsReSignature = true`.
2. Observations confirm that while `needsReSignature === true`, both the reception dashboard (`GET /api/reception/today`) and the physical check-in authorization endpoint (`POST /api/reception/checkin/:reservationId`) block guest entry.
3. Observations confirm that the check-in URL helpers (`getCheckinUrl` and `getCheckinUrlSync`) append `?resign=1` and bypass Gov.br OAuth, directing guests to the digital re-signing interface.
4. Observations confirm that submitting `POST /api/pms/pre-checkin` regenerates the FNRH PDF with cryptographic SHA-256 hash, clears the re-signature flags once all guests sign, and automatically sends an outbound email to reception with subject `[RE-ASSINATURA CHECK-IN]` and the updated FNRH attached.
5. Observations confirm that operational routines (morning 07:00 notification, breakfast orders, housekeeping turnover) adapt dynamically to the updated stay window and flat number.
6. Observations confirm that all 7 tests in `tests/m2-re-signature-operations-sync.test.mjs` and all 15 regression tests in `tests/m1-reservation-modification-settlement.test.mjs` execute cleanly with 100% pass rate.
7. Observations confirm that twin-server SHA-256 byte parity between `scripts/` and `artifacts/api-server/` is strictly maintained across all modified files.

## 3. Caveats

- In accordance with `AGENTS.md` and project testing guidelines, no broad or unrelated test suites were executed outside the targeted Milestone 1 and Milestone 2 test suites.
- If SMTP credentials are dummy/offline in the testing environment, `sendEmailAsync` persists the outbound email to `db.reservationCommunications` without failing the request.

## 4. Conclusion

**Verdict**: **APPROVE**  
Milestone 2 implementation is architecturally complete, robust against adversarial edge cases, free of integrity violations, and verified by targeted automated test suites.

## 5. Verification Method

To independently verify this evaluation:
1. Verify SHA-256 byte parity:
   ```bash
   node -e "const fs = require('fs'); const crypto = require('crypto'); const files = ['demo-server.mjs', 'zapi-service.mjs', 'fnrh-pdf-service.mjs']; files.forEach(f => { const h1 = crypto.createHash('sha256').update(fs.readFileSync('scripts/' + f)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync('artifacts/api-server/' + f)).digest('hex'); console.log(f, h1 === h2); });"
   ```
2. Execute targeted test suites:
   ```bash
   node --test tests/m2-re-signature-operations-sync.test.mjs
   node --test tests/m1-reservation-modification-settlement.test.mjs
   ```
