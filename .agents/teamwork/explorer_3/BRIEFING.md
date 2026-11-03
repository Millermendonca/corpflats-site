# BRIEFING — 2026-11-02T23:36:00Z

## Mission
Investigate and produce comprehensive implementation plan for Backend demo-server.mjs Latency & Stability Optimizations (Priorities 2 and 3).

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_3\
- Original parent: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
- Milestone: Priorities 2 and 3 Backend Performance Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source files
- Strict adherence to project rules: NO global test suite execution (tests/*.test.mjs forbidden)
- Document exact file locations, line numbers, and proposed modifications in handoff.md

## Current Parent
- Conversation ID: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
- Updated: 2026-11-02T23:36:00Z

## Investigation State
- **Explored paths**:
  - `artifacts/api-server/demo-server.mjs`
  - `scripts/demo-server.mjs`
  - `server.mjs`
  - `tests/room-ready-605-dedup-and-pg-surrogate.test.mjs`
  - `tests/challenger-m1-1.test.mjs`
  - `tests/challenger-m4-demographics-ltv.test.mjs`
- **Key findings**:
  1. Identified exact lines for `reconcileAndMergeGuests` (line 11881) and its synchronous calls in 5 GET endpoints (lines 34823, 36408, 36675, 36711, 37012).
  2. Identified exact lines for `reconcileUniversalIntegrity` (line 4967) and its synchronous invocations in `GET /api/flats` (line 17905) and `GET /api/reservations/checkouts` (line 19334).
  3. Identified recursive and duplicate calls to `getRequestsForDate` (line 18668), including 50x loops via `getFlatRealtimeStatus` in `GET /api/flats`.
  4. Identified O(N^2) bottlenecks in `computePeriodicTaskStatus` (line 6118) and `regularizeHousekeepingPreventiveTasks` (line 6205) due to unindexed execution filters and reservation date expansions.
  5. Identified Event Loop locking in `flushPgState` (line 14159) caused by regex in `sanitizeJsonSerialized` (line 14151) and missing event loop yields.
  6. Identified pure Base64 strings slipping past `walkAndOffloadResidualDataUrls` and unoptimized comparator sorting in `pruneDatabase` (line 14245).
- **Unexplored areas**: None within scope. All 5 assigned items investigated and resolved.

## Key Decisions Made
- Designed a non-intrusive dirty flag and cooldown system for `reconcileAndMergeGuests` and `reconcileUniversalIntegrity`.
- Designed a short-lived request-level memoization cache for `getRequestsForDate`.
- Designed O(1) Map lookups for latest periodic executions and flat reservations.
- Designed a fast-path surrogate check in `sanitizeJsonSerialized` bypassing multi-second regex backtracking.
- Flagged the critical test constraint that `tests/room-ready-605-dedup-and-pg-surrogate.test.mjs` uses `extractFunctionSlice` with exact string markers that must not be renamed.

## Artifact Index
- handoff.md — Comprehensive handoff report with exact code references and proposed implementation strategy for the worker agent.
- progress.md — Liveness heartbeat and investigation progress tracking.
