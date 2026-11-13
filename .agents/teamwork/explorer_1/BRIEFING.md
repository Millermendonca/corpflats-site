# BRIEFING — 2026-11-02T23:28:00Z

## Mission
Frontend Bundle Explorer: Investigate Prioridade 1 requirements: Smart asset caching in `artifacts/api-server/demo-server.mjs` and `artifacts/limpeza/vite.config.ts`, converting 17 heavy pages in `artifacts/limpeza/src/App.tsx` to `lazyWithRetry`, and eliminating sequential waterfall in Route Guards (`AdminGuard`, `DevGuard`, `ReceptionGuard`, `StaffGuard`) using non-blocking session cache while preserving route protection.

## 🔒 My Identity
- Archetype: explorer
- Roles: read-only investigation, backend architecture analysis, twin-server parity verification
- Working directory: c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1
- Original parent: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
- Milestone: Prioridade 1 — Frontend Bundle, Code Splitting & Caching

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source code files
- Do NOT run global test suites
- Adhere strictly to AGENTS.md rules

## Current Parent
- Conversation ID: 960bd884-3e1c-4b5c-abb1-b3a053aa63cc
- Updated: 2026-11-02T23:28:00Z

## Investigation State
- **Explored paths**:
  1. `artifacts/api-server/demo-server.mjs` (lines 57430–57496, 57101–57112, 16375–16445)
  2. `scripts/demo-server.mjs` (twin server parity for static file caching)
  3. `artifacts/limpeza/vite.config.ts` (lines 44–58)
  4. `artifacts/limpeza/src/App.tsx` (lines 14–32, 33–63, 127–260, 285–545, 600–618)
  5. `artifacts/limpeza/src/components/floating-new-reservation.tsx` (lines 5, 210)
  6. `artifacts/limpeza/src/lib/auth-client.ts`
  7. `lib/api-client-react/src/generated/api.ts` (`useGetMe`, `getGetMeQueryKey`)
  8. `tests/service-orders-admin-frontend.test.mjs`
- **Key findings**:
  1. `demo-server.mjs` lines 57433-57439 set `Cache-Control: no-store` on all `/assets`, forcing browser to re-download all JS chunks on every page view. Solution: implement `setSmartAssetCacheHeaders` (`immutable` for hashed chunks, `no-cache` + ETag for unhashed files, `no-store` for `index.html` and `sw.js`).
  2. In `vite.config.ts`, `entryFileNames: 'assets/index.js'` must be kept so existing tests (`assert.ok(fs.existsSync(distJsPath))`) continue passing, while `chunkFileNames: 'assets/[name]-[hash].js'` generates hashed chunks.
  3. In `App.tsx`, 17 static page imports inflated `index.js` to 2.4 MB. Converting 15 heavy operational pages to `lazyWithRetry` drops `index.js` to ~250 KB.
  4. `floating-new-reservation.tsx` statically imports `PmsCalendar` (687 KB). It must be switched to dynamic import / loaded on demand when modal opens.
  5. Route guards in `App.tsx` blocked rendering `<Component />` while `useGetMe()` was in-flight, creating a sequential waterfall. Solution: pre-hydrate React Query `getGetMeQueryKey()` from `sessionStorage`/`localStorage` cache, add `useSessionUser()`, and call `Component.preload?.()` in `useEffect`.
- **Unexplored areas**: None for Prioridade 1 scope.

## Key Decisions Made
- Fully documented complete architecture and line-level implementation plan in `handoff.md`.

## Artifact Index
- c:\Users\mille\OneDrive\Hotel\Documentos hóspedes\Guest-Flow-Manager\.agents\teamwork\explorer_1\handoff.md — Final investigation report
