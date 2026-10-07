# Project: FNRH SERPRO Gov.br Check-in Provider Toggle & Resilient Link Unification

## Architecture
The system consists of three coordinated tiers:
1. **Backend Engine (`artifacts/api-server/demo-server.mjs` & mirror `scripts/demo-server.mjs`)**:
   - Node.js Express server managing reservations, settings, and PMS operations.
   - `scripts/fnrh-serpro-service.mjs`: HTTP client for SERPRO FNRH API v2.4.2 (`POST /reservas`, health check `/dominios/reservas/situacoes`, Basic Auth, `cpf_solicitante`).
   - Centralized helper `getCheckinUrl(reservation, guestIndex, baseUrl, settings)` with <5s timeout guard, automatic fallback to internal check-in, audit log `FNRH_SERPRO_FALLBACK`, and reception alert.
   - Synchronized mirror files: `scripts/demo-server.mjs`, `scripts/zapi-service.mjs`, `scripts/mail-service.mjs`, `scripts/whatsapp-ai-service.mjs`.
2. **Communication & Dispatch Pipeline**:
   - `artifacts/api-server/zapi-service.mjs` (and mirror): WhatsApp templates (`tpl_pre_checkin_reminder`, `tpl_reserva_site_confirmada`, etc.), multi-guest reminders, action buttons.
   - `artifacts/api-server/mail-service.mjs` (and mirror): Confirmation and reminder emails.
   - `artifacts/api-server/whatsapp-ai-service.mjs` (and mirror): Sofia AI and heuristic replies.
   - `POST /api/pms/reservations/:id/resend-checkin-link`: Reception manual resend endpoint.
3. **Frontend Application (`artifacts/limpeza`)**:
   - React 18, Vite, Tailwind CSS, TanStack Query, Radix UI.
   - `src/pages/settings.tsx`: Hero Card with Toggle Switch (`settings.checkinProvider`: `'proprio'` | `'gov_fnrh'`) and SERPRO connection health status badge.
   - `src/lib/checkin-url.ts`: Frontend unified link resolver helper.
   - Copy & Share Buttons: `pms-calendar.tsx`, `reservation-hover-card.tsx`, `reception-tablet.tsx`, `use-quick-messages.ts`.
   - Build destination: `artifacts/limpeza/dist/public`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Settings Persistence & Dynamic Toggle API | Store `settings.checkinProvider` in `data/database.json`, support `PATCH /api/settings` with immediate persistence and live reflection without server restart. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | F2: SERPRO FNRH v2.4.2 Client Service | Implement `scripts/fnrh-serpro-service.mjs` with Basic Auth, environment config, `cpf_solicitante`, `registerReservation(reservation)`, and health check endpoint `GET /api/fnrh-serpro/status`. | M1 | ORIGINAL_REQUEST §R2 |
| 3 | F3: Centralized Helper & Resilient Fallback | Implement `getCheckinUrl(reservation, guestIndex, baseUrl)` in backend: returns Gov.br link when active; returns internal link on 'proprio' or if SERPRO fails/times out (>5s) with audit log and reception alert. | M1 | ORIGINAL_REQUEST §R3 |
| 4 | F4: WhatsApp Trigger & Template Unification | Refactor `zapi-service.mjs` (`resolveWhatsAppTags`, multi-guest, action buttons, button filters) to use `getCheckinUrl` dynamically. | M2 | ORIGINAL_REQUEST §R4 |
| 5 | F5: Email Templates & AI Agent Unification | Refactor `mail-service.mjs` and `whatsapp-ai-service.mjs` to incorporate dynamic `getCheckinUrl`. | M2 | ORIGINAL_REQUEST §R4 |
| 6 | F6: Reception Manual Resend Endpoint | Update `POST /api/pms/reservations/:id/resend-checkin-link` to use `getCheckinUrl`. | M2 | ORIGINAL_REQUEST §R4 |
| 7 | F7: Admin UI Toggle Switch & Health Badge | Implement Toggle Switch and SERPRO connection health status badge in `settings.tsx` with instant TanStack Query mutation. | M3 | ORIGINAL_REQUEST §R1 |
| 8 | F8: Frontend Copy & Share Buttons Unification | Update `pms-calendar.tsx`, `reservation-hover-card.tsx`, `reception-tablet.tsx`, and quick messages to use unified link resolver. | M3 | ORIGINAL_REQUEST §R4 |
| 9 | F9: Frontend Production Build | Execute `npm run build` in `artifacts/limpeza` to generate assets in `dist/public` per `AGENTS.md`. | M3 | AGENTS.md, ORIGINAL_REQUEST §AC |
| 10 | F10: Comprehensive Automated Test Suite | Authored tests in `tests/fnrh-checkin-toggle.test.mjs` verifying all 4 acceptance criteria, fallback resilience, channels, and mirror parity. | M4 | ORIGINAL_REQUEST §AC |
| 11 | F11: Git Synchronization & Verification | Execute git commit and git push to `origin main`. Complete adversarial clearance and forensic integrity audit. | M4 | AGENTS.md, ORIGINAL_REQUEST §AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Engine, SERPRO Client & Fallback Helper | F1, F2, F3 (`database.json`, `demo-server.mjs`, `fnrh-serpro-service.mjs`, `scripts/demo-server.mjs`) | M0 | DONE |
| M2 | Universal Communication Channels & Triggers | F4, F5, F6 (`zapi-service.mjs`, `mail-service.mjs`, `whatsapp-ai-service.mjs`, `scripts/`) | M1 | DONE |
| M3 | Admin UI Toggle, Health Badge & Frontend Links | F7, F8, F9 (`settings.tsx`, `checkin-url.ts`, hover cards, modals, `dist/public`) | M1 | DONE |
| M4 | Comprehensive E2E Testing, Production Build & Git Push | F10, F11 (`tests/fnrh-checkin-toggle.test.mjs`, full test run, build, commit, push, audit) | M1, M2, M3 | DONE |

## Interface Contracts
### Backend Settings ↔ Admin Frontend
- `GET /api/settings`: Returns `{ ...settings, checkinProvider: 'proprio' | 'gov_fnrh', serproConfig: { env, ... } }`.
- `PATCH /api/settings`: Accepts `{ checkinProvider: 'proprio' | 'gov_fnrh' }`. Validates value, mutates `db.settings`, calls `saveDatabase()`, returns updated settings.
- `GET /api/fnrh-serpro/status`: Returns `{ ok: boolean, provider: string, env: string, latencyMs: number, error?: string }`.

### SERPRO Client ↔ Reservations
- `fnrhSerproService.registerReservation(reservation)`:
  - Input: `{ numero_reserva, data_entrada, data_saida, quantidade_hospede_adulto, quantidade_hospede_menor, origem_reserva_id: 'MEIOHOSPEDAGEM' }`
  - Output: `{ serproReservaId: string, link_precheckin: string, situacao_reserva_id: string }`
  - Stored on reservation: `reservation.serproReservaId`, `reservation.serproPrecheckinUrl` (and `reservation.link_precheckin`).

### Helper `getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", db = null)`
- If `provider === 'gov_fnrh'`:
  - If `reservation.serproPrecheckinUrl` (or `reservation.link_precheckin`) is present: returns it.
  - If not present: attempts registration (timeout ≤ 5s). If successful: returns Gov.br link.
  - If registration fails or times out: logs audit event `FNRH_SERPRO_FALLBACK`, sends reception alert via `createNotification`, and returns `${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex}`.
- If `provider === 'proprio'`:
  - Returns `${baseUrl}/pre-checkin/${reservation.code}?guest=${guestIndex}`.

## Code Layout
- `data/database.json`: System persistent state
- `artifacts/api-server/demo-server.mjs`: Core backend Express server
- `scripts/demo-server.mjs`: Synchronized mirror of demo-server.mjs
- `scripts/fnrh-serpro-service.mjs`: SERPRO FNRH v2.4.2 API client
- `artifacts/api-server/zapi-service.mjs` & `scripts/zapi-service.mjs`: WhatsApp messaging engine
- `artifacts/api-server/mail-service.mjs` & `scripts/mail-service.mjs`: Email messaging engine
- `artifacts/api-server/whatsapp-ai-service.mjs` & `scripts/whatsapp-ai-service.mjs`: AI guest assistant
- `artifacts/limpeza/src/pages/settings.tsx`: Admin system settings page
- `artifacts/limpeza/src/lib/checkin-url.ts`: Frontend unified check-in URL utility
- `artifacts/limpeza/dist/`: Production build output
- `tests/fnrh-checkin-toggle.test.mjs`: Acceptance test suite
