## 2026-10-11T14:40:28Z
You are M2 Explorer 2 for Milestone 2 of the CorpFlats Guest-Flow-Manager project.

Your Working Directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_2
Authoritative Request: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md (read section from 2026-10-11T12:53:32Z)
Project Plan: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md

Scope: Milestone 2 — Re-Signature Lifecycle, Document Delivery & Ops Synchronization.
Focus: Automated WhatsApp & Email communication with personalized re-signing link.
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Inspect `scripts/zapi-service.mjs`, `scripts/mail-service.mjs`, and `scripts/demo-server.mjs`.
3. Design the automated guest communication mechanism when dates or flat change:
   - Dispatches a personalized WhatsApp notification via Z-API with direct link to re-sign (`{{link_checkin_digital}}` / `${appOrigin}/pre-checkin/${r.code}?resign=1`).
   - Dispatches an automated email notification to the guest containing the re-signing link.
   - Ensures messaging calls are triggered asynchronously, fail gracefully if gateways are offline or in test mode, and log audit events.
4. Provide exact drop-in code blueprint for `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` (and `zapi-service.mjs` if needed).
5. Write analysis to `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\m2_explorer_2\analysis.md` and standard `handoff.md`. Send completion message when done.
