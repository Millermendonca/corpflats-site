# Orchestration Plan — Guest-Flow-Manager Optimization

## Objective
Execute all modifications proposed for Guest-Flow-Manager across Priorities 1 to 3 in parallel:
- Prioridade 1: Eliminating white screens and "Carregando módulo..." via smart asset caching, lazy loading with retry for 17 heavy routes, non-blocking auth guards.
- Prioridade 2: Eliminating UI lag when opening screens via on-demand PMS Calendar modal loading, polling interval reduction (10s-15s) and document.hidden pause.
- Prioridade 2 & 3: Eliminating backend latency on GET routes (dirty flag / cooldown for reconciliation, getRequestsForDate deduplication, O(1) periodic tasks) and ensuring Node.js/PostgreSQL stability on Render (flushPgState optimization, Base64 offloading, database pruning).
- Compliance: Strict adherence to git push on commit, npm run build in artifacts/limpeza with dist included, no global/batch test execution, strictly targeted tests only.

## Step-by-Step Execution Plan

### Phase 1: Survey & Technical Investigation (Parallel Explorers)
- Dispatch 3 Explorers in parallel:
  - Explorer 1 (Frontend Bundle & Cache): Investigate `artifacts/limpeza/vite.config.ts`, `artifacts/limpeza/src/App.tsx`, and asset caching in `artifacts/api-server/demo-server.mjs`.
  - Explorer 2 (Frontend Component Optimization): Investigate `artifacts/limpeza/src/components/floating-new-reservation.tsx` and `pms-calendar.tsx`.
  - Explorer 3 (Backend Performance & Stability): Investigate `artifacts/api-server/demo-server.mjs` regarding GET routes, reconciliation, periodic tasks, `flushPgState`, Base64 offload, and `pruneDatabase`.
- Aggregate reports into `PROJECT.md`.

### Phase 2: Implementation (Workers)
- Worker 1: Execute Priority 1 changes (Asset caching in server/vite, lazyWithRetry for 17 pages in App.tsx, non-blocking auth guards).
- Worker 2: Execute Priority 2 frontend changes (On-demand mount of PmsCalendar in floating-new-reservation, polling interval 10s-15s & hidden tab pause in pms-calendar.tsx).
- Worker 3: Execute Priority 2 & 3 backend changes in demo-server.mjs (Cooldown/dirty flag for reconciliation, deduplicate getRequestsForDate, O(1) task status/regularization, flushPgState event loop yield/chunking, Base64 offload & pruning enhancements).

### Phase 3: Review, Challenge & Forensic Audit
- Dispatch Reviewers to inspect code changes across frontend and backend.
- Dispatch Challengers to verify build, component rendering logic, non-blocking flows, and backend logic.
- Dispatch Forensic Auditor to verify genuine implementation and compliance with project rules.

### Phase 4: Build Verification, Commit & Push
- Require Worker to run `npm run build` in `artifacts/limpeza`.
- Check that `dist/` is generated and error-free.
- Verify punctual test execution rules (no batch tests).
- Execute git commit and git push to remote origin.
- Present final report to user/parent.
