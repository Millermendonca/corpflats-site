# Task Assignment — Worker M4 (Milestone 4: Final E2E Integration & Verification)

**Agent ID**: worker_m4_1  
**Role**: teamwork_worker  
**Working Directory**: `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\teamwork_worker_m4\`  
**Orchestrator Conversation ID**: 360f24b1-a735-4f80-861f-c34322083e6f  

---

## 1. Objective
Author and execute the comprehensive, production-grade End-to-End test suite `tests/b2b-e2e-suite.test.mjs` covering all user requirements (R1: Multi-night rates and duration, R2: Voucher PDF & link extraction with full agency and invoicing data, R3: Autonomous cancellation cascade and manager alerting).

Ensure the complete suite runs in-process with Node.js, passes 100%, maintains 100% SHA-256 twin parity across all 39 runtime files, and is committed and pushed to `origin main`.

---

## 2. Mandatory Input Files
Read before starting:
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
- `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\TEST_INFRA.md`
- Reference Gabarito Flat 113: `artifacts/api-server/demo-server.mjs:9074-9112` (`B2B-25055349` / Pires Hage / Opus Viagens / Lactalis do Brasil / Arlindo Amorim Barcelos)
- M1 Parser & Service: `artifacts/api-server/zoho-mail-service.mjs`
- M2 PDF Service: `artifacts/api-server/pdf-extract-service.mjs`
- M3 Cancellation Service: `artifacts/api-server/b2b-cancellation-service.mjs`

---

## 3. Mandatory Integrity Warning (ZERO CHEATING)
> DO NOT CHEAT. All implementations and test validations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

---

## 4. Scope Boundaries & Repository Rules
- **NEVER** run global test sweeps or directory globs (`tests/*.test.mjs`). Run ONLY designated point test files (`node tests/<name>.test.mjs`).
- If you edit any runtime `.mjs` file in `artifacts/api-server/`, you MUST copy it to `scripts/` to maintain 100% SHA-256 twin parity (`node scripts/check-twin-parity.mjs`).
- Always run `git commit` and `git push origin main` after changes.

---

## 5. Required Test Scenarios in `tests/b2b-e2e-suite.test.mjs`
Create `tests/b2b-e2e-suite.test.mjs` with Node.js built-in `node:test` and `node:assert/strict`:

1. **Scenario 1 — Ingestão de Reserva B2B Multi-Diárias (Gabarito Flat 113)**:
   - Ingest email voucher with text matching Flat 113 reference:
     - Number: `25055349`
     - Guest: `Arlindo Amorim Barcelos`
     - Flat: `113`
     - Check-in: `2026-05-18`, Check-out: `2026-05-20`
     - Duration: exactly 2 nights (`nights === 2`)
     - Daily rates: array with exactly 2 entries (`dailyRates.length === 2`, each with `amount: 280`)
     - Total: `560`
     - Agency: `Opus Viagens e Turismo` (CNPJ: `07.284.508/0001-89`)
     - Agent: `Carlos Pires Hage` (phone: `(22) 99888-7766`, email: `carlos@opusviagens.com.br`)
     - Company: `Lactalis do Brasil Ltda` (CNPJ: `04.227.071/0001-52`)
     - Invoicing instructions: full textual NFS-e instructions preserved in `r.invoicingInstructions`.

2. **Scenario 2 — Ingestão de Voucher via Anexo PDF (Decompressão Zero-Dep)**:
   - Construct valid PDF stream with FlateDecode or uncompressed text stream containing voucher details.
   - Run `extractVoucherData` and `ingestB2bVoucherIntoDb`.
   - Verify guest, dates, rates, and agency data extracted and stored.

3. **Scenario 3 — Ingestão de Voucher via Link Web / Crawler**:
   - Provide voucher URL or HTML page.
   - Verify crawler extraction and database attachment.

4. **Scenario 4 — Cancelamento Autônomo B2B com Cascata Canônica e Alerta Z-API**:
   - Send cancellation email for the confirmed reservation from Scenario 1 (via RLOC or B2B number).
   - Verify:
     - `reservation.status === 'cancelada'`
     - Cleaning requests / check-in instructions cleaned up.
     - Linked breakfast / service orders cancelled.
     - Dual audit logs recorded: `reservation.auditLogs` contains `B2B_EMAIL_AUTONOMOUS_CANCELLATION` and `db.auditLogs` contains cancellation record.
     - Manager WhatsApp Z-API alert triggered with guest name, flat, agency, and dates to `5522997124021`.

5. **Scenario 5 — Invariante de Segurança CHECKED_IN_CANCELLATION**:
   - Create/mock reservation in status `'in_house'` / `'hospedado'`.
   - Send cancellation email.
   - Verify: cancellation is BLOCKED (`blockedReason: 'CHECKED_IN_CANCELLATION'`), reservation status remains untouched, and urgent alert is dispatched to manager.

6. **Scenario 6 — Idempotência em Cancelamento Repetido**:
   - Re-send cancellation for an already cancelled booking.
   - Verify safe response `{ success: true, cancelled: false, alreadyCancelled: true }` without redundant cascades or duplicate alerts.

---

## 6. Point Test Suite Execution & Verification
After writing `tests/b2b-e2e-suite.test.mjs`, run:
1. `node tests/b2b-e2e-suite.test.mjs`
2. `node tests/adversarial-b2b-cancellation.test.mjs`
3. `node tests/b2b-cancellation.test.mjs`
4. `node tests/b2b-voucher-extraction.test.mjs`
5. `node tests/b2b-voucher-dates.test.mjs`
6. `node scripts/check-twin-parity.mjs` (must pass 39/39 files with exit code 0)

Then run `git add`, `git commit`, and `git push origin main`.

---

## 7. Deliverable
Write your final report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\teamwork_worker_m4\handoff.md`.
Include:
- **Observation**: Test execution outputs and commit hash.
- **Logic Chain**: How all 6 scenarios validate R1, R2, R3 end-to-end.
- **Caveats**: Any nuances observed.
- **Conclusion**: Verdict `DONE` and confirmation of git push.
- **Verification Method**: Commands executed.

Send a brief summary message to the orchestrator upon completion.
