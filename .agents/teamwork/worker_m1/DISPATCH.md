## 2026-11-02T01:52:07Z
You are a teamwork_worker implementing Milestone M1.
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
Your parent is orchestrator_21 (ID: d148d17c-b644-4690-94c7-bab73af837cc).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY READINGS:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (specifically lines 974-1011)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md` (STRICT: no global test suites, git commit + push)
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_21\PROJECT.md`
4. Survey Handoffs:
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_survey_1\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_bot_1\handoff.md`
   - `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_fiscal_1\handoff.md`

FILES YOU OWN EXCLUSIVELY:
- `artifacts/api-server/whatsapp-ai-service.mjs`
- `scripts/whatsapp-ai-service.mjs` (MUST be kept byte-for-byte identical to artifacts/api-server/whatsapp-ai-service.mjs, verify with SHA-256)
- `tests/sofia-fiscal-whatsapp-confirmation.test.mjs` (punctual test)

YOUR OBJECTIVES:
1. Implement in `handleWhatsAppFiscalFlow` (and related handlers in `whatsapp-ai-service.mjs`):
   - **R3. Restrição por Telefone**: In this test phase, if `!isDeveloperPhone(cleanTarget, db)` (i.e. sender is NOT 22998505276 / 5522998505276), return `{ handled: false }` immediately so the message falls through to normal bot conversation without entering or acknowledging fiscal flow.
   - **R1. Conferência Prévia**: When 22998505276 requests a fiscal invoice, look up the reservation and tomador data via `findContactAndReservation`. Present borrower (name/company, CPF/CNPJ, address, email), stay description, and total value. Store the pending conference state in `conv.fiscalConferenceState` (or similar structured state in `conv`) and await confirmation.
   - **R1. Confirmação e Emissão**: When user explicitly confirms ("sim", "pode emitir", "confirmo", "autorizo", etc.), emit the NFS-e using the national emission pipeline (`executeNfseEmissionInternal` or `processNationalInvoiceEmission`), record invoice in `db.invoices`, link invoiceId/numeroNfse to the reservation, and reply via WhatsApp delivering the NFS-e number, verification code, and link/DANFSE document.
   - **R2. Alteração de Dados Cadastrais e Descrição**: If user requests changes to borrower info (name, CPF/CNPJ, address, email) or description, apply the changes and proceed with the emission/confirmation.
   - **R2. Trava de Valor e Notificação ao Gestor**: If user requests a change of value (different from the reservation/original stay value), DO NOT emit directly. Activate the security lock:
     - Block immediate emission.
     - Store a pending approval in `db.pendingFiscalApprovals` (or in `conv` / `db`).
     - Send a WhatsApp notification to manager 22998505276 via `sendZapiMessage` detailing the request (requester, reservation, flat, original value, requested value, reason).
     - Inform the user that value modification requires prior manager approval.
   - **R2. Aprovação do Gestor**: Intercept approval messages from manager 22998505276 (e.g. "Aprovar fiscal", "Aprovo", "Autorizado", etc.). When approved, emit the invoice with the new approved value and deliver the document to the requester.
2. Synchronize twin files:
   - Ensure `scripts/whatsapp-ai-service.mjs` is byte-for-byte identical (SHA-256 match) with `artifacts/api-server/whatsapp-ai-service.mjs`.
3. Create dedicated punctual automated test file:
   - `tests/sofia-fiscal-whatsapp-confirmation.test.mjs`
   - MUST use isolated database copy (in os.tmpdir()), delete DATABASE_URL, and assert that the real `data/database.json` remains untouched (hash SHA-256 unchanged).
   - Test all 4 core acceptance criteria:
     (1) Display of conference data (tomador, description, value) upon request from 22998505276.
     (2) Emission and delivery of invoice upon user confirmation.
     (3) Immediate block and manager notification on value change request, followed by manager approval flow.
     (4) Silent discard (`handled: false`) for fiscal requests from any phone other than 22998505276.
4. Run ONLY the punctual test:
   - Command: `node --test tests/sofia-fiscal-whatsapp-confirmation.test.mjs`
   - Strict AGENTS.md rule: DO NOT run global test suites or batch tests (`tests/*.test.mjs`).
5. Version control:
   - Run `git status`, `git add` the changed files, `git commit -m "..."`, and `git push` to origin main (or current branch).
6. Write your detailed handoff report to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1\handoff.md`.
7. Send a completion message back to your parent with verification evidence.
