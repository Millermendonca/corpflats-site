# Dispatch Task for Explorer 1: Frontend Bundle, Code Splitting & Caching (Prioridade 1)

## Objective
Investigate codebase regarding Priority 1 requirements:
1. Smart asset caching in `artifacts/api-server/demo-server.mjs` and `artifacts/limpeza/vite.config.ts`.
2. Convert 17 heavy pages in `artifacts/limpeza/src/App.tsx` to `lazyWithRetry`.
3. Eliminate sequential waterfall in Route Guards (`AdminGuard`, `DevGuard`, `ReceptionGuard`, `StaffGuard` in `App.tsx`) to prevent blocking chunk downloads while waiting for `/api/auth/me`.

## Authoritative User Request
Read `c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\ORIGINAL_REQUEST.md`.

## Instructions
- Inspect existing implementations of `artifacts/api-server/demo-server.mjs` (static file serving middleware), `artifacts/limpeza/vite.config.ts`, and `artifacts/limpeza/src/App.tsx`.
- Examine how `lazyWithRetry` is implemented (or create a robust pattern for it).
- Examine current guard implementations and session caching mechanisms.
- Produce a structured handoff report at `.agents/teamwork/explorer_1/handoff.md` with:
  - Observation (exact current lines/blocks)
  - Logic Chain & Proposed Fix Strategy (precise edits for Worker)
  - Caveats & Risks
  - Verification Method (how Worker will verify, respecting project rules)
- Send message to orchestrator when completed.


## 2026-11-02T23:18:36Z
Sender: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
Content:
Your identity is teamwork_explorer (Frontend Bundle Explorer).
Your working directory is: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1\
Scope: Prioridade 1 — Frontend Bundle, Code Splitting & Caching.
Investigate:
1. Smart asset caching in `artifacts/api-server/demo-server.mjs` (static file serving middleware) and `artifacts/limpeza/vite.config.ts`.
2. Converting the 17 heavy pages in `artifacts/limpeza/src/App.tsx` to `lazyWithRetry`.
3. Eliminating sequential waterfall in Route Guards (`AdminGuard`, `DevGuard`, `ReceptionGuard`, `StaffGuard` in `App.tsx`) using non-blocking session cache while preserving route protection.
