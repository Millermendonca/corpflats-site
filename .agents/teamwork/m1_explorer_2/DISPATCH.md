# Dispatch: Milestone 1 Explorer 2 (Phone Normalization, Rule Engine & REST Endpoints)

Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`.

You are an Explorer for Milestone 1: Backend Core & Database Layer.
Your scope:
1. Examine `zapi-service.mjs` (`artifacts/api-server/zapi-service.mjs` and `scripts/zapi-service.mjs`):
   - Phone normalization `cleanWhatsAppPhone` and client matching with 8-digit suffix.
   - Design the function `isFaqApplicableToClient(faqItem, clientPhone)` supporting `all`, `exclude`, `include_only`.
   - Design the REST endpoints in `initWhatsAppEngine`:
     - `GET /api/whatsapp/faq`
     - `POST /api/whatsapp/faq`
     - `PUT /api/whatsapp/faq/:id`
     - `DELETE /api/whatsapp/faq/:id`
     - `POST /api/whatsapp/faq/:id/approve`
   - Address the existing SHA-256 mismatch in `whatsapp-ai-service.mjs` lines 12 & 535 between `artifacts/` and `scripts/`.
2. Provide concrete code diffs and recommendations for the worker.
Write `analysis.md` and `handoff.md` in this directory.


## 2026-10-11T01:35:21Z
You are Milestone 1 Explorer 2 for Guest-Flow-Manager.
Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2
Project root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager

MANDATORY INSTRUCTION: You MUST read ORIGINAL_REQUEST.md before starting:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Also read your task instructions:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2\DISPATCH.md
and the project roadmap:
c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Investigate phone normalization, isFaqApplicableToClient rule engine (all, exclude, include_only), and REST endpoints in zapi-service.mjs (artifacts/api-server/zapi-service.mjs and scripts/zapi-service.mjs). Also verify and plan resolution of the existing SHA-256 divergence in whatsapp-ai-service.mjs between artifacts and scripts.
Provide recommended implementation diffs.
Write analysis.md and handoff.md in your working directory.
When done, notify me via send_message with a summary and the path to handoff.md.

## 2026-10-11T13:16:32Z
You are M1 Explorer 2 for Milestone 1 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 1 — Backend Simulation, Hold & Settlement Engine.
Your Focus: Endpoint `POST /api/pms/guest-portal/:code/modify-checkout` and provisional hold structure (`r.pendingModification`).
1. Read ORIGINAL_REQUEST.md completely.
2. Read PROJECT.md.
3. Read `survey_report.md` from `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\survey_explorer_1\survey_report.md`.
4. Investigate how PIX (dynamic Inter and static EMV with QRCode) and Mercado Pago preference generation are implemented in `scripts/demo-server.mjs`.
5. Design the provisional hold mechanism:
   - Store `r.pendingModification = { pendingId, newCheckinDate, newCheckoutDate, newGuestCount, newFlatId, additionalAmountToPay, createdAt, expiresAt (now + 30 min), status: 'pending', pixTxId, pixQrCodeUrl, pixCopiaECola, mpPreferenceId, mpCheckoutUrl }`.
   - Ensure calendar availability checks in other endpoints (`hasReservationConflict`, `pre-reserve`, etc.) recognize active `pendingModification` blocks.
   - Expire pending holds after 30 minutes without affecting original reservation dates.
6. Provide exact code diff / implementation blueprint for the Worker.
7. Write your analysis to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m1_explorer_2\analysis.md` and standard `handoff.md`. Send completion message when done.

## 2026-10-11T13:23:55Z
[Message] timestamp=2026-10-11T13:23:55Z sender=494db1f9-cfb2-46e9-8b9f-419a8aa9586c priority=MESSAGE_PRIORITY_HIGH content=**Context**: Milestone 1 Scope Correction
**Content**: Please ensure your investigation covers Milestone 1: `POST /api/pms/guest-portal/:code/modify-checkout` and the provisional hold mechanism `r.pendingModification` (holding 30 min tentative block, generating PIX QR Code/Copia e Cola and Mercado Pago preference) per the request dated 2026-10-11T12:53:32Z in `ORIGINAL_REQUEST.md` and `PROJECT.md`. Do not work on WhatsApp FAQ.
**Action**: Produce `analysis.md` and `handoff.md` for `modify-checkout` and report back when complete.
