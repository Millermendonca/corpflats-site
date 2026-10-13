# BRIEFING — 2026-10-13T22:36:00Z

## Mission
Implement Milestone 1 (Operational Safety, Storage & WBP Simulator) for WebBookingPro integration in Guest-Flow-Manager with complete integrity, twin-file parity, durable insert-only raw storage, general switch, robust WBP client, and OpenAPI-validated local WBP simulator.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\worker_m1
- Original parent: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Milestone: Milestone 1: Operational Safety, Storage & WBP Simulator

## 🔒 Key Constraints
- DO NOT CHEAT: All implementations genuine, no hardcoded test expectations, no dummy facades.
- AGENTS.md rules: Always `git push -u origin <branch>` on commits; NEVER run global test suites or batch tests; ONLY run targeted tests (`tests/wbp-integration/m1-safety-simulator.test.mjs`).
- Never commit to `main`; work exclusively on `feature/wbp-integration`.
- Preserve the 11 uncommitted audit log lines in `artifacts/api-server/audit_logs.jsonl`.
- Memory limit update to `--max-old-space-size=1536` across `render.yaml`, `package.json`, and `server.mjs`.
- Durable raw storage outside PostgreSQL `system_store` JSONB blob, immune to `pruneDatabase`; dedicated JSONL file in local/test mode.
- Idempotency tracking for 1x processing even with 5x callback + 3x polling concurrent arrivals.
- General switch `wbp_integration_mode` (`off`, `observe`, `auto`) where `off` is 100% inert.
- Twin-file parity: byte-for-byte SHA-256 match between `artifacts/api-server/wbp/*` and `scripts/wbp/*`, and demo-servers.
- Isolation: `tests/wbp-integration/m1-safety-simulator.test.mjs` runs with isolated port and `DATABASE_URL` removed.

## Current Parent
- Conversation ID: 84d9f696-67d5-4529-bec4-c0232e9abea0
- Updated: 2026-10-13T22:36:00Z

## Task Summary
- **What to build**:
  1. Git setup: switch to `feature/wbp-integration`, preserve audit logs. [COMPLETED]
  2. Increase node heap size limit to 1536MB in `render.yaml`, `package.json`, `server.mjs`. [COMPLETED]
  3. Implement `storage.mjs` (in `artifacts/api-server/wbp/storage.mjs` and `scripts/wbp/storage.mjs`) for raw payload insert-only storage, idempotency, restart replay, and pruning immunity. [COMPLETED]
  4. Implement `config.mjs` and `callbacks.mjs` for general switch and callback handling. [COMPLETED]
  5. Implement `client.mjs` (in `artifacts/api-server/wbp/client.mjs` and `scripts/wbp/client.mjs`) for outbound WBP endpoints with auth, guid, retries, and timeout management. [COMPLETED]
  6. Implement `e2e/wbp-simulator/server.mjs` and `schemas/index.mjs` with schema validation, injection endpoints, and failure modes. [COMPLETED]
  7. Twin files byte-for-byte SHA-256 parity maintained 100%. [COMPLETED]
  8. Targeted test suite `tests/wbp-integration/m1-safety-simulator.test.mjs` created and passing (13/13 tests, 0 failures). [COMPLETED]
- **Success criteria**: All targeted tests pass; twin files have identical SHA-256; git pushed to `feature/wbp-integration`.
- **Interface contracts**: `docs/integracoes/webbookingpro/PROJECT.md`.
- **Code layout**: `artifacts/api-server/wbp/`, `scripts/wbp/`, `e2e/wbp-simulator/`, `tests/wbp-integration/`.

## Key Decisions Made
- `wbp_raw_payloads` and `wbp_idempotency` implemented outside the PostgreSQL `system_store` blob and outside `db` memory collections, providing absolute immunity to `pruneDatabase()`.
- Local/test mode uses append-only JSONL file (`data/wbp_raw_payloads.jsonl`) and dedicated atomic JSON store for idempotency.
- In-flight mutex (`claimForProcessing`) guarantees that concurrent requests (e.g. 5x callback + 3x polling) result in exactly 1 processed record and 7 deduplications.
- `WBPClient` checks operational general switch: when `off`, prevents network fetch, resulting in 0 outbound requests.
- Retries on transient errors reuse the exact same UUID v4 `guid` across all attempts.
- Inbound callbacks use timing-safe comparison (`crypto.timingSafeEqual`) on `shared_secret`.
- Local WBP Simulator supports full OpenAPI validation, programmable failure modes (1001, 1002, 1102, delays, timeouts), and injection APIs.

## Artifact Index
- `.agents/teamwork/worker_m1/DISPATCH.md` — Assignment instructions
- `.agents/teamwork/worker_m1/BRIEFING.md` — Agent working memory
- `.agents/teamwork/worker_m1/progress.md` — Liveness & progress tracking
- `.agents/teamwork/worker_m1/handoff.md` — Final handoff report
- `artifacts/api-server/wbp/storage.mjs` & `scripts/wbp/storage.mjs` — Durable raw storage & idempotency engine
- `artifacts/api-server/wbp/config.mjs` & `scripts/wbp/config.mjs` — WBP configuration & operational general switch
- `artifacts/api-server/wbp/client.mjs` & `scripts/wbp/client.mjs` — Outbound WBP API client
- `artifacts/api-server/wbp/callbacks.mjs` & `scripts/wbp/callbacks.mjs` — Inbound callbacks & background worker
- `e2e/wbp-simulator/server.mjs` — Local WBP Simulator server
- `e2e/wbp-simulator/schemas/index.mjs` — OpenAPI schema validator
- `tests/wbp-integration/m1-safety-simulator.test.mjs` — Targeted Milestone 1 test suite

## Change Tracker
- **Files modified**: `render.yaml`, `package.json`, `server.mjs`, `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `artifacts/api-server/audit_logs.jsonl` (preserved).
- **Files added**: `artifacts/api-server/wbp/*`, `scripts/wbp/*`, `e2e/wbp-simulator/*`, `tests/wbp-integration/m1-safety-simulator.test.mjs`, `docs/wbp/*`.
- **Build status**: PASS (13/13 tests passing in targeted suite).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: 13/13 passed (100%), 0 failed, duration ~6s.
- **Lint status**: Clean.
- **Tests added/modified**: `tests/wbp-integration/m1-safety-simulator.test.mjs`.

## Loaded Skills
- None
