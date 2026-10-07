## 2026-10-07T16:00:55Z
You are teamwork_preview_explorer (Explorer M1_3 - Resilient Helper Specialist).
Your working directory: c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_3
Parent conversation ID: 0a1ba31b-b6bc-466b-8394-2ba72ae85fb5

MANDATORY: Read the authoritative request at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/ORIGINAL_REQUEST.md (specifically the latest entry from 2026-10-07T15:33:29Z).

Read the Project Plan at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/orchestrator_2/PROJECT.md
and backend survey at:
c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_survey_backend_2/survey_backend.md

YOUR MISSION FOR MILESTONE 1 (Feature 3):
Design the exact specification and implementation plan for the Centralized Helper `getCheckinUrl` and its Resilient Fallback Engine:
1. Exact helper signature and implementation in `artifacts/api-server/demo-server.mjs` (and mirror `scripts/demo-server.mjs`):
   - `getCheckinUrl(reservation, guestIndex = 1, baseUrl = "", dbInstance = null)`
   - Provider check: read `db.settings.checkinProvider`. If `'proprio'`, return `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`.
   - If `'gov_fnrh'`:
     - Check if `reservation.serproPrecheckinUrl` or `reservation.link_precheckin` exists. If so, return it.
     - If not exists or if registration is needed on the fly: attempt registration with strict 5-second timeout.
     - If registration succeeds: update reservation with `serproReservaId` and `serproPrecheckinUrl`, save database, and return Gov.br link.
     - If registration throws or times out (> 5000ms): activate intelligent fallback immediately.
       - Log audit event: `logAuditEvent("FNRH_SERPRO_FALLBACK", { reservationCode: reservation.code, guestIndex, error: err.message })`.
       - Create reception notification: `createNotification("alerta", "Falha SERPRO FNRH: Check-in fallback ativado para reserva " + reservation.code, { reservationId: reservation.id })`.
       - Return internal URL without throwing any error: `${baseUrl}/pre-checkin/${reservation.code || reservation.id}?guest=${guestIndex || 1}`.
   - Synchronous vs Asynchronous handling: document how `getCheckinUrl` works in both sync template rendering and async routes.
2. Write your implementation blueprint to:
   `c:/Users/mille/OneDrive/Hotel/Documentos hóspedes/Guest-Flow-Manager/.agents/teamwork/explorer_m1_3/blueprint_fallback_helper.md`
   and write a complete `handoff.md` in your working directory.
3. Send a message to parent (0a1ba31b-b6bc-466b-8394-2ba72ae85fb5) when complete. Do NOT write source code or run build commands.
