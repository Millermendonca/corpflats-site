## 2026-10-14T03:40:23Z
You are Explorer 2 for Milestone 5 (Provisional Adapters & Server Mounting).
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_m5_wbp_2`

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first!)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\docs\integracoes\webbookingpro\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\orchestrator_1\DISPATCH.md` (specifically parent directive 2026-10-14T03:34:19Z)
5. Existing code files:
   - `artifacts/api-server/wbp/config.mjs` (modes and settings)
   - `artifacts/api-server/demo-server.mjs` (mounting routes, chat and reviews endpoints)
   - `e2e/wbp-simulator/server.mjs` (simulator chat and reviews endpoints)
   - `C:\Users\mille\.gemini\antigravity\brain\70356aec-b041-4a86-8517-6963f7cb2aa9\wbp_docs\wbpAPI.yaml`

Your Mission:
Analyze and formulate the architectural blueprint for Feature 27 (Provisional Reviews & Messages Adapters) and Server Integration:
1. Provisional Adapters (Feature 27 — R7):
   - `GetMessages` & `SendMessage`: Bridge between WBP and existing Guest-Flow-Manager chat (`whatsapp-chat.tsx` / API chat). Toggled OFF by default (`wbpConfig.provisionalMessagesEnabled = false`).
   - `GetReviews` & `RespondReview`: Bridge between WBP and existing Review Insights (`review-insights.tsx` / API reviews). Toggled OFF by default (`wbpConfig.provisionalReviewsEnabled = false`).
   - Marked clearly as provisional / experimental in code and API responses.
   - Simulator validation against `wbpAPI.yaml` and `e2e/wbp-simulator/server.mjs`.
2. Backend API Routes in `demo-server.mjs`:
   - Admin reauth endpoint: `POST /api/wbp/vault/reauth` (validates admin credentials, returns 5-min single-use token).
   - Card viewing endpoint: `POST /api/wbp/vault/view` (receives single-use token + booking/card ID, returns decrypted card details for 1-time view, invalidates token immediately, audits event).
   - Purge trigger endpoint: `POST /api/wbp/vault/purge` (manual/scheduled trigger for expired cards).
   - Provisional chat endpoints: `GET /api/wbp/provisional/messages` & `POST /api/wbp/provisional/messages/send`.
   - Provisional review endpoints: `GET /api/wbp/provisional/reviews` & `POST /api/wbp/provisional/reviews/respond`.
3. Schedulers & Server Lifecycle:
   - Wire daily card auto-purge scheduler in `demo-server.mjs` during server startup when `NODE_ENV !== "test"`.
4. Twin Parity Strategy:
   - Strategy for creating `artifacts/api-server/wbp/provisional.mjs` and mirroring in `scripts/wbp/provisional.mjs`.
   - Updating `artifacts/api-server/demo-server.mjs` and mirroring in `scripts/demo-server.mjs` with 100% SHA-256 byte-for-byte identity.
5. Output: Write your findings and recommendations in `analysis.md` and complete handoff in `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion. Do NOT write or modify application code.
