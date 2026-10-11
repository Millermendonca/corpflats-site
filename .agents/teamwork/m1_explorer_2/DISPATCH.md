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
