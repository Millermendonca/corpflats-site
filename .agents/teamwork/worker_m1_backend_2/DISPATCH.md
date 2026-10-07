## 2026-10-07T16:14:25Z

You are teamwork_preview_worker (Worker M1 Backend Implementer).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1_backend_2
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read the blueprints prepared by the technical design team:
1. SERPRO Client Service: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_1/blueprint_serpro_service.md
2. Settings & Persistence: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_2/blueprint_settings_persistence.md
3. Resilient Helper & Fallback: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_3/blueprint_fallback_helper.md
Project plan: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md

YOUR EXCLUSIVE FILE OWNERSHIP:
- `data/database.json`
- `scripts/fnrh-serpro-service.mjs` (and twin `artifacts/api-server/fnrh-serpro-service.mjs`)
- `artifacts/api-server/demo-server.mjs`
- `scripts/demo-server.mjs` (MUST remain 100% byte-for-byte identical to `artifacts/api-server/demo-server.mjs`!)

TASKS TO IMPLEMENT:
1. Implement `scripts/fnrh-serpro-service.mjs` (and keep twin in `artifacts/api-server/fnrh-serpro-service.mjs` identical):
   - Full SERPRO FNRH v2.4.2 API client with Basic Auth, `cpf_solicitante`, environment config (`homologacao` / `producao`), `registerReservation(reservation)`, `checkHealth()`, timeout of 5000ms with AbortController, and mock support when credentials not active or in test mode.
2. Initialize `settings.checkinProvider: "proprio"` in `data/database.json`.
3. In `artifacts/api-server/demo-server.mjs`:
   - Import `fnrhSerproService`.
   - Default `db.settings.checkinProvider = "proprio"`.
   - In `loadDatabase`, shield and restore `checkinProvider` and `serproConfig` from cloud PostgreSQL snapshot if present.
   - Update `PATCH /api/settings` to validate and accept `checkinProvider` ('proprio' | 'gov_fnrh') and `serproConfig`, call `saveDatabase()`, and return updated settings with 200.
   - Implement route `GET /api/fnrh-serpro/status`: calls `fnrhSerproService.checkHealth()`, returns `{ ok, provider: db.settings.checkinProvider, env, latencyMs, ... }`.
   - Implement `getCheckinUrl(reservation, guestIndex, baseUrl, dbInstance)` and `getCheckinUrlSync(reservation, guestIndex, baseUrl, dbInstance)` per blueprint:
     - Returns Gov.br link if `gov_fnrh` and present or registered.
     - On timeout (>5s) or error: triggers fallback, logs `FNRH_SERPRO_FALLBACK` audit event, creates reception notification alert, and returns internal URL (`${baseUrl}/pre-checkin/${code}?guest=${guestIndex}`).
     - Returns internal URL if `proprio`.
   - In reservation creation routes (`POST /api/pms/reservations`, `POST /api/reservations/direct-booking`): when `gov_fnrh` is active, register with SERPRO and attach `serproReservaId` and `serproPrecheckinUrl` / `link_precheckin`.
   - In `POST /api/pms/reservations/:id/resend-checkin-link`: use `getCheckinUrl`.
4. Synchronize `scripts/demo-server.mjs` with `artifacts/api-server/demo-server.mjs` so they are **100% byte-for-byte identical**.
5. Verification:
   - Run syntax check: `node --check artifacts/api-server/demo-server.mjs` and `node --check scripts/demo-server.mjs`.
   - Verify byte-for-byte identity of the twin files (using `node -e "const fs=require('fs'); console.log(fs.readFileSync('artifacts/api-server/demo-server.mjs').equals(fs.readFileSync('scripts/demo-server.mjs')));"`).
   - Document verification results in your report.
6. Write your handoff report to `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/worker_m1_backend_2/handoff.md`.
7. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete.
