# Execution Plan — External Service Provider Management Module

## Objective
Implement end-to-end the external service provider module (R1 - R8) for Guest-Flow-Manager / CorpFlats, fully compliant with requirements and project guidelines.

## Phase 0: Survey & Codebase Mapping
- Spawn 3 parallel Explorers:
  - **Explorer 1 (Backend & DB)**: Investigate `artifacts/api-server/demo-server.mjs`, `scripts/demo-server.mjs`, `data/database.json`, authentication middleware, notification services (`zapi-service.mjs`, `mail-service.mjs`, audit logs), image upload (`uploadImageToStorage`), and `GET /api/flats`.
  - **Explorer 2 (Frontend Admin & Routing)**: Investigate `artifacts/limpeza/src/App.tsx`, routing setup (`AdminRoute`, `Route`), UI component patterns (shadcn/ui, Tailwind, tabs, forms, modals, tables), and queries / API clients.
  - **Explorer 3 (Integrations & Flat States)**: Investigate `artifacts/limpeza/src/components/flat-card.tsx` (maid card, cleaning action buttons, badges) and `artifacts/limpeza/src/pages/pms-calendar.tsx` (calendar rendering, reservation blocking, room status).

## Phase 1: M1 - Database Structure (R1) & Backend API / Business Logic (R2, R3)
- Explorer confirms precise insertion points in `demo-server.mjs` and structure in `database.json`.
- Worker implements R1, R2, R3:
  - Add root keys `serviceOrders` and `serviceWorkers` in `data/database.json`.
  - Implement admin endpoints (`GET /api/service-orders`, `POST /api/service-orders`, `GET /api/service-orders/:id`, `PATCH /api/service-orders/:id`, `DELETE /api/service-orders/:id`, `GET /api/service-orders/:id/progress`).
  - Implement public endpoints (`GET /api/service/public/:token`, `POST /api/service/public/:token/register`, `POST /api/service/public/:token/flats/:flatId/start`, `POST /api/service/public/:token/flats/:flatId/finish`, `POST /api/service/public/:token/flats/:flatId/photos`).
  - Update `GET /api/flats` with `serviceInProgress`.
  - Implement all business logic (start validation: worker registration check, max simultaneous check, max per day check, cleanFlatMode evaluation; finish validation: mandatory needsCleaning when clean, requirePhotos check, finishedAt update, maid/PMS unlocking, WhatsApp/Email/internal notifications).
  - Sync `scripts/demo-server.mjs` to be byte-for-byte identical with `artifacts/api-server/demo-server.mjs`.
- Reviewers (2) + Challengers (2) + Forensic Auditor (1) gate check.

## Phase 2: M2 - Frontend Admin Management Page (R4) & Routing
- Worker implements `artifacts/limpeza/src/pages/service-orders.tsx`:
  - Tab 1: Service list (cards, status badge, progress bar, copy link, action buttons).
  - Tab 2: Create/edit service (title, cleanFlatMode 3 options with clear explanations, max simultaneous, max per day, photo required toggle, duration hours, 19 flats checkbox grid, instructions apply all / per flat, text/list toggle).
  - Tab 3: Progress tracking panel (live table, status filter, clickable row for photo/notes modal, admin reset flat to pending).
- Add `<AdminRoute path="/servicos" component={ServiceOrders} />` in `artifacts/limpeza/src/App.tsx`.
- Reviewers (2) + Challengers (2) + Forensic Auditor (1) gate check.

## Phase 3: M3 - Public Worker Portal (R5) & Routing
- Worker implements `artifacts/limpeza/src/pages/service-worker-portal.tsx`:
  - Accessible via `/servico/:token` without auth.
  - Identification banner (main worker name + CPF, collaborators list, save button, turns green on success, blocking modal if trying to start flat without ID).
  - Flat list cards (flat number, occupancy status badge, instructions, current status, dynamic action button with reasons when blocked).
  - Finish modal (cleaning warning, needsCleaning radio if clean flat, observations, photo upload max 5, submit).
- Add public route `<Route path="/servico/:token" component={ServiceWorkerPortal} />` in `artifacts/limpeza/src/App.tsx`.
- Reviewers (2) + Challengers (2) + Forensic Auditor (1) gate check.

## Phase 4: M4 - Integrations (R6 Maid Flat Card & R7 PMS Calendar)
- Worker integrates `flat-card.tsx`:
  - Badge "🔧 Serviço em andamento" when `flat.serviceInProgress`.
  - Disable cleaning button with explanatory tooltip.
- Worker integrates `pms-calendar.tsx`:
  - Visual blocked period badge "🔧 [Título do Serviço]".
  - Warning alert when creating reservation during blocked period.
- Reviewers (2) + Challengers (2) + Forensic Auditor (1) gate check.

## Phase 5: M5 - E2E Verification, Build (R8), Commit & Git Push
- Full end-to-end verification against all criteria in `ORIGINAL_REQUEST.md`.
- Run `npm run build` in `artifacts/limpeza`.
- Stage `artifacts/limpeza/dist/`, commit and `git push origin main`.
- Final audit and comprehensive report to parent Sentinel.
