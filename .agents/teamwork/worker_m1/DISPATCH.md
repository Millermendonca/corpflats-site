## 2026-10-13T22:20:02Z

You are the Milestone 1 Implementation Worker for the Guest-Flow-Manager WebBookingPro Integration.
Your dedicated working directory is:
`c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1`

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read these authoritative documents before starting:
1. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md` (mandatory, read first)
2. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\PROJECT.md`
3. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\AGENTS.md`
4. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\spec_miner_wbp\handoff.md` and `analysis.md`
5. `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_codebase\handoff.md` and `analysis.md`

Your Scope (Milestone 1: Operational Safety, Storage & WBP Simulator):
1. Git Setup:
   - Check current git branch. Create and switch to branch `feature/wbp-integration` from `main`.
   - Preserve the 11 uncommitted audit log lines in `artifacts/api-server/audit_logs.jsonl` (and project files).
   - Perform `git push -u origin feature/wbp-integration` on every commit. Never commit to `main`.
2. Memory Limit:
   - In `render.yaml`, `package.json`, and `server.mjs`, update the max-old-space-size to `--max-old-space-size=1536` to leverage the paid ~2 GB Render container with 512 MB safety margin.
3. Durable Raw Storage:
   - Implement `storage.mjs` in `artifacts/api-server/wbp/storage.mjs` and mirror byte-to-byte in `scripts/wbp/storage.mjs`.
   - Stores raw payloads before processing in a durable insert-only mechanism outside PostgreSQL `system_store` JSONB blob and completely immune to `pruneDatabase`. In tests/local mode without Postgres, stores in dedicated durable JSONL (`data/wbp_raw_payloads.jsonl` or isolated test path).
   - Implement idempotency tracking table/map to ensure identical payloads (or OrderId) delivered multiple times produce exactly 1 processed record.
   - Support resuming unprocessed raw payloads upon process restart.
4. Operational General Switch:
   - Add general switch configuration `wbp_integration_mode` with values `off` (default), `observe`, `auto`.
   - When `off`: system is 100% inert. 0 outbound requests to WBP, 0 timers/polling active, callbacks return HTTP 200 `{ ErrorCode: 1031, Error: "Integration disabled" }` without saving bookings.
5. WBP Client:
   - Implement `client.mjs` in `artifacts/api-server/wbp/client.mjs` and mirror byte-to-byte in `scripts/wbp/client.mjs`.
   - Implements outbound endpoints: HealthCheck, SetupProperty, GetRoomTypes, GetRatePlans, ARIUpdate, GetBookingList, GetBookingId, AckBooking.
   - Uses UUID v4 `guid` per request, attaches required auth fields, handles timeouts, retries, and errors (1001, 1002, 1102).
6. Local WBP Simulator:
   - Implement `e2e/wbp-simulator/server.mjs` (Express/HTTP server).
   - Validates requests against OpenAPI schemas from `wbpAPI.yaml` (with tolerant mode for errata E1-E10).
   - Supports injection API: inject new, modified, cancelled bookings.
   - Supports programmable failure modes: error codes 1001, 1002, 1102, timeouts.
   - Handles form-urlencoded `NotifyBooking`.
7. Twin Files Parity:
   - Ensure byte-for-byte SHA-256 parity between `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`, and between all corresponding files in `artifacts/api-server/wbp/` and `scripts/wbp/`.
8. Targeted Test:
   - Create `tests/wbp-integration/m1-safety-simulator.test.mjs` running under `node --test` with isolated port and `DATABASE_URL` removed.
   - Test: switch `off` leaves simulator calls at 0, no timers.
   - Test: 5x callback + 3x polling concurrent delivery produces exactly 1 record.
   - Test: unprocessed raw payload is picked up on restart.
   - Test: raw payload survives pruneDatabase.
   - Test: simulator validates against OpenAPI schemas and injects errors 1001/1002/1102 and timeouts.
   - Execute ONLY this targeted test command. NEVER run global test suites!

Your write ownership:
`render.yaml`, `package.json`, `server.mjs`, `artifacts/api-server/wbp/*`, `scripts/wbp/*`, `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `e2e/wbp-simulator/*`, `tests/wbp-integration/m1-safety-simulator.test.mjs`.

Write your findings and test execution proof in `progress.md` and complete handoff to `handoff.md` in your working directory. Send a completion message to orchestrator.

## 2026-10-13T22:23:19Z
**Context**: Milestone 1 Implementation - Preservação de Documentação e Branch.
**Content**: ATENÇÃO: Diretrizes mandatórias do usuário:
1. Estamos e devemos permanecer exclusivamente na branch `feature/wbp-integration`. NUNCA commitar ou fazer push na `main`. Sempre confirmar `git branch --show-current` antes de commitar.
2. Não sobrescrever arquivos de projetos anteriores na raiz (`PROJECT.md`, `TEST_INFRA.md`, etc.). O `PROJECT.md` desta integração está isolado em `docs/integracoes/webbookingpro/PROJECT.md`.
3. As 11 linhas não commitadas de `artifacts/api-server/audit_logs.jsonl` DEVEM ser preservadas e incluídas no primeiro commit da branch.
**Action**: Siga com a implementação de M1 respeitando essas regras.
