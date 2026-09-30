# Project: External Service Provider Management Module (Guest-Flow-Manager)

## Architecture
- **Backend Architecture**: Node.js/Express monolith in `artifacts/api-server/demo-server.mjs` mirrored identically to `scripts/demo-server.mjs`. In-memory `db` initialized at line ~2630 (`loadDatabase()`), persisted synchronously via `saveDatabase()` (line ~3680). Root keys `serviceOrders: []` and `serviceWorkers: []` in `data/database.json`.
- **Auth & Route Insertion**: Admin auth via `getAuthUser(req)` (line ~3858). Routes inserted at line ~7587 (between periodic tasks and observations).
- **Service Integration Endpoints**:
  - `GET /api/flats`: inject `serviceInProgress: { serviceTitle, workerName, serviceOrderId } | null`.
  - `GET /api/reservations/checkouts`: inject `serviceInProgress` on flat items (feeds maid dashboard).
  - `GET /api/pms/calendar`: inject synthetic service blocks into `data.blocks` (`isServiceBlock: true, reason: "service_order"`).
- **Frontend Architecture**: React 18 SPA with Vite, Wouter routing, Tanstack Query v5, Tailwind CSS, Radix UI / shadcn/ui.
  - Admin management: `artifacts/limpeza/src/pages/service-orders.tsx` with `<AdminRoute path="/servicos" component={ServiceOrders} moduleName="a Gestão de Ordens de Serviço" />` and sidebar entry under `🧹 Governança & Camareiras`.
  - Worker portal: `artifacts/limpeza/src/pages/service-worker-portal.tsx` with public `<Route path="/servico/:token" component={ServiceWorkerPortal} />`.
  - Maid dashboard: `artifacts/limpeza/src/components/flat-card.tsx` badge and cleaning button lock.
  - PMS calendar: `artifacts/limpeza/src/pages/pms-calendar.tsx` visual block and reservation conflict warning.
- **Image Compression**: `artifacts/limpeza/src/lib/image-compression.ts` (`compressImage`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | DB Structure (R1) | Add `serviceOrders: []` and `serviceWorkers: []` to `data/database.json` and server startup | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Backend Admin Endpoints (R2) | CRUD + progress endpoints for `/api/service-orders` requiring admin auth | M1 | ORIGINAL_REQUEST §R2 |
| 3 | Backend Public Endpoints (R2) | Public endpoints for `/api/service/public/:token/*` (details, register, start, finish, photos) | M1 | ORIGINAL_REQUEST §R2 |
| 4 | Flats & Checkout API Service Status (R2/R6) | Include `serviceInProgress` in both `GET /api/flats` and `GET /api/reservations/checkouts` | M1 | ORIGINAL_REQUEST §R2, §R6 |
| 5 | PMS Calendar Service Blocks (R2/R7) | Include synthetic service blocks in `GET /api/pms/calendar` | M1 | ORIGINAL_REQUEST §R2, §R7 |
| 6 | Start Validations (R3) | Registration check (403), max simultaneous (400), max per day (400), cleanFlatMode evaluation | M1 | ORIGINAL_REQUEST §R3 |
| 7 | Finish Validations & Updates (R3) | Mandatory needsCleaning if clean, photos if requirePhotos, finish timestamp, clear locks | M1 | ORIGINAL_REQUEST §R3 |
| 8 | Multi-channel Notifications (R3) | WhatsApp to admin `5522998505276`, WhatsApp to reception, email to reception, internal push | M1 | ORIGINAL_REQUEST §R3 |
| 9 | Server Mirror Sync (R2) | Keep `scripts/demo-server.mjs` byte-a-byte identical to `artifacts/api-server/demo-server.mjs` | M1 | ORIGINAL_REQUEST §Contexto / §R2 |
| 10 | Admin Page — 3 Tabs (R4) | Create `artifacts/limpeza/src/pages/service-orders.tsx` with List, Create/Edit, Tracking Panel tabs | M2 | ORIGINAL_REQUEST §R4 |
| 11 | Admin Route & Nav (R4) | Add `/servicos` route wrapped in `AdminRoute` in `App.tsx` and sidebar link in `layout.tsx` | M2 | ORIGINAL_REQUEST §R4 |
| 12 | Worker Public Portal (R5) | Create `artifacts/limpeza/src/pages/service-worker-portal.tsx` with identification banner, flat list cards, finish modal | M3 | ORIGINAL_REQUEST §R5 |
| 13 | Worker Public Route (R5) | Add `/servico/:token` public route in `App.tsx` | M3 | ORIGINAL_REQUEST §R5 |
| 14 | Maid Dashboard Integration (R6) | In `flat-card.tsx`: display service badge, disable cleaning button with tooltip | M4 | ORIGINAL_REQUEST §R6 |
| 15 | PMS Calendar Integration (R7) | In `pms-calendar.tsx`: display visual blocked period badge, warn on booking attempt | M4 | ORIGINAL_REQUEST §R7 |
| 16 | Build & Deploy Verification (R8) | Build `artifacts/limpeza`, stage `dist/`, commit and `git push origin main` | M5 | ORIGINAL_REQUEST §R8 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architecture Mapping | 3 parallel explorers to inspect server, DB, frontend, integrations | None | DONE |
| M1 | Backend Data, Endpoints & Logic | R1, R2, R3 in `database.json`, `demo-server.mjs`, `scripts/demo-server.mjs` | M0 | IN_PROGRESS |
| M2 | Admin Management Page & Route | R4: `service-orders.tsx` (3 tabs) and `App.tsx` route | M1 | PLANNED |
| M3 | Public Worker Portal & Route | R5: `service-worker-portal.tsx` and `App.tsx` route | M1 | PLANNED |
| M4 | Dashboard & Calendar Integrations | R6 (`flat-card.tsx`) and R7 (`pms-calendar.tsx`) | M1 | PLANNED |
| M5 | E2E Testing, Build & Push | R8: verification of all acceptance criteria, build `dist/`, commit and push | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Public Service Order API
- `GET /api/service/public/:token`:
  - Returns: `{ success: true, order: { id, title, token, cleanFlatMode, maxSimultaneousFlats, maxFlatsPerDay, requirePhotos, estimatedDurationHours, instructionFormat, flats: [...] }, worker: { id, mainWorker, collaborators } | null }`
- `POST /api/service/public/:token/register`:
  - Body: `{ mainWorker: { name: string, cpf: string }, collaborators: Array<{ name: string, cpf: string }> }`
  - Returns: `{ success: true, worker: { id, serviceOrderId, token, mainWorker, collaborators, registeredAt } }`
- `POST /api/service/public/:token/flats/:flatId/start`:
  - Returns: `{ success: true, flat: {...} }` or error (403 unverified, 400 limit reached, 400 clean flat blocked)
- `POST /api/service/public/:token/flats/:flatId/finish`:
  - Body: `{ observations: string, needsCleaning?: boolean, photos: string[] }`
  - Returns: `{ success: true, flat: {...} }`
- `POST /api/service/public/:token/flats/:flatId/photos`:
  - Body: `{ photo: string (data URL or base64) }` or multipart
  - Returns: `{ success: true, url: string }`

### Code Layout
- Backend Monolith: `artifacts/api-server/demo-server.mjs`
- Backend Mirror: `scripts/demo-server.mjs`
- Database: `data/database.json`
- Notification modules: `artifacts/api-server/zapi-service.mjs`, `artifacts/api-server/mail-service.mjs`
- Frontend Pages: `artifacts/limpeza/src/pages/service-orders.tsx`, `artifacts/limpeza/src/pages/service-worker-portal.tsx`
- Frontend Components: `artifacts/limpeza/src/components/flat-card.tsx`, `artifacts/limpeza/src/pages/pms-calendar.tsx`
- Routing: `artifacts/limpeza/src/App.tsx`
- Navigation: `artifacts/limpeza/src/components/layout.tsx`
- Build Output: `artifacts/limpeza/dist/`
