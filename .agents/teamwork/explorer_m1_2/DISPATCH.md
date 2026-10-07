## 2026-10-07T16:01:00Z

You are teamwork_preview_explorer (Explorer M1_2 - Settings & Persistence Specialist).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_2
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read the Project Plan at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md
and backend survey at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_backend_2/survey_backend.md

YOUR MISSION FOR MILESTONE 1 (Feature 1):
Design the exact specification and implementation plan for Settings & Reservation Persistence:
1. `data/database.json`:
   - Initialize `settings.checkinProvider: "proprio"`.
2. `artifacts/api-server/demo-server.mjs` and mirror `scripts/demo-server.mjs`:
   - Line ~560 default `db.settings`: add `checkinProvider: "proprio"`.
   - `loadDatabase` (lines 3371-3530): preserve `pgLoaded.settings?.checkinProvider` on cloud PostgreSQL reload (`system_store`).
   - `PATCH /api/settings` (line 10054): add `checkinProvider` and `serproConfig` validation and persistence, return updated settings with 200.
   - `GET /api/settings`: ensure `checkinProvider` is returned.
   - Route `GET /api/fnrh-serpro/status`: implement endpoint returning `{ ok, provider: db.settings.checkinProvider, env, latencyMs }` by delegating to serpro service health check.
   - Reservation creation (`POST /api/pms/reservations`, `POST /api/reservations/direct-booking`): when `db.settings.checkinProvider === 'gov_fnrh'`, trigger SERPRO registration, persist `serproReservaId` and `link_precheckin` / `serproPrecheckinUrl` on the reservation.
   - Strict mirror parity: guarantee `artifacts/api-server/demo-server.mjs` and `scripts/demo-server.mjs` remain byte-for-byte identical.
2. Write your implementation blueprint to:
   `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_2/blueprint_settings_persistence.md`
   and write a complete `handoff.md` in your working directory.
3. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete. Do NOT write source code or run build commands.
