# Dispatch Task for Explorer 3: Backend Latency & Stability Optimizations (Prioridades 2 e 3)

## Objective
Investigate codebase in `artifacts/api-server/demo-server.mjs` regarding Priority 2 (backend) and Priority 3 requirements:
1. Retirar `reconcileAndMergeGuests` e `reconcileUniversalIntegrity` do caminho síncrono de todas as requisições GET (implementar dirty flag / cooldown).
2. Eliminar chamada duplicada de `getRequestsForDate(dateStr)` em `GET /api/reservations/checkouts`.
3. Otimizar `computePeriodicTaskStatus` e `regularizeHousekeepingPreventiveTasks` com indexação/cache O(1).
4. Otimizar `flushPgState()` para prevenir Event Loop starvation e OOM no PostgreSQL.
5. Aprimorar `offloadHistoricalBase64Media()` e `pruneDatabase()` para descarregar payloads Base64 puros e podar históricos/logs excessivos sem travar o Event Loop.

## Authoritative User Request
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.

## Instructions
- Inspect existing implementations in `artifacts/api-server/demo-server.mjs`.
- Pinpoint lines and functions: `reconcileAndMergeGuests`, `reconcileUniversalIntegrity`, `GET /api/pms/guests`, `GET /api/reservations/checkouts`, `computePeriodicTaskStatus`, `regularizeHousekeepingPreventiveTasks`, `flushPgState`, `offloadHistoricalBase64Media`, and `pruneDatabase`.
- Produce a structured handoff report at `.agents/teamwork/explorer_3/handoff.md` with:
  - Observation (exact current lines/blocks)
  - Logic Chain & Proposed Fix Strategy (precise edits for Worker)
  - Caveats & Risks
  - Verification Method (how Worker will verify, respecting project rules)
- Send message to orchestrator when completed.


## 2026-11-02T23:19:16Z
Your identity is teamwork_explorer (Backend Performance Explorer).
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\
Read your task assignment at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\DISPATCH.md
Read the authoritative user request at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md

Scope: Prioridades 2 e 3 — Backend demo-server.mjs Latency & Stability Optimizations.
Investigate:
1. `reconcileAndMergeGuests` and `reconcileUniversalIntegrity`: remove from synchronous path of GET requests (e.g. `GET /api/pms/guests`, `GET /api/reservations/checkouts`) using dirty flag / cooldown mechanism.
2. `GET /api/reservations/checkouts`: eliminate duplicate calls to `getRequestsForDate(dateStr)`.
3. `computePeriodicTaskStatus` and `regularizeHousekeepingPreventiveTasks`: optimize with O(1) indexing/caching instead of O(N^2) loops.
4. `flushPgState()`: optimize state persistence to PostgreSQL to prevent Event Loop starvation and OOM on Render.
5. `offloadHistoricalBase64Media()` and `pruneDatabase()`: improve Base64 offloading and database pruning without locking Event Loop.

Constraints:
- You are READ-ONLY. Do NOT modify source code files.
- Produce your detailed findings and proposed implementation plan at: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\handoff.md
- Structure your report with: Observation (exact lines and current code patterns), Logic Chain & Recommended Strategy, Caveats & Edge Cases, Verification Method.
- Update your progress in: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\progress.md
- When done, send a message to orchestrator via send_message with your handoff summary and report path.
