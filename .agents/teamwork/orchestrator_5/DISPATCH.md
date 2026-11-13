## 2026-10-11T12:55:31Z

You are the Project Orchestrator for the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_5
Project Root: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (see the latest entry from 2026-10-11T12:53:32Z)

## Core Mission
Implement a secure, multi-step reservation modification flow in the CorpFlats Guest Portal and PMS backend, requiring prior availability check, cost breakdown, payment settlement before confirmation, and mandatory re-signature of the check-in form whenever dates or flat numbers change, updating reception and garage panels.

## Specific Requirements
1. R1. Availability Check and Pricing Preview (Step 1): Simulation mechanism (/modify-preview) before committing changes, validating calendar availability, daily rate / extra nights / refund calculations, availability badge, cost breakdown, action button.
2. R2. Payment Settlement Before Confirmation (Step 2): If additionalAmountToPay > 0, reservation dates NOT modified immediately. Offer PIX (dynamic/static with QR Code, Copia e Cola, polling) and Credit Card. Commit dates, total amounts, and payment records only upon payment receipt verification.
3. R3. Mandatory Re-Signature on Dates or Flat Change: Prior check-in signature marked as requiring renewal/re-signing. Automated communication (WhatsApp/email) dispatched with personalized link to review and re-sign. Newly signed document generated and automatically delivered to building reception.
4. R4. Real-time Panel and Operations Synchronization: Reception panel, garage panel, and housekeeping schedule immediately reflect updated dates, flat, plate, and signature status. Schedulers synchronized.
5. Strict Guardrails & Parity:
   - Server code parity between `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` (must remain strict byte-for-byte identical).
   - Frontend in `artifacts/limpeza` builds cleanly (`npm run build`) and dist/ updated.
   - All tests pass (create comprehensive automated tests verifying all requirements and edge cases).
   - Follow AGENTS.md rules: git push to origin main on commit.

Maintain your progress in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_5\progress.md`.
When work is complete, compile your results in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_5\handoff.md` and report completion back to Sentinel.
