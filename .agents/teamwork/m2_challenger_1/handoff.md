# Milestone 2 Challenger Evaluation Report

## 1. Observation

- **Worker Test Suite Execution (`node --test tests/m2-re-signature-operations-sync.test.mjs`)**:
  ```text
  TAP version 13
  # Subtest: Milestone 2: Re-Signature Lifecycle, Document Delivery & Ops Synchronization Suite
      # Subtest: 1. Paridade SHA-256 byte-a-byte entre scripts/ e artifacts/api-server/
      ok 1 - 1. Paridade SHA-256 byte-a-byte entre scripts/ e artifacts/api-server/
      # Subtest: 2. Alteração de datas na Reserva 8001 invalida assinatura e exige re-assinatura
      ok 2 - 2. Alteração de datas na Reserva 8001 invalida assinatura e exige re-assinatura
      # Subtest: 3. GET /api/reception/today reflete pendência e bloqueia check-in enquanto needsReSignature === true
      ok 3 - 3. GET /api/reception/today reflete pendência e bloqueia check-in enquanto needsReSignature === true
      # Subtest: 4. POST /api/pms/pre-checkin re-assina a reserva, gera PDF com SHA-256 e limpa invalidation
      ok 4 - 4. POST /api/pms/pre-checkin re-assina a reserva, gera PDF com SHA-256 e limpa invalidation
      # Subtest: 5. Re-assinatura dispara e-mail com PDF anexado para a recepção (db.reservationCommunications)
      ok 5 - 5. Re-assinatura dispara e-mail com PDF anexado para a recepção (db.reservationCommunications)
      # Subtest: 6. Painel da Recepção agora autoriza check-in após re-assinatura concluída
      ok 6 - 6. Painel da Recepção agora autoriza check-in após re-assinatura concluída
      # Subtest: 7. Alteração de datas na Reserva 8002 limpa morningEmailSentDate, sincroniza café e governança
      ok 7 - 7. Alteração de datas na Reserva 8002 limpa morningEmailSentDate, sincroniza café e governança
      1..7
  ok 1 - Milestone 2: Re-Signature Lifecycle, Document Delivery & Ops Synchronization Suite
  # tests 7
  # suites 1
  # pass 7
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 9101.7177
  ```

- **Adversarial Stress Test Suite Execution (`node --test tests/challenger-m2-adversarial-re-signature.test.mjs`)**:
  ```text
  TAP version 13
  # Subtest: M2 Adversarial Challenge: Re-Signature Lifecycle & Pre-Checkin Clearance
      # Subtest: CHALLENGE 1: Admin PUT invalida assinatura, limpa hashes e resiste a payload de hóspede desatualizado
      ok 1 - CHALLENGE 1: Admin PUT invalida assinatura, limpa hashes e resiste a payload de hóspede desatualizado
      # Subtest: CHALLENGE 2: Portal Checkout Settlement Commit invalida assinatura e limpa documentos antigos
      ok 2 - CHALLENGE 2: Portal Checkout Settlement Commit invalida assinatura e limpa documentos antigos
      # Subtest: CHALLENGE 3: Direct Portal Modify invalida assinatura e limpa documentos antigos
      ok 3 - CHALLENGE 3: Direct Portal Modify invalida assinatura e limpa documentos antigos
      # Subtest: CHALLENGE 4: getCheckinUrlSync adiciona dinamicamente ?resign=1 quando needsReSignature === true
      ok 4 - CHALLENGE 4: getCheckinUrlSync adiciona dinamicamente ?resign=1 quando needsReSignature === true
      # Subtest: CHALLENGE 5: POST /api/pms/pre-checkin limpa invalidation, gera novo FNRH PDF com SHA-256 fresco
      ok 5 - CHALLENGE 5: POST /api/pms/pre-checkin limpa invalidation, gera novo FNRH PDF com SHA-256 fresco
      # Subtest: CHALLENGE 6: Chamar POST /api/pms/pre-checkin em reserva já assinada mantém integridade sem corrupção
      ok 6 - CHALLENGE 6: Chamar POST /api/pms/pre-checkin em reserva já assinada mantém integridade sem corrupção
      # Subtest: CHALLENGE 7: Paridade estrita byte-a-byte entre scripts/ e artifacts/api-server/
      ok 7 - CHALLENGE 7: Paridade estrita byte-a-byte entre scripts/ e artifacts/api-server/
      1..7
  ok 1 - M2 Adversarial Challenge: Re-Signature Lifecycle & Pre-Checkin Clearance
  # tests 7
  # suites 1
  # pass 7
  # fail 0
  # cancelled 0
  # skipped 0
  # todo 0
  # duration_ms 17936.7743
  ```

- **Twin-Server SHA-256 Hash Verification**:
  1. `scripts/demo-server.mjs` vs `artifacts/api-server/demo-server.mjs`:
     - SHA-256: `8b6a5d9e37a2f89650e4613558dbaf1c51f795193d75d04e216bb41b3bbee128` (Identical: `true`)
  2. `scripts/zapi-service.mjs` vs `artifacts/api-server/zapi-service.mjs`:
     - SHA-256: `3e7a17cb5216f476fa316178c916a5beac71e491e8ff4397b1fd5d9e7fc64846` (Identical: `true`)
  3. `scripts/fnrh-pdf-service.mjs` vs `artifacts/api-server/fnrh-pdf-service.mjs`:
     - SHA-256: `845254a8419ea08343a4baff7bcfd2d61d22c4376643d8103dac2a131582771b` (Identical: `true`)
  4. `scripts/mail-service.mjs` vs `artifacts/api-server/mail-service.mjs`:
     - SHA-256: `3f17611b44a6d54480434e7aa7b81d50bf436fc332523886a1548b5d036cc34c` (Identical: `true`)
  5. `scripts/storage-service.mjs` vs `artifacts/api-server/storage-service.mjs`:
     - SHA-256: `c3b6dbe78a5464d89e220e32c79e6cf56eefcbc3d33b6ec5cb35a8c5fb48fb10` (Identical: `true`)
  6. `scripts/whatsapp-ai-service.mjs` vs `artifacts/api-server/whatsapp-ai-service.mjs`:
     - SHA-256: `b55992e5ab25e283234a8fcd4d87c98fff0e6e9d37d013a955b2cf741f9198a6` (Identical: `true`)

---

## 2. Logic Chain

1. **Pathway 1 (Admin PUT)**:
   - When updating stay dates or flat via `PUT /api/pms/reservations/:id` (lines 13928-14001 in `demo-server.mjs`), `invalidateReservationCheckinSignatures(r)` executes immediately.
   - Even when adversarial clients submit stale payloads attempting to preserve `hasCompletedCheckin: true` or `needsReSignature: false` inside `req.body.guests`, the endpoint explicitly enforces `r.needsReSignature = true`, `r.fnhrCompleted = false`, `r.signatureUrl = null`, deletes stale `fnrhPdfUrl`, `fnrhDocumentUuid`, `fnrhSha256Hash`, and cascades this invalidation down to all guest records. Verified in Challenge 1.

2. **Pathway 2 (Portal Checkout Settlement Commit)**:
   - In `POST /api/pms/guest-portal/:code/modify-checkout` followed by payment settlement via `GET /api/pms/guest-portal/:code/modify-status?simulatePayment=true`, dates are held provisorily without mutating the reservation until payment verification.
   - Upon settlement, `commitPendingModification` commits the new dates, invokes `invalidateReservationCheckinSignatures(r)`, purges stale FNRH links/hashes, sets `needsReSignature = true`, and returns `reSignatureUrl: "/pre-checkin/:code?resign=1"`. Verified in Challenge 2.

3. **Pathway 3 (Direct Portal Modify)**:
   - In `POST /api/pms/guest-portal/:code/modify` (line 17114), cost-neutral date/flat modifications immediately trigger `invalidateReservationCheckinSignatures(r)`.
   - Verified that `r.needsReSignature === true`, `r.fnhrCompleted === false`, `r.signatureUrl === null`, and all legacy document URLs and cryptographic hashes are purged. Verified in Challenge 3.

4. **Dynamic Check-in URL Resolution (`getCheckinUrlSync`)**:
   - Lines 5933-5936 in `demo-server.mjs` dynamically compute `resignParam`:
     - Titular (`guestIndex = 1`): appends `?resign=1`
     - Co-guests (`guestIndex > 1`): appends `?guest=${guestIndex}&resign=1`
   - Even under `gov_fnrh` configuration, if `isResign` is true, the SERPRO link is bypassed in favor of the internal re-signature route (`?resign=1`). Verified across all 4 scenarios in Challenge 4.

5. **Pre-Checkin Clearance & Forensic Document Regeneration**:
   - Calling `POST /api/pms/pre-checkin` with signature clears `targetGuest.needsReSignature = false`.
   - When all guests / titular guest re-signs, `r.needsReSignature` transitions back to `false`, `r.reSignatureReason` is deleted, and `r.fnhrCompleted = true`.
   - Generates a newly hashed FNRH document with a brand new 64-character hex SHA-256 hash (distinct from stale hashes), writes to `db.fnrhAuditDocuments`, and dispatches email to reception with `trigger: "re_signature_checkin"`. Verified in Challenge 5.

6. **Idempotency & Non-Corruption**:
   - Calling `POST /api/pms/pre-checkin` when a reservation is already signed does not corrupt state: `needsReSignature` stays `false`, `fnhrCompleted` stays `true`, `status` stays `"confirmada"`, and financial totals/payments remain untouched. Reception panel continues authorizing entry without blockage. Verified in Challenge 6.

---

## 3. Caveats

1. **Mirroring of `giss-soap.mjs`**:
   - `artifacts/api-server/giss-soap.mjs` exists, but `scripts/giss-soap.mjs` was not created. While production runs from `artifacts/api-server/demo-server.mjs` (where imports resolve cleanly), attempting to execute `node scripts/demo-server.mjs` directly in a fresh environment will throw `ERR_MODULE_NOT_FOUND: Cannot find module './giss-soap.mjs'`. Recommended to copy `artifacts/api-server/giss-soap.mjs` to `scripts/giss-soap.mjs` in M4 packaging.
2. **Standalone `zapi-service.mjs` Delegation**:
   - In `scripts/zapi-service.mjs`, `getCheckinUrlSync` delegates to `fnrh-serpro-service.mjs` if `globalThis.getCheckinUrlSync` is not populated. In production server runtimes, `demo-server.mjs` always populates `globalThis.getCheckinUrlSync`, so this is fully masked and working in runtime.

---

## 4. Conclusion

**VERDICT: APPROVE**

Milestone 2 implementation is robust, correct, and fully resilient against adversarial edge cases.
- All 7 worker tests in `tests/m2-re-signature-operations-sync.test.mjs` passed cleanly.
- All 7 adversarial stress tests in `tests/challenger-m2-adversarial-re-signature.test.mjs` passed cleanly.
- 100% byte-for-byte SHA-256 twin server parity is maintained across all 6 core server modules.
- Re-signature invalidation is consistently enforced across Admin PUT, Portal Checkout Settlement, and Direct Portal Modify.
- Pre-checkin clearance correctly restores `needsReSignature: false`, generates fresh SHA-256 PDF hashes, delivers notifications to reception, and exhibits clean idempotency.

---

## 5. Verification Method

To independently reproduce and verify this assessment:

1. **Verify Twin Server SHA-256 Parity**:
   ```bash
   node -e "const fs = require('fs'); const crypto = require('crypto'); const pairs = [['scripts/demo-server.mjs', 'artifacts/api-server/demo-server.mjs'], ['scripts/zapi-service.mjs', 'artifacts/api-server/zapi-service.mjs'], ['scripts/fnrh-pdf-service.mjs', 'artifacts/api-server/fnrh-pdf-service.mjs'], ['scripts/mail-service.mjs', 'artifacts/api-server/mail-service.mjs'], ['scripts/storage-service.mjs', 'artifacts/api-server/storage-service.mjs'], ['scripts/whatsapp-ai-service.mjs', 'artifacts/api-server/whatsapp-ai-service.mjs']]; pairs.forEach(([f1, f2]) => { const h1 = crypto.createHash('sha256').update(fs.readFileSync(f1)).digest('hex'); const h2 = crypto.createHash('sha256').update(fs.readFileSync(f2)).digest('hex'); console.log(f1, '===', f2, ':', h1 === h2, h1); });"
   ```

2. **Execute Worker Test Suite**:
   ```bash
   node --test tests/m2-re-signature-operations-sync.test.mjs
   ```

3. **Execute Adversarial Stress Test Suite**:
   ```bash
   node --test tests/challenger-m2-adversarial-re-signature.test.mjs
   ```
