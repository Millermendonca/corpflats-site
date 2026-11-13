# BRIEFING — 2026-10-07T16:33:00Z

## Mission
Implement SERPRO FNRH v2.4.2 client service, settings persistence, resilient fallback helper, and reservation integration in demo-server.mjs.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1_backend_2
- Original parent: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Milestone: M1 Backend Implementation

## 🔒 Key Constraints
- DO NOT CHEAT: Genuine implementation only.
- Exclusive file ownership:
  - `data/database.json`
  - `scripts/fnrh-serpro-service.mjs` (and twin `artifacts/api-server/fnrh-serpro-service.mjs`)
  - `artifacts/api-server/demo-server.mjs`
  - `scripts/demo-server.mjs` (MUST remain 100% byte-for-byte identical to `artifacts/api-server/demo-server.mjs`)
- `scripts/demo-server.mjs` MUST be 100% byte-for-byte identical to `artifacts/api-server/demo-server.mjs`.
- Always git push on git commit per AGENTS.md rules.
- AbortController timeout 5000ms for SERPRO calls with fallback to internal check-in URL.
- Shield and restore settings during cloud DB synchronization.

## Current Parent
- Conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5
- Updated: not yet

## Task Summary
- **What to build**: Full SERPRO FNRH client (`fnrh-serpro-service.mjs`), checkinProvider & serproConfig settings management, health check endpoint, fallback link resolution, reservation registration hooks, and twin synchronization.
- **Success criteria**: All endpoints functional, timeout/fallback working per spec, syntax checks pass, twin files 100% byte-identical.
- **Interface contracts**: Blueprints at explorer_m1_1, explorer_m1_2, explorer_m1_3; PROJECT.md at orchestrator_2.
- **Code layout**: Backend Node.js ES modules in `scripts/` and `artifacts/api-server/`.

## Key Decisions Made
- Implemented `FnrhSerproClient` with support for Basic Auth, `cpf_solicitante`, environment switching (`homologacao`/`producao`), strict 5000ms AbortController timeout, and mock/simulation controls.
- Kept `scripts/fnrh-serpro-service.mjs` and `artifacts/api-server/fnrh-serpro-service.mjs` 100% byte-for-byte identical.
- Initialized `settings.checkinProvider: "proprio"` and `settings.serproConfig` in `data/database.json` and in in-memory server defaults.
- Added cloud PostgreSQL snapshot shielding in `loadDatabase` to protect `checkinProvider` and `serproConfig` across reboots.
- Made `logAuditEvent` and `createNotification` polymorphic to accept positional or object arguments.
- Added `getCheckinUrl` and `getCheckinUrlSync` with fail-safe fallback, audit logging (`FNRH_SERPRO_FALLBACK`), and reception alerting. Exposed on `globalThis` and exported.
- Added SERPRO registration hook in `POST /api/pms/reservations` and `POST /api/reservations/direct-booking`.
- Integrated `getCheckinUrl` in `POST /api/pms/reservations/:id/resend-checkin-link`.
- Kept `scripts/demo-server.mjs` and `artifacts/api-server/demo-server.mjs` 100% byte-for-byte identical.

## Artifact Index
- DISPATCH.md — Initial task assignment
- BRIEFING.md — Persistent context and tracker
- progress.md — Liveness and step progress
- handoff.md — 5-component handoff report
- tests/m1-backend-serpro-verification.test.mjs — Comprehensive test suite for M1

## Change Tracker
- **Files modified**:
  - `data/database.json`: Added `checkinProvider: "proprio"` and `serproConfig`.
  - `scripts/fnrh-serpro-service.mjs`: New SERPRO FNRH v2.4.2 client implementation.
  - `artifacts/api-server/fnrh-serpro-service.mjs`: Byte-identical twin of `scripts/fnrh-serpro-service.mjs`.
  - `artifacts/api-server/demo-server.mjs`: Imports, db defaults, settings shielding, PATCH /api/settings, GET /api/fnrh-serpro/status, fallback helper, reservation hooks.
  - `scripts/demo-server.mjs`: Byte-identical twin of `artifacts/api-server/demo-server.mjs`.
  - `tests/m1-backend-serpro-verification.test.mjs`: 11 automated verification tests for M1.
- **Build status**: All syntax checks passed; 23 tests in test suites passed (11 M1 tests + 12 service-orders tests).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: PASS (11/11 in `tests/m1-backend-serpro-verification.test.mjs`, 12/12 in `tests/service-orders.test.mjs`).
- **Lint status**: PASS (`node --check` passed with 0 exit code on all modified files).
- **Tests added/modified**: `tests/m1-backend-serpro-verification.test.mjs` added (11 automated tests).

## Loaded Skills
- None specified
