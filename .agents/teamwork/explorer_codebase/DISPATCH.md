## 2026-10-13T22:07:59Z
You are the Codebase Architecture Explorer for the Guest-Flow-Manager PMS.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase`

Read the authoritative documents and inspect the codebase:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
3. Codebase files in `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager`:
   - `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`
   - `server.mjs` and `render.yaml` (memory limit, clustering, startup)
   - `tests/tariff-engine.test.mjs` (testing harness pattern, isolation, node:test)
   - `e2e/sandbox/` (mock-zapi, mock-smtp, time-travel, db-seeder)
   - Git status and current branch (must be `feature/wbp-integration`)

Your mission:
Analyze and document the existing architecture and integration touchpoints:
- Server architecture & twin file constraint: SHA-256 parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`.
- Persistence model: Postgres JSONB blob `system_store` (key `db_state`), debounced saves, `pruneDatabase` behavior. How to store raw WBP payloads and idempotency outside the pruneable blob.
- Memory constraints: current 384 MB limit vs ~2 GB Render plan; how memory limit is set.
- Reservation lifecycle & automations: booking creation, channel mapping, allocation engine, automations triggered (WhatsApp, SERPRO/FNRH, portaria/garagem emails, PIX). How to prevent PIX and run automations conditionally based on integration mode (off / observe / auto).
- Current availability and tariffs: 4 divergent availability implementations, holds, roomBlocks, maintenance OS. Tariff settings structure.
- Credit cards & admin security: AES-256-GCM encryption in env vars, CVV exclusion, admin password re-prompt token, auto-deletion rules (7 days / checkout / cancellation).
- Testing pattern: exact command and structure used by `tests/tariff-engine.test.mjs` for running isolated tests without touching production DB.
- Output: write your findings to `analysis.md` and complete handoff to `handoff.md` in your working directory. Send a brief message back to orchestrator upon completion.
