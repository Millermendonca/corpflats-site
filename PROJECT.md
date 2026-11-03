# Project: Guest-Flow-Manager Performance & Stability Optimizations (Priorities 1 to 3)

## Architecture
Guest-Flow-Manager is a hospitality operations platform for CorpFlats.
- **Frontend**: Vite + React SPA in `artifacts/limpeza/` with Wouter routing and TanStack Query. Built output is emitted to `artifacts/limpeza/dist/public/` (`index.html`, `assets/index.js`, `assets/index.css`, chunked JS files).
- **Backend**: Express-based Node.js monolith with dual twin files: `artifacts/api-server/demo-server.mjs` (booted via `server.mjs`) and mirror `scripts/demo-server.mjs`. Integrates in-memory JSON state synchronized to PostgreSQL `system_store (key='db_state')`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Smart Asset Caching | Server headers in `demo-server.mjs`: `public, max-age=31536000, immutable` for hashed chunks; `no-cache` + ETag for unhashed (`index.js`, `index.css`); `no-store` strictly for `index.html` and `sw.js`. | M1 | Survey / R1 |
| 2 | Vite Chunking Config | Configure Rollup output in `vite.config.ts`: `entryFileNames: 'assets/index.js'` and `chunkFileNames: 'assets/[name]-[hash].js'`. | M1 | Survey / R1 |
| 3 | App.tsx Code Splitting | Convert 15 heavy operational pages in `artifacts/limpeza/src/App.tsx` to `lazyWithRetry`, keeping `Login` and `NotFound` static. Drops initial `index.js` from 2.4 MB to ~250 KB. | M1 | Survey / R1 |
| 4 | Non-blocking Route Guards | Session cache (`gfm_auth_user_session_v1`) pre-hydrating TanStack Query on boot + `useSessionUser()` and `.preload()` on route components to download chunks in parallel with session validation. | M1 | Survey / R1 |
| 5 | PMS Calendar On-Demand Mount | In `floating-new-reservation.tsx`, replace static import of `PmsCalendar` with `React.lazy`, mount on-demand only when `isModalMounted` is true with `autoOpenNewRes`, and unmount after a 300ms transition delay. | M2 | Survey / R2 |
| 6 | PMS Calendar Polling & Tab Pause | In `pms-calendar.tsx`, reduce polling from 4s to 12s, clear interval when tab is hidden (`document.hidden`), resume on focus, and deactivate polling & initial fetch when `modalOnly && !resModalOpen`. | M2 | Survey / R2 |
| 7 | PMS Calendar Heavy Computations Guard | In `pms-calendar.tsx`, wrap `daysInView`, `gridTemplateColumns`, `totalGridMinWidth`, `dayLayoutMap`, and filter metrics (`reservationsTodayWithBf`, `displayedFlats`, etc.) in `useMemo` with early exit returning empty/0 when `modalOnly`. | M2 | Survey / R2 |
| 8 | Guest Reconcile Cooldown & Dirty Flag | In `demo-server.mjs`, remove synchronous `reconcileAndMergeGuests` from GET requests (`/api/pms/guests`, etc.) using a 60s cooldown and dirty flag (`isGuestReconciliationDirty`). | M3 | Survey / R2 |
| 9 | Universal Integrity Cooldown & Async Save | In `demo-server.mjs`, remove synchronous `reconcileUniversalIntegrity` from GET requests (`/api/flats`, `/api/reservations/checkouts`) using a 30s cooldown and dirty flag, replacing synchronous `saveDatabase()` with `setImmediate`. | M3 | Survey / R2 |
| 10 | RequestsForDate Memoization & Flat Status Batching | In `demo-server.mjs`, add a 3-second memoization cache (`requestsForDateCache`) to `getRequestsForDate` and pass precomputed daily requests in `getFlatRealtimeStatus` from `GET /api/flats`. | M3 | Survey / R2 |
| 11 | O(1) Periodic Task & Housekeeping Regularization | In `demo-server.mjs`, index `periodicExecutions` by `${taskId}_${flatId}`, index reservations by flat, and add a once-per-day guard to `regularizeHousekeepingPreventiveTasks`. | M3 | Survey / R2 |
| 12 | flushPgState Event Loop Yield & Surrogate Fast-Path | In `demo-server.mjs`, add fast-path check in `sanitizeJsonSerialized` (bypassing backtracking regex when surrogate-free), yield event loop via `setImmediate` before CPU/IO steps, and add GC hints. | M3 | Survey / R3 |
| 13 | Residual Base64 Detection & Pruning Optimization | In `demo-server.mjs`, detect pure Base64 strings in `walkAndOffloadResidualDataUrls`, yield to event loop during tree traversal, pre-extract sort keys in `pruneDatabase()`, and truncate deep audit log details. | M3 | Survey / R3 |
| 14 | Build, Verification & Version Control | Verify `npm run build` in `artifacts/limpeza` produces valid `dist/`, verify strictly targeted tests, commit with `dist/` included, and `git push` to remote origin. | M4 | Survey / R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Frontend Bundle, Lazy Loading & Cache | Features 1, 2, 3, 4 (`demo-server.mjs` asset caching, `vite.config.ts`, `App.tsx` lazy pages and non-blocking guards) | Survey completed | DONE |
| 2 | M2: Frontend UI Performance in PMS Components | Features 5, 6, 7 (`floating-new-reservation.tsx` on-demand mount, `pms-calendar.tsx` polling reduction, visibility pause, and computation guards) | Survey completed | DONE |
| 3 | M3: Backend Latency & Persistence Stability | Features 8, 9, 10, 11, 12, 13 (`demo-server.mjs` and mirror `scripts/demo-server.mjs` reconcile cooldowns, requests memoization, O(1) task indexing, `flushPgState` yields/fast-path, Base64 offloading and pruning) | Survey completed | DONE |
| 4 | M4: Integration, Build Verification & Git Push | Feature 14 (Frontend `npm run build`, targeted tests pass, twin server hash match, git commit and push) | M1, M2, M3 | DONE |

## Interface Contracts

### M1 ↔ M2: Floating Button & PMS Calendar Code Splitting
- In `artifacts/limpeza/src/components/floating-new-reservation.tsx`, `PmsCalendar` MUST be imported dynamically via `React.lazy` (`const PmsCalendarLazy = lazy(() => import('@/pages/pms-calendar'))`).
- Props passed: `<PmsCalendarLazy modalOnly autoOpenNewRes />` wrapped in `<Suspense fallback={null}>`.
- Mounted only when `isModalMounted` is true. `App.tsx` imports `PmsCalendar` via `lazyWithRetry`. This ensures Rollup splits `pms-calendar` into its own chunk (`assets/pms-calendar-[hash].js`), keeping `assets/index.js` under ~300 KB.

### M1 ↔ M3: Static Asset Serving & Twin Server Parity
- `setSmartAssetCacheHeaders` in `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs`:
  - `fileName === 'index.html' || fileName === 'sw.js'`: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
  - `/-[a-zA-Z0-9_-]{6,}\.(js|mjs|css|...)$/`: `Cache-Control: public, max-age=31536000, immutable`
  - Unhashed files (`index.js`, `index.css`, `manifest.json`, etc.): `Cache-Control: no-cache` with ETag validation.
- `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` must maintain 100% hash parity.

### M3 ↔ Frontend: Zero Breaking Changes on API Schemas
- Cooldowns and dirty flags on `/api/pms/guests`, `/api/flats`, and `/api/reservations/checkouts` preserve exact existing JSON response schemas.
- Synchronous `saveDatabase()` triggers replaced with `setImmediate(() => saveDatabase(...))`.

## Code Layout
- `artifacts/limpeza/vite.config.ts`: Vite build configuration.
- `artifacts/limpeza/src/App.tsx`: Root SPA routing, `lazyWithRetry`, route guards.
- `artifacts/limpeza/src/components/floating-new-reservation.tsx`: Global new reservation button.
- `artifacts/limpeza/src/pages/pms-calendar.tsx`: PMS calendar matrix, timeline, polling.
- `artifacts/api-server/demo-server.mjs`: Backend server API routes, database state, persistence.
- `scripts/demo-server.mjs`: Mirror twin backend server.
- `artifacts/limpeza/dist/public/`: Production compiled bundle.
